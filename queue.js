const {
    printPdf,
    getPrintJobs
} = require("./printer");


// ==========================================================
// BROTHER PRINT FARM
// queue.js
// v5.1.6
//
// DYNAMIC ONE-COPY SCHEDULER + MANUAL CONTINUE
//
// - Every selected printer starts with ONE copy.
// - Completion is detected from the Windows print queue.
// - When a printer is done, it STOPS.
// - The next copy is NOT sent automatically.
// - The Windows notification has a Continue button.
// - Pressing Continue gives THAT printer exactly ONE next copy.
// - Then it waits again after that copy finishes.
// - Failed copies retry on the SAME printer up to 3 attempts.
 // - After 3 failed attempts, that printer is disabled for this batch.
 // - The SAME failed copy number is put at the FRONT of recoveryQueue.
 // - Recovery copies are always claimed before new copies.
 // - Completed copy numbers are immutable and can never be printed again.
// ==========================================================


const batches =
    new Map();


const continueWaiters =
    new Map();


let batchCounter =
    0;


let jobCounter =
    0;


const POLL_INTERVAL_MS =
    150;


const JOB_APPEAR_TIMEOUT_MS =
    15000;


const JOB_COMPLETE_TIMEOUT_MS =
    30 * 60 * 1000;

const RETRY_DELAY_MS =
    3000;


const MAX_PRINT_ATTEMPTS =
    3;


// ==========================================================
// HELPERS
// ==========================================================

function createBatchId() {

    batchCounter++;

    return `BATCH-${String(
        batchCounter
    ).padStart(
        4,
        "0"
    )}`;
}


function createJobId() {

    jobCounter++;

    return `JOB-${String(
        jobCounter
    ).padStart(
        5,
        "0"
    )}`;
}


function sleep(ms) {

    return new Promise(
        resolve =>
            setTimeout(
                resolve,
                ms
            )
    );
}


function continueKey(
    batchId,
    printerName
) {

    return `${batchId}::${printerName}`;
}


// ==========================================================
// BATCH
// ==========================================================

function createBatch(data) {

    const uniquePrinters =
        Array.from(
            new Set(
                data.printers || []
            )
        );


    const batch = {

        id:
            createBatchId(),

        filePath:
            data.filePath,

        fileName:
            String(data.filePath || "")
                .replace(/\\/g, "/")
                .split("/")
                .pop(),

        totalCopies:
            data.totalCopies,

        printers:
            uniquePrinters,

        profileId:
            data.profileId || null,

        settings:
            data.settings || null,

        paperSize:
            data.paperSize,

        duplex:
            data.duplex,

        monochrome:
            data.monochrome,

        status:
            "WAITING",

        cancelRequested:
            false,

        cancelledAt:
            null,

        pausedCopyNumbers:
            [],

        recoveryContinueOfferedTo:
            null,

        createdAt:
            new Date().toISOString(),

        startedAt:
            null,

        completedAt:
            null,

        // Next never-before-used requested copy number.
        nextCopyNumber:
            1,

        // Number of UNIQUE requested copies that physically completed.
        copiesCompleted:
            0,

        copiesFailed:
            0,

        // Failed original copy numbers waiting to be produced elsewhere.
        // FRONT has highest priority.
        recoveryQueue:
            [],

        // Immutable list of requested copies already completed.
        completedCopyNumbers:
            [],

        jobs:
            [],

        printerStats:
            {}
    };


    uniquePrinters.forEach(
        printerName => {

            batch.printerStats[
                printerName
            ] = {

                printerName,

                assigned:
                    0,

                completed:
                    0,

                failed:
                    0,

                busy:
                    false,

                waitingForUser:
                    false,

                disabled:
                    false,

                lastCompletedAt:
                    null,

                lastError:
                    null
            };
        }
    );


    batches.set(
        batch.id,
        batch
    );


    console.log(
        `[QUEUE] Created ${batch.id}: ` +
        `${batch.totalCopies} copies, ` +
        `${batch.printers.length} printers`
    );


    return batch;
}


function getBatch(
    batchId
) {

    return batches.get(
        batchId
    );
}


// ==========================================================
// CLAIM NEXT COPY
// ==========================================================

