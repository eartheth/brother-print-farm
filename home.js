
(function addRecoveryHistoryStyles() {

    if (
        document.getElementById(
            "recovery-history-styles"
        )
    ) {

        return;
    }


    const style =
        document.createElement(
            "style"
        );


    style.id =
        "recovery-history-styles";


    style.textContent = `
        .printer-history {
            display: flex;
            align-items: center;
            flex-wrap: wrap;
            gap: 10px;
        }

        .printer-old {
            text-decoration: line-through;
            text-decoration-thickness: 2px;
            opacity: .55;
        }

        .printer-current {
            font-weight: 800;
        }

        .printer-history-arrow {
            opacity: .55;
            font-weight: 800;
        }
    `;


    document.head.appendChild(
        style
    );
})();

const jobsList =
    document.getElementById(
        "jobsList"
    );

const emptyJobs =
    document.getElementById(
        "emptyJobs"
    );

const allJobsCount =
    document.getElementById(
        "allJobsCount"
    );

const printingJobsCount =
    document.getElementById(
        "printingJobsCount"
    );

const waitingJobsCount =
    document.getElementById(
        "waitingJobsCount"
    );

const completedJobsCount =
    document.getElementById(
        "completedJobsCount"
    );

const openDetails =
    new Set();


let openCopyMenuKey =
    null;


function addJob() {

    window.location.href =
        "print.html";
}


document
    .getElementById(
        "addJobBtn"
    )
    .addEventListener(
        "click",
        addJob
    );


document
    .getElementById(
        "emptyAddJobBtn"
    )
    .addEventListener(
        "click",
        addJob
    );

// ==========================================================
// GET SAVED JOB IDS
// ==========================================================

async function getJobIds() {

    try {

        const result =
            await window
                .printFarm
                .getJobHistory();


        if (
            !result ||
            !result.success
        ) {

            console.error(
                "[JOB HISTORY]",
                result?.error ||
                "Could not load job history."
            );

            return [];
        }


        return Array.isArray(
            result.jobIds
        )
            ? result.jobIds
            : [];

    } catch (error) {

        console.error(
            "[JOB HISTORY] Read error:",
            error
        );

        return [];
    }
}

function escapeHtml(
    value
) {

    return String(
        value ??
        ""
    )
        .replace(
            /&/g,
            "&amp;"
        )
        .replace(
            /</g,
            "&lt;"
        )
        .replace(
            />/g,
            "&gt;"
        )
        .replace(
            /"/g,
            "&quot;"
        )
        .replace(
            /'/g,
            "&#039;"
        );
}


function getStatusDisplay(
    status
) {

    const value =
        String(
            status ||
            "UNKNOWN"
        ).toUpperCase();


    if (
        value ===
        "RUNNING"
    ) {

        return {
            label:
                "Printing",

            className:
                "printing"
        };
    }


    if (
        value ===
        "WAITING_FOR_USER"
    ) {

        return {
            label:
                "Waiting",

            className:
                "waiting"
        };
    }


    if (
        value ===
        "CANCELLED" ||
        value ===
        "CANCELLING"
    ) {

        return {
            label:
                value ===
                    "CANCELLED"
                    ? "Cancelled"
                    : "Cancelling",

            className:
                "problem"
        };
    }


    if (
        value ===
        "COMPLETED"
    ) {

        return {
            label:
                "Completed",

            className:
                "completed"
        };
    }


    if (
        value ===
        "INCOMPLETE" ||
        value.includes(
            "FAILED"
        ) ||
        value.includes(
            "ERROR"
        )
    ) {

        return {
            label:
                "Problem",

            className:
                "problem"
        };
    }


    return {
        label:
            value,

        className:
            ""
    };
}