function claimNextCopy(
    batch,
    printerName
) {

    const stats =
        batch.printerStats[
            printerName
        ];


    if (
        !stats ||
        stats.disabled
    ) {

        return null;
    }


    let copyNumber =
        null;


    let isRecovery =
        false;


    // ======================================================
    // RECOVERY ALWAYS WINS
    // ======================================================

    while (
        batch.recoveryQueue.length >
        0
    ) {

        const candidate =
            batch.recoveryQueue.shift();


        if (
            batch.recoveryContinueOfferedTo ===
            printerName
        ) {

            batch.recoveryContinueOfferedTo =
                null;
        }


        if (
            batch.pausedCopyNumbers.includes(
                candidate
            )
        ) {

            batch.recoveryQueue.push(
                candidate
            );


            break;
        }


        // Completed copy numbers are immutable.
        if (
            batch.completedCopyNumbers.includes(
                candidate
            )
        ) {

            continue;
        }


        copyNumber =
            candidate;


        isRecovery =
            true;


        break;
    }


    // ======================================================
    // OTHERWISE CLAIM A BRAND-NEW COPY NUMBER
    // ======================================================

    if (
        copyNumber ===
        null
    ) {

        if (
            batch.nextCopyNumber >
            batch.totalCopies
        ) {

            return null;
        }


        copyNumber =
            batch.nextCopyNumber;


        if (
            batch.pausedCopyNumbers.includes(
                copyNumber
            )
        ) {

            return null;
        }


        batch.nextCopyNumber++;
    }


    // Absolute safety: never recreate a completed copy.
    if (
        batch.completedCopyNumbers.includes(
            copyNumber
        )
    ) {

        console.error(
            `[QUEUE] BLOCKED duplicate completed Copy ${copyNumber}`
        );


        return claimNextCopy(
            batch,
            printerName
        );
    }


    const job = {

        id:
            createJobId(),

        copyNumber,

        printerName,

        copies:
            1,

        isRecovery,

        status:
            "CLAIMED",

        attempts:
            0,

        forceErrorRequested:
            false,

        forceErrorRetryRemaining:
            0,

        forceErrorRetryActive:
            false,

        createdAt:
            new Date().toISOString(),

        submittedAt:
            null,

        completedAt:
            null,

        error:
            null
    };


    batch.jobs.push(
        job
    );


    stats.assigned++;


    console.log(
        `[QUEUE] ${isRecovery ? "RECOVERY " : ""}` +
        `Copy ${copyNumber}/${batch.totalCopies} ` +
        `claimed by "${printerName}"`
    );


    return job;
}


// ==========================================================
// WINDOWS QUEUE SNAPSHOT
// ==========================================================

async function getQueueSnapshot(
    printerName
) {

    const jobs =
        await getPrintJobs(
            printerName
        );


    return {

        count:
            jobs.length,

        ids:
            new Set(
                jobs.map(
                    job =>
                        String(
                            job.ID
                        )
                )
            ),

        jobs
    };
}


function getNewJobIds(
    before,
    after
) {

    return [
        ...after.ids
    ].filter(
        id =>
            !before.ids.has(
                id
            )
    );
}


// ==========================================================
// WAIT FOR PRINTER TO FINISH CURRENT COPY
// ==========================================================
//
// Kept from the working version.
// ==========================================================

async function waitForPrinterToFinishCopy(
    printerName,
    baselineQueue,
    job
) {

    const startedAt =
        Date.now();


    let trackedJobIds =
        [];


    let observed =
        false;


    while (
        Date.now() -
        startedAt <
        JOB_APPEAR_TIMEOUT_MS
    ) {

        if (
            job?.forceErrorRequested
        ) {

            return {
                success:
                    false,

                forcedError:
                    true,

                error:
                    "Force Error: retry this copy once."
            };
        }


        const snapshot =
            await getQueueSnapshot(
                printerName
            );


        const newIds =
            getNewJobIds(
                baselineQueue,
                snapshot
            );


        if (
            newIds.length >
            0
        ) {

            trackedJobIds =
                newIds;


            observed =
                true;


            break;
        }


        if (
            Date.now() -
            startedAt >=
            800
            &&
            snapshot.count <=
            baselineQueue.count
        ) {

            await sleep(
                120
            );


            const stable =
                await getQueueSnapshot(
                    printerName
                );


            if (
                stable.count <=
                baselineQueue.count
            ) {

                return {

                    success:
                        true,

                    jobWasObserved:
                        false,

                    finalQueueCount:
                        stable.count
                };
            }
        }


        await sleep(
            POLL_INTERVAL_MS
        );
    }


    while (
        Date.now() -
        startedAt <
        JOB_COMPLETE_TIMEOUT_MS
    ) {

        if (
            job?.forceErrorRequested
        ) {

            return {
                success:
                    false,

                forcedError:
                    true,

                error:
                    "Force Error: retry this copy once."
            };
        }


        const snapshot =
            await getQueueSnapshot(
                printerName
            );


        const trackedStillPresent =
            trackedJobIds.some(
                id =>
                    snapshot.ids.has(
                        id
                    )
            );


        if (
            !trackedStillPresent
        ) {

            await sleep(
                120
            );


            const stable =
                await getQueueSnapshot(
                    printerName
                );


            const stillGone =
                trackedJobIds.every(
                    id =>
                        !stable.ids.has(
                            id
                        )
                );


            if (
                stillGone
            ) {

                return {

                    success:
                        true,

                    jobWasObserved:
                        observed,

                    finalQueueCount:
                        stable.count
                };
            }
        }


        await sleep(
            POLL_INTERVAL_MS
        );
    }


    return {

        success:
            false,

        error:
            `Timed out waiting for "${printerName}" to finish its copy.`
    };
}


// ==========================================================
// PRINT EXACTLY ONE COPY
// ==========================================================