function getCopyStatus(
    job
) {

    const status =
        String(
            job.status ||
            ""
        ).toUpperCase();


    if (
        status ===
        "COMPLETED"
    ) {

        return {
            label:
                "Completed",

            className:
                "completed"
        };
    }


    if (
        status ===
        "PRINTING" ||
        status ===
        "SUBMITTING"
    ) {

        return {
            label:
                "Printing",

            className:
                "printing"
        };
    }


    if (
        status ===
        "REASSIGNED"
    ) {

        return {
            label:
                "Reassigning",

            className:
                "failed"
        };
    }


    if (
        status ===
        "RETRYING"
    ) {

        return {
            label:
                "Retry",

            className:
                "waiting"
        };
    }


    if (
        status ===
        "FAILED"
    ) {

        return {
            label:
                "Failed",

            className:
                "failed"
        };
    }


    if (
        status ===
        "CLAIMED"
    ) {

        return {
            label:
                "Queued",

            className:
                "waiting"
        };
    }


    return {
        label:
            status ||
            "Pending",

        className:
            "pending"
    };
}


function buildCopyRows(
    batch
) {

    const jobs =
        Array.isArray(
            batch.jobs
        )
            ? batch.jobs
            : [];


    const jobsByCopy =
        new Map();


    jobs.forEach(
        job => {

            const copyNumber =
                Number(
                    job.copyNumber
                );


            if (
                !Number.isFinite(
                    copyNumber
                )
            ) {

                return;
            }


            if (
                !jobsByCopy.has(
                    copyNumber
                )
            ) {

                jobsByCopy.set(
                    copyNumber,
                    []
                );
            }


            jobsByCopy
                .get(
                    copyNumber
                )
                .push(
                    job
                );
        }
    );


    const totalCopies =
        Number(
            batch.totalCopies
        ) || 0;


    const paused =
        new Set(
            batch.pausedCopyNumbers ||
            []
        );


    let rows =
        "";


    for (
        let copyNumber = 1;
        copyNumber <=
        totalCopies;
        copyNumber++
    ) {

        const history =
            jobsByCopy.get(
                copyNumber
            ) || [];


        const isPaused =
            paused.has(
                copyNumber
            );


        if (
            history.length ===
            0
        ) {

            rows += `
                <div class="copy-row">

                    <div class="copy-number">
                        Copy ${copyNumber}
                    </div>

                    <div class="copy-printer">
                        —
                    </div>

                    <div class="copy-status ${isPaused
                    ? "waiting"
                    : "pending"
                }">
                        ${isPaused
                    ? "Paused"
                    : "Pending"
                }
                    </div>

                    <div class="copy-action-cell">

                        <button
                            class="copy-menu-button"
                            type="button"
                            data-copy-menu
                            data-batch-id="${escapeHtml(
                    batch.id
                )}"
                            data-copy-number="${copyNumber}"
                            data-copy-menu-key="${escapeHtml(
                    getCopyMenuKey(
                        batch.id,
                        copyNumber
                    )
                )}"
                            aria-label="Copy ${copyNumber} actions"
                        >
                            ⋯
                        </button>

                        <div class="copy-action-menu">

                            <button
                                type="button"
                                data-copy-action="${isPaused
                    ? "resume"
                    : "pause"
                }"
                            >
                                ${isPaused
                    ? "Resume"
                    : "Pause"
                }
                            </button>

                        </div>

                    </div>

                </div>
            `;

            continue;
        }


        const currentJob =
            history[
            history.length - 1
            ];


        const copyStatus =
            getCopyStatus(
                currentJob
            );


        const activeStatus =
            [
                "CLAIMED",
                "SUBMITTING",
                "PRINTING",
                "RETRYING"
            ].includes(
                String(
                    currentJob.status ||
                    ""
                ).toUpperCase()
            );


        const printerHistory =
            history.map(
                (
                    item,
                    index
                ) => {

                    const isLast =
                        index ===
                        history.length - 1;


                    const itemStatus =
                        String(
                            item.status ||
                            ""
                        ).toUpperCase();


                    const cls =
                        !isLast ||
                            itemStatus ===
                            "FAILED" ||
                            itemStatus ===
                            "REASSIGNED"
                            ? "printer-old"
                            : "printer-current";


                    return `
                        <span class="${cls}">
                            ${escapeHtml(
                        item.printerName ||
                        "—"
                    )}
                        </span>
                    `;
                }
            )
                .join(
                    `<span class="printer-history-arrow">→</span>`
                );


        rows += `
            <div class="copy-row">

                <div class="copy-number">
                    Copy ${copyNumber}
                </div>

                <div class="copy-printer printer-history">
                    ${printerHistory}
                </div>

                <div class="copy-status ${copyStatus.className}">
                    ${isPaused &&
                !activeStatus
                ? "Paused"
                : escapeHtml(
                    copyStatus.label
                )
            }
                </div>

                <div class="copy-action-cell">

                    <button
                        class="copy-menu-button"
                        type="button"
                        data-copy-menu
                        data-batch-id="${escapeHtml(
                batch.id
            )}"
                        data-copy-number="${copyNumber}"
                        data-copy-menu-key="${escapeHtml(
                getCopyMenuKey(
                    batch.id,
                    copyNumber
                )
            )}"
                        data-job-id="${escapeHtml(
                currentJob.id ||
                ""
            )}"
                        aria-label="Copy ${copyNumber} actions"
                    >
                        ⋯
                    </button>

                    <div class="copy-action-menu">

                        ${activeStatus
                ? `
                                    <button
                                        type="button"
                                        class="danger-action"
                                        data-copy-action="force-error"
                                    >
                                        Force error
                                    </button>
                                `
                : ""
            }

                        ${String(
                currentJob.status ||
                ""
            ).toUpperCase() !==
                "COMPLETED"
                ? `
                                    <button
                                        type="button"
                                        data-copy-action="${isPaused
                    ? "resume"
                    : "pause"
                }"
                                    >
                                        ${isPaused
                    ? "Resume"
                    : "Pause"
                }
                                    </button>
                                `
                : ""
            }

                    </div>

                </div>

            </div>
        `;
    }


    return rows;
}