async function printSingleCopy(
    batch,
    job,
    callbacks = {}
) {

    const printerName =
        job.printerName;


    const stats =
        batch.printerStats[
            printerName
        ];


    stats.busy =
        true;


    stats.waitingForUser =
        false;


    try {

        for (
            let attempt = 1;
            attempt <=
            MAX_PRINT_ATTEMPTS;
            attempt++
        ) {

            job.attempts =
                attempt;


            job.status =
                "SUBMITTING";


            try {

                const baselineQueue =
                    await getQueueSnapshot(
                        printerName
                    );


                const result =
                    await printPdf({

                        filePath:
                            batch.filePath,

                        printerName,

                        copies:
                            1,

                        paperSize:
                            batch.paperSize,

                        duplex:
                            batch.duplex,

                        monochrome:
                            batch.monochrome
                    });


                if (
                    !result.success
                ) {

                    throw new Error(
                        result.error ||
                        "Printer rejected the job."
                    );
                }


                job.status =
                    "PRINTING";


                job.submittedAt =
                    new Date().toISOString();


                const completion =
                    await waitForPrinterToFinishCopy(
                        printerName,
                        baselineQueue,
                        job
                    );


                if (
                    !completion.success
                ) {

                    if (
                        completion.forcedError
                    ) {

                        job.forceErrorRequested =
                            false;


                        job.forceErrorRetryRemaining =
                            0;


                        job.forceErrorRetryActive =
                            false;


                        job.status =
                            "REASSIGNED";


                        job.error =
                            completion.error;


                        job.completedAt =
                            new Date().toISOString();


                        stats.failed++;


                        // Do not give this printer the same copy again
                        // during this batch.
                        stats.disabled =
                            true;


                        stats.waitingForUser =
                            false;


                        batch.copiesFailed++;


                        // The SAME original copy goes to the FRONT
                        // of the recovery queue immediately.
                        if (
                            !batch.completedCopyNumbers.includes(
                                job.copyNumber
                            ) &&
                            !batch.recoveryQueue.includes(
                                job.copyNumber
                            )
                        ) {

                            batch.recoveryQueue.unshift(
                                job.copyNumber
                            );
                        }


                        return {
                            success:
                                false,

                            reassigned:
                                true,

                            forcedError:
                                true,

                            job,

                            error:
                                completion.error
                        };
                    }


                    throw new Error(
                        completion.error
                    );
                }


                // ==============================================
                // SUCCESS
                // ==============================================

                job.status =
                    "COMPLETED";


                job.forceErrorRetryActive =
                    false;


                job.completedAt =
                    new Date().toISOString();


                job.error =
                    null;


                if (
                    !batch.completedCopyNumbers.includes(
                        job.copyNumber
                    )
                ) {

                    batch.completedCopyNumbers.push(
                        job.copyNumber
                    );
                }


                // copiesCompleted can ONLY be unique completed copy numbers.
                batch.copiesCompleted =
                    batch.completedCopyNumbers.length;


                stats.completed++;


                stats.lastCompletedAt =
                    job.completedAt;


                return {

                    success:
                        true,

                    job,

                    completion
                };


            } catch (
                error
            ) {

                job.error =
                    error.message;


                stats.lastError =
                    error.message;


                if (
                    attempt <
                    MAX_PRINT_ATTEMPTS
                ) {

                    job.status =
                        "RETRYING";


                    if (
                        typeof callbacks
                            .onRetryScheduled ===
                        "function"
                    ) {

                        callbacks.onRetryScheduled({

                            batchId:
                                batch.id,

                            jobId:
                                job.id,

                            printerName,

                            copyNumber:
                                job.copyNumber,

                            attempt,

                            nextAttempt:
                                attempt + 1,

                            maxAttempts:
                                MAX_PRINT_ATTEMPTS,

                            retryInSeconds:
                                RETRY_DELAY_MS /
                                1000,

                            error:
                                error.message
                        });
                    }


                    await sleep(
                        RETRY_DELAY_MS
                    );


                    continue;
                }


                // ==============================================
                // RETRY FAILED -> REASSIGN IMMEDIATELY
                // (or normal attempts exhausted)
                // ==============================================

                job.status =
                    "REASSIGNED";


                job.completedAt =
                    new Date().toISOString();


                stats.failed++;


                stats.disabled =
                    true;


                stats.waitingForUser =
                    false;


                batch.copiesFailed++;


                // Put THIS exact original copy at the FRONT.
                if (
                    !batch.completedCopyNumbers.includes(
                        job.copyNumber
                    ) &&
                    !batch.recoveryQueue.includes(
                        job.copyNumber
                    )
                ) {

                    batch.recoveryQueue.unshift(
                        job.copyNumber
                    );
                }


                return {

                    success:
                        false,

                    reassigned:
                        true,

                    job,

                    error:
                        error.message
                };
            }
        }

    } finally {

        stats.busy =
            false;
    }
}


// ==========================================================
// WAIT FOR CONTINUE
// ==========================================================

function waitForContinue(
    batch,
    printerName
) {

    const stats =
        batch.printerStats[
            printerName
        ];


    stats.waitingForUser =
        true;


    batch.status =
        "WAITING_FOR_USER";


    const key =
        continueKey(
            batch.id,
            printerName
        );


    return new Promise(
        resolve => {

            continueWaiters.set(
                key,
                shouldContinue => {

                    continueWaiters.delete(
                        key
                    );


                    stats.waitingForUser =
                        false;


                    if (
                        shouldContinue !==
                        false
                    ) {

                        batch.status =
                            "RUNNING";
                    }


                    resolve(
                        shouldContinue !==
                        false
                    );
                }
            );
        }
    );
}


function clearBatchContinueWaiters(
    batch
) {

    for (
        const printerName
        of batch.printers
    ) {

        const key =
            continueKey(
                batch.id,
                printerName
            );


        const waiter =
            continueWaiters.get(
                key
            );


        if (
            waiter
        ) {

            continueWaiters.delete(
                key
            );


            waiter(
                false
            );
        }


        const stats =
            batch.printerStats[
                printerName
            ];


        if (
            stats
        ) {

            stats.waitingForUser =
                false;
        }
    }
}


// ==========================================================
// CONTINUE EXACTLY ONE PRINTER
// ==========================================================

function continuePrinter(
    batchId,
    printerName
) {

    const batch =
        getBatch(
            batchId
        );


    if (!batch) {

        return {

            success:
                false,

            error:
                "Batch not found."
        };
    }


    const stats =
        batch.printerStats[
            printerName
        ];


    if (!stats) {

        return {

            success:
                false,

            error:
                "Printer is not part of this batch."
        };
    }


    if (
        isBatchComplete(
            batch
        ) ||
        batch.cancelRequested
    ) {

        clearBatchContinueWaiters(
            batch
        );


        return {
            success:
                false,

            error:
                "Batch is already finished."
        };
    }


    if (
        stats.busy
    ) {

        return {

            success:
                false,

            error:
                "Printer is still busy."
        };
    }


    const key =
        continueKey(
            batchId,
            printerName
        );


    const waiter =
        continueWaiters.get(
            key
        );


    if (!waiter) {

        return {

            success:
                false,

            error:
                "Printer is not waiting for Continue."
        };
    }


    waiter(
        true
    );


    return {

        success:
            true,

        printerName
    };
}


// ==========================================================
// PRINTER WORKER
// ==========================================================

function isBatchComplete(
    batch
) {

    return (
        batch.completedCopyNumbers.length >=
        batch.totalCopies
    );
}


function hasPendingWork(
    batch
) {

    return (
        batch.recoveryQueue.length >
        0
        ||
        batch.nextCopyNumber <=
        batch.totalCopies
    );
}


function getRemainingUnclaimedWorkCount(
    batch
) {

    return (
        batch.recoveryQueue.length
        +
        Math.max(
            0,
            batch.totalCopies -
            batch.nextCopyNumber +
            1
        )
    );
}


function hasActiveOtherPrinter(
    batch,
    currentPrinterName
) {

    return Object.values(
        batch.printerStats
    ).some(
        stats =>
            stats.printerName !==
            currentPrinterName
            &&
            !stats.disabled
            &&
            stats.busy
    );
}


async function waitForWorkOrCompletion(
    batch,
    printerName
) {

    while (
        true
    ) {

        if (
            isBatchComplete(
                batch
            )
        ) {

            return false;
        }


        if (
            hasPendingWork(
                batch
            )
        ) {

            return true;
        }


        /*
         * No unclaimed work right now, but another printer may still
         * be printing/retrying and could later place its failed copy
         * into recoveryQueue. Keep this Continue permission alive.
         */
        if (
            hasActiveOtherPrinter(
                batch,
                printerName
            )
        ) {

            await sleep(
                100
            );


            continue;
        }


        return false;
    }
}