function renderJobs(
    batches
) {

    jobsList.innerHTML =
        "";


    emptyJobs.classList.toggle(
        "hidden",
        batches.length >
        0
    );


    let printing =
        0;

    let waiting =
        0;

    let completed =
        0;


    batches.forEach(
        batch => {

            const status =
                getStatusDisplay(
                    batch.status
                );


            if (
                status.className ===
                "printing"
            ) {

                printing++;
            }


            if (
                status.className ===
                "waiting"
            ) {

                waiting++;
            }


            if (
                status.className ===
                "completed"
            ) {

                completed++;
            }


            const done =
                Number(
                    batch.copiesCompleted
                ) || 0;


            const total =
                Number(
                    batch.totalCopies
                ) || 0;


            const percent =
                total >
                    0
                    ? Math.min(
                        100,
                        Math.round(
                            done /
                            total *
                            100
                        )
                    )
                    : 0;


            const entry =
                document.createElement(
                    "article"
                );


            entry.className =
                "job-entry";


            if (
                openDetails.has(
                    batch.id
                )
            ) {

                entry.classList.add(
                    "details-open"
                );
            }


            entry.innerHTML =
                `
                    <div class="job-row">

                        <div>

                            <div class="job-id">
                                ${escapeHtml(
                    batch.id
                )}
                            </div>

                            <div class="job-file-name">
                                ${escapeHtml(
                    batch.fileName ||
                    "Unknown PDF"
                )}
                            </div>

                            <div class="job-meta">

                                ${escapeHtml(
                    batch.profileId ||
                    "Print job"
                )}

                                ·

                                ${Number(
                    batch.printers
                        ?.length
                ) || 0}

                                printer(s)

                            </div>

                        </div>


                        <div>

                            <span
                                class="status-pill ${status.className}"
                            >
                                ${escapeHtml(
                    status.label
                )}
                            </span>

                        </div>


                        <div>

                            <div class="progress-value">
                                ${done}/${total}
                            </div>

                            <div class="progress-track">

                                <div
                                    class="progress-fill"
                                    style="width:${percent}%"
                                ></div>

                            </div>

                        </div>


                        <div class="job-actions">

                            ${![
                    "COMPLETED",
                    "CANCELLED",
                    "INCOMPLETE"
                ].includes(
                    String(
                        batch.status ||
                        ""
                    ).toUpperCase()
                )
                    ? `
                                        <button
                                            class="cancel-job-button"
                                            type="button"
                                            data-cancel-batch="${escapeHtml(
                        batch.id
                    )}"
                                        >
                                            Cancel job
                                        </button>
                                    `
                    : ""
                }

                            <button
                                class="details-button"
                                type="button"
                            >
                                ${openDetails.has(
                    batch.id
                )
                    ? "Hide details"
                    : "View details"
                }
                            </button>

                        </div>

                    </div>


                    <div class="job-details">

                        <div class="details-inner">

                            <div class="copy-table-header">

                                <div>
                                    Copy
                                </div>

                                <div>
                                    Printer
                                </div>

                                <div>
                                    Status
                                </div>

                                <div>
                                </div>

                            </div>


                            <div class="copy-list">

                                ${buildCopyRows(
                    batch
                )}

                            </div>


                            <div class="details-footer">

                                <span>
                                    ${batch.printers
                    ?.length ||
                0
                }
                                    selected printer(s)
                                </span>

                                <span>
                                    ${done}/${total}
                                    complete
                                </span>

                            </div>

                        </div>

                    </div>
                `;


            const button =
                entry.querySelector(
                    ".details-button"
                );


            button.addEventListener(
                "click",
                () => {

                    if (
                        openDetails.has(
                            batch.id
                        )
                    ) {

                        openDetails.delete(
                            batch.id
                        );

                    } else {

                        openDetails.add(
                            batch.id
                        );
                    }


                    entry.classList.toggle(
                        "details-open"
                    );


                    button.textContent =
                        entry
                            .classList
                            .contains(
                                "details-open"
                            )
                            ? "Hide details"
                            : "View details";
                }
            );


            jobsList.appendChild(
                entry
            );
        }
    );


    allJobsCount.textContent =
        batches.length;


    printingJobsCount.textContent =
        printing;


    waitingJobsCount.textContent =
        waiting;


    completedJobsCount.textContent =
        completed;


    restoreOpenCopyMenu();
}