async function printerWorker(
    batch,
    printerName,
    callbacks = {}
) {

    const stats =
        batch.printerStats[
            printerName
        ];


    console.log(
        `[QUEUE] Worker started for "${printerName}"`
    );


    while (
        !stats.disabled &&
        !batch.cancelRequested &&
        !isBatchComplete(
            batch
        )
    ) {

        const job =
            claimNextCopy(
                batch,
                printerName
            );


        if (!job) {

            break;
        }


        const result =
            await printSingleCopy(
                batch,
                job,
                callbacks
            );


        // ==============================================
        // FAILED AFTER 3 -> THIS PRINTER STOPS
        // ==============================================

        if (
            result.reassigned
        ) {

            if (
                typeof callbacks
                    .onCopyFailed ===
                "function"
            ) {

                callbacks.onCopyFailed({

                    batchId:
                        batch.id,

                    jobId:
                        job.id,

                    printerName,

                    copyNumber:
                        job.copyNumber,

                    attempts:
                        MAX_PRINT_ATTEMPTS,

                    error:
                        result.error
                });
            }


            break;
        }


        // ==============================================
        // SUCCESS
        // ==============================================

        if (
            result.success
        ) {

            const canContinue =
                !isBatchComplete(
                    batch
                ) &&
                !batch.cancelRequested
                &&
                getRemainingUnclaimedWorkCount(
                    batch
                ) >
                0;


            /*
             * IMPORTANT v5.1.3:
             * If all currently-required copies are already claimed,
             * this printer must NOT show Continue yet.
             *
             * But it also must NOT permanently exit while another
             * printer is still active, because that other printer may
             * fail and put its copy into recoveryQueue.
             */
            if (
                !canContinue &&
                !hasActiveOtherPrinter(
                    batch,
                    printerName
                )
            ) {

                clearBatchContinueWaiters(
                    batch
                );
            }


            let continuePromise =
                null;


            /*
             * Register waiter BEFORE the notification callback so the
             * Continue action is valid the instant Windows shows it.
             */
            if (
                canContinue
            ) {

                continuePromise =
                    waitForContinue(
                        batch,
                        printerName
                    );
            }


            if (
                typeof callbacks
                    .onCopyComplete ===
                "function"
            ) {

                callbacks.onCopyComplete({

                    batchId:
                        batch.id,

                    printerName,

                    copyNumber:
                        job.copyNumber,

                    totalCopies:
                        batch.totalCopies,

                    batchCompleted:
                        batch.copiesCompleted,

                    remainingToClaim:
                        getRemainingUnclaimedWorkCount(
                            batch
                        ),

                    canContinue
                });
            }


            if (
                !canContinue
            ) {

                /*
                 * No unclaimed copy exists RIGHT NOW.
                 * Stay alive silently while another printer is active.
                 * If that printer fails, its exact copy enters recovery.
                 */
                const recoveryAvailable =
                    await waitForWorkOrCompletion(
                        batch,
                        printerName
                    );


                if (
                    !recoveryAvailable ||
                    batch.cancelRequested ||
                    isBatchComplete(
                        batch
                    )
                ) {

                    break;
                }


                /*
                 * Only ONE idle healthy printer offers Continue for
                 * the recovered copy. This prevents multiple stale
                 * Continue notifications for the same recovery work.
                 */
                if (
                    batch.recoveryContinueOfferedTo &&
                    batch.recoveryContinueOfferedTo !==
                    printerName
                ) {

                    while (
                        batch.recoveryContinueOfferedTo &&
                        !batch.cancelRequested &&
                        !isBatchComplete(
                            batch
                        ) &&
                        hasPendingWork(
                            batch
                        )
                    ) {

                        await sleep(
                            100
                        );
                    }


                    continue;
                }


                batch.recoveryContinueOfferedTo =
                    printerName;


                continuePromise =
                    waitForContinue(
                        batch,
                        printerName
                    );


                if (
                    typeof callbacks
                        .onRecoveryAvailable ===
                    "function"
                ) {

                    callbacks.onRecoveryAvailable({

                        batchId:
                            batch.id,

                        printerName,

                        copyNumber:
                            batch.recoveryQueue[0] ||
                            null,

                        totalCopies:
                            batch.totalCopies,

                        batchCompleted:
                            batch.copiesCompleted
                    });
                }
            }


            // NO automatic next print.
            const userContinued =
                await continuePromise;


            if (
                !userContinued ||
                batch.cancelRequested ||
                isBatchComplete(
                    batch
                )
            ) {

                break;
            }


            /*
             * User gave THIS printer permission for ONE more copy.
             * If another printer is still finishing/retrying, wait for
             * its result because it may create recovery work.
             */
            const workAvailable =
                await waitForWorkOrCompletion(
                    batch,
                    printerName
                );


            if (
                !workAvailable
            ) {

                break;
            }
        }
    }


    console.log(
        `[QUEUE] Worker finished for "${printerName}"`
    );
}


// ==========================================================
// RUN BATCH
// ==========================================================

async function runBatch(
    batch,
    callbacks = {}
) {

    batch.status =
        "RUNNING";


    batch.startedAt =
        new Date().toISOString();


    await Promise.all(
        batch.printers.map(
            printerName =>
                printerWorker(
                    batch,
                    printerName,
                    callbacks
                )
        )
    );


    batch.copiesCompleted =
        batch.completedCopyNumbers.length;


    clearBatchContinueWaiters(
        batch
    );


    if (
        batch.cancelRequested
    ) {

        batch.status =
            "CANCELLED";

    } else if (
        isBatchComplete(
            batch
        )
    ) {

        batch.status =
            "COMPLETED";

    } else {

        batch.status =
            "INCOMPLETE";
    }


    batch.completedAt =
        new Date().toISOString();


    if (
        typeof callbacks
            .onBatchFinished ===
        "function"
    ) {

        callbacks.onBatchFinished({

            batchId:
                batch.id,

            status:
                batch.status,

            completed:
                batch.copiesCompleted,

            total:
                batch.totalCopies
        });
    }


    return batch;
}