function closeCopyMenus(
    clearSaved =
        true
) {

    document
        .querySelectorAll(
            ".copy-action-cell.open"
        )
        .forEach(
            element => {

                element.classList.remove(
                    "open"
                );


                element.classList.remove(
                    "open-up"
                );
            }
        );


    if (
        clearSaved
    ) {

        openCopyMenuKey =
            null;
    }
}


function getCopyMenuKey(
    batchId,
    copyNumber
) {

    return (
        `${batchId}::${copyNumber}`
    );
}


function positionCopyMenu(
    cell
) {

    const menu =
        cell.querySelector(
            ".copy-action-menu"
        );


    if (!menu) {

        return;
    }


    cell.classList.remove(
        "open-up"
    );


    const rect =
        cell.getBoundingClientRect();


    const menuHeight =
        menu.offsetHeight ||
        120;


    const spaceBelow =
        window.innerHeight -
        rect.bottom;


    const spaceAbove =
        rect.top;


    if (
        spaceBelow <
        menuHeight + 16
        &&
        spaceAbove >
        spaceBelow
    ) {

        cell.classList.add(
            "open-up"
        );
    }
}


function restoreOpenCopyMenu() {

    if (
        !openCopyMenuKey
    ) {

        return;
    }


    const button =
        document.querySelector(
            `[data-copy-menu-key="${CSS.escape(
                openCopyMenuKey
            )}"]`
        );


    if (!button) {

        openCopyMenuKey =
            null;

        return;
    }


    const cell =
        button.closest(
            ".copy-action-cell"
        );


    if (!cell) {

        openCopyMenuKey =
            null;

        return;
    }


    cell.classList.add(
        "open"
    );


    requestAnimationFrame(
        () =>
            positionCopyMenu(
                cell
            )
    );
}


jobsList.addEventListener(
    "click",
    async event => {

        const cancelButton =
            event.target.closest(
                "[data-cancel-batch]"
            );


        if (
            cancelButton
        ) {

            const batchId =
                cancelButton.dataset
                    .cancelBatch;


            if (
                !confirm(
                    "Cancel this job?\n\nNo additional copies will be sent. Copies already sent to Windows may still print."
                )
            ) {

                return;
            }


            const result =
                await window
                    .printFarm
                    .cancelBatch(
                        batchId
                    );


            if (
                !result?.success
            ) {

                alert(
                    result?.error ||
                    "Could not cancel this job."
                );
            }


            await refreshJobs();


            return;
        }


        const menuButton =
            event.target.closest(
                "[data-copy-menu]"
            );


        if (
            menuButton
        ) {

            event.stopPropagation();


            const cell =
                menuButton.closest(
                    ".copy-action-cell"
                );


            const wasOpen =
                cell.classList.contains(
                    "open"
                );


            closeCopyMenus(
                false
            );


            if (
                !wasOpen
            ) {

                cell.classList.add(
                    "open"
                );


                openCopyMenuKey =
                    menuButton.dataset
                        .copyMenuKey;


                requestAnimationFrame(
                    () =>
                        positionCopyMenu(
                            cell
                        )
                );

            } else {

                openCopyMenuKey =
                    null;
            }


            return;
        }


        const actionButton =
            event.target.closest(
                "[data-copy-action]"
            );


        if (
            !actionButton
        ) {

            return;
        }


        event.stopPropagation();


        const cell =
            actionButton.closest(
                ".copy-action-cell"
            );


        const menu =
            cell.querySelector(
                "[data-copy-menu]"
            );


        const batchId =
            menu.dataset.batchId;


        const copyNumber =
            Number(
                menu.dataset.copyNumber
            );


        const jobId =
            menu.dataset.jobId;


        const action =
            actionButton.dataset
                .copyAction;


        closeCopyMenus();


        if (
            action ===
            "force-error"
        ) {

            if (
                !confirm(
                    "Force this print attempt to fail?\n\nUse this only when the printer is not actually receiving or printing the job. The same copy will be reassigned."
                )
            ) {

                return;
            }


            const result =
                await window
                    .printFarm
                    .forceError(
                        batchId,
                        jobId
                    );


            if (
                !result?.success
            ) {

                alert(
                    result?.error ||
                    "Could not force this attempt to error."
                );
            }
        }


        if (
            action ===
            "pause"
        ) {

            const result =
                await window
                    .printFarm
                    .pauseCopy(
                        batchId,
                        copyNumber
                    );


            if (
                !result?.success
            ) {

                alert(
                    result?.error ||
                    "Could not pause this copy."
                );
            }
        }


        if (
            action ===
            "resume"
        ) {

            const result =
                await window
                    .printFarm
                    .resumeCopy(
                        batchId,
                        copyNumber
                    );


            if (
                !result?.success
            ) {

                alert(
                    result?.error ||
                    "Could not resume this copy."
                );
            }
        }


        await refreshJobs();
    }
);


document.addEventListener(
    "click",
    event => {

        if (
            !event.target.closest(
                ".copy-action-cell"
            )
        ) {

            closeCopyMenus();
        }
    }
);


async function refreshJobs() {

    const jobIds =
        await getJobIds();


    if (
        jobIds.length ===
        0
    ) {

        renderJobs(
            []
        );

        return;
    }


    const batches =
        [];


    for (
        const batchId
        of jobIds
    ) {

        try {

            const result =
                await window
                    .printFarm
                    .getBatch(
                        batchId
                    );


            if (
                result &&
                result.success &&
                result.batch
            ) {

                batches.push(
                    result.batch
                );
            }

        } catch (
        error
        ) {

            console.warn(
                `[HOME] Could not load ${batchId}:`,
                error
            );
        }
    }


    renderJobs(
        batches
    );
}


refreshJobs();


setInterval(
    refreshJobs,
    1000
);


window.addEventListener(
    "resize",
    () => {

        if (
            !openCopyMenuKey
        ) {

            return;
        }


        const button =
            document.querySelector(
                `[data-copy-menu-key="${CSS.escape(
                    openCopyMenuKey
                )}"]`
            );


        const cell =
            button?.closest(
                ".copy-action-cell"
            );


        if (cell) {

            positionCopyMenu(
                cell
            );
        }
    }
);