// ==========================================================
// RETRY DISABLED FOR NOW
// ==========================================================

async function retryJob() {

    return {

        success:
            false,

        error:
            "Retry is disabled for now."
    };
}


// ==========================================================
// DASHBOARD CONTROLS - v5.1.0
// ==========================================================

function cancelBatch(
    batchId
) {

    const batch =
        getBatch(
            batchId
        );


    if (!batch) {

        return {
            success:
                false,

            error:
                "Batch not found."
        };
    }


    if (
        isBatchComplete(
            batch
        ) ||
        batch.status ===
        "COMPLETED"
    ) {

        return {
            success:
                false,

            error:
                "Completed jobs cannot be cancelled."
        };
    }


    batch.cancelRequested =
        true;


    batch.cancelledAt =
        new Date().toISOString();


    batch.status =
        "CANCELLING";


    clearBatchContinueWaiters(
        batch
    );


    return {
        success:
            true,

        batchId
    };
}


function forceError(
    batchId,
    jobId
) {

    const batch =
        getBatch(
            batchId
        );


    if (!batch) {

        return {
            success:
                false,

            error:
                "Batch not found."
        };
    }


    const job =
        batch.jobs.find(
            item =>
                item.id ===
                jobId
        );


    if (!job) {

        return {
            success:
                false,

            error:
                "Copy attempt not found."
        };
    }


    if (
        ![
            "CLAIMED",
            "SUBMITTING",
            "PRINTING",
            "RETRYING"
        ].includes(
            job.status
        )
    ) {

        return {
            success:
                false,

            error:
                "Force Error is only available for an active print attempt."
        };
    }


    /*
     * v5.1.6:
     * Force Error means exactly what the user says:
     * this printer is NOT printing.
     *
     * Interrupt the active attempt and immediately reassign
     * the SAME copy. No retry on this printer.
     */
    job.forceErrorRequested =
        true;


    job.forceErrorRetryRemaining =
        0;


    job.forceErrorRetryActive =
        false;


    job.status =
        "REASSIGNED";


    return {
        success:
            true,

        batchId,

        jobId,

        copyNumber:
            job.copyNumber,

        printerName:
            job.printerName
    };
}


function pauseCopy(
    batchId,
    copyNumber
) {

    const batch =
        getBatch(
            batchId
        );


    if (!batch) {

        return {
            success:
                false,

            error:
                "Batch not found."
        };
    }


    copyNumber =
        Number(
            copyNumber
        );


    if (
        batch.completedCopyNumbers.includes(
            copyNumber
        )
    ) {

        return {
            success:
                false,

            error:
                "Completed copies cannot be paused."
        };
    }


    if (
        !batch.pausedCopyNumbers.includes(
            copyNumber
        )
    ) {

        batch.pausedCopyNumbers.push(
            copyNumber
        );
    }


    return {
        success:
            true,

        copyNumber
    };
}


function resumeCopy(
    batchId,
    copyNumber
) {

    const batch =
        getBatch(
            batchId
        );


    if (!batch) {

        return {
            success:
                false,

            error:
                "Batch not found."
        };
    }


    copyNumber =
        Number(
            copyNumber
        );


    batch.pausedCopyNumbers =
        batch.pausedCopyNumbers.filter(
            number =>
                number !==
                copyNumber
        );


    return {
        success:
            true,

        copyNumber
    };
}


// ==========================================================
// UI PREVIEW
// ==========================================================

function calculateDistribution(
    totalCopies,
    printerNames
) {

    if (
        !Array.isArray(
            printerNames
        ) ||
        printerNames.length ===
        0 ||
        totalCopies <
        1
    ) {

        return [];
    }


    return printerNames.map(
        printerName => ({

            printerName,

            copies:
                "Dynamic"
        })
    );
}


// ==========================================================
// EXPORTS
// ==========================================================

module.exports = {

    createBatch,

    runBatch,

    getBatch,

    retryJob,

    continuePrinter,

    cancelBatch,

    forceError,

    pauseCopy,

    resumeCopy,

    calculateDistribution
};
