const {
    app,
    BrowserWindow,
    ipcMain,
    dialog,
    Notification,
    Menu,
    shell
} = require("electron");

const fs = require("fs");
const path = require("path");

const {
    execFileSync
} = require("child_process");

const crypto =
    require("crypto");

const JOB_HISTORY_DIR =
    path.join(
        process.env.ProgramData || "C:\\ProgramData",
        "BrotherPrintFarm"
    );

const JOB_HISTORY_FILE =
    path.join(
        JOB_HISTORY_DIR,
        "job-history.json"
    );


function ensureJobHistoryFile() {

    if (!fs.existsSync(JOB_HISTORY_DIR)) {

        fs.mkdirSync(
            JOB_HISTORY_DIR,
            {
                recursive: true
            }
        );
    }


    if (!fs.existsSync(JOB_HISTORY_FILE)) {

        fs.writeFileSync(
            JOB_HISTORY_FILE,
            JSON.stringify(
                {
                    jobIds: []
                },
                null,
                2
            ),
            "utf8"
        );
    }
}


function readJobHistory() {

    try {

        ensureJobHistoryFile();


        const data =
            JSON.parse(
                fs.readFileSync(
                    JOB_HISTORY_FILE,
                    "utf8"
                )
            );


        return Array.isArray(data.jobIds)
            ? data.jobIds
            : [];

    } catch (error) {

        console.error(
            "[JOB HISTORY] Read error:",
            error
        );

        return [];
    }
}


function saveJobId(
    batchId
) {

    try {

        ensureJobHistoryFile();


        const id =
            String(batchId);


        let jobIds =
            readJobHistory();


        // Remove duplicate
        jobIds =
            jobIds.filter(
                existingId =>
                    String(existingId) !== id
            );


        // Newest first
        jobIds.unshift(id);


        // Keep latest 100
        jobIds =
            jobIds.slice(
                0,
                100
            );


        fs.writeFileSync(
            JOB_HISTORY_FILE,
            JSON.stringify(
                {
                    jobIds
                },
                null,
                2
            ),
            "utf8"
        );


        console.log(
            "[JOB HISTORY] Saved:",
            id
        );


        return {
            success: true,
            jobIds
        };

    } catch (error) {

        console.error(
            "[JOB HISTORY] Save error:",
            error
        );


        return {
            success: false,
            error: error.message
        };
    }
}

// ==========================================================
// JOB HISTORY IPC
// ==========================================================

ipcMain.handle(
    "save-job-id",
    async (
        _event,
        batchId
    ) => {

        return saveJobId(
            batchId
        );
    }
);


ipcMain.handle(
    "get-job-history",
    async () => {

        try {

            return {
                success: true,
                jobIds:
                    readJobHistory()
            };

        } catch (error) {

            console.error(
                "[JOB HISTORY] Read IPC error:",
                error
            );

            return {
                success: false,
                jobIds: [],
                error:
                    error.message
            };
        }
    }
);

const {
    getWindowsPrinters,
    getPrinterStatus,
    getPrintJobs,
    getLivePrinterStates,
    printPdf
} = require("./printer");

const {
    createBatch,
    runBatch,
    getBatch,
    retryJob,
    continuePrinter,
    cancelBatch,
    forceError,
    pauseCopy,
    resumeCopy
} = require("./queue");

const {
    validateLicense
} = require("./license");

let mainWindow;

// ==========================================================
// MACHINE-WIDE SINGLE INSTANCE LOCK
// ==========================================================
// Blocks another Windows user/session on the same computer.

const machineLockDirectory =
    path.join(
        process.env.ProgramData ||
        "C:\\ProgramData",
        "BrotherPrintFarm"
    );

const machineLockPath =
    path.join(
        machineLockDirectory,
        "BrotherPrintFarm.lock"
    );

let machineLockAcquired =
    false;


function isProcessRunning(
    pid
) {

    if (
        !Number.isInteger(pid) ||
        pid <= 0
    ) {
        return false;
    }

    try {
        process.kill(pid, 0);
        return true;
    } catch (error) {
        return Boolean(
            error &&
            error.code === "EPERM"
        );
    }
}


function releaseMachineLock() {

    if (!machineLockAcquired) {
        return;
    }

    try {

        if (fs.existsSync(machineLockPath)) {

            const lockData =
                JSON.parse(
                    fs.readFileSync(
                        machineLockPath,
                        "utf8"
                    )
                );

            if (
                Number(lockData.pid) ===
                process.pid
            ) {
                fs.unlinkSync(machineLockPath);
            }
        }

    } catch (error) {

        console.warn(
            "[MACHINE LOCK]",
            error.message
        );
    }

    machineLockAcquired =
        false;
}


function acquireMachineLock() {

    fs.mkdirSync(
        machineLockDirectory,
        { recursive: true }
    );

    for (
        let attempt = 0;
        attempt < 2;
        attempt += 1
    ) {

        try {

            const fd =
                fs.openSync(
                    machineLockPath,
                    "wx"
                );

            fs.writeFileSync(
                fd,
                JSON.stringify(
                    {
                        pid: process.pid,
                        startedAt:
                            new Date().toISOString()
                    },
                    null,
                    2
                ),
                "utf8"
            );

            fs.closeSync(fd);

            machineLockAcquired =
                true;

            return {
                success: true
            };

        } catch (error) {

            if (error.code !== "EEXIST") {
                return {
                    success: false,
                    error: error.message
                };
            }

            try {

                const lockData =
                    JSON.parse(
                        fs.readFileSync(
                            machineLockPath,
                            "utf8"
                        )
                    );

                const existingPid =
                    Number(lockData.pid);

                if (
                    isProcessRunning(
                        existingPid
                    )
                ) {
                    return {
                        success: false,
                        alreadyRunning: true
                    };
                }

                fs.unlinkSync(
                    machineLockPath
                );

            } catch (staleLockError) {

                try {
                    fs.unlinkSync(
                        machineLockPath
                    );
                } catch (removeError) {
                    return {
                        success: false,
                        error:
                            removeError.message
                    };
                }
            }
        }
    }

    return {
        success: false,
        alreadyRunning: true
    };
}



// Keep interactive notifications alive until the user acts.
const continueNotifications =
    new Map();

function closeBatchContinueNotifications(
    batchId
) {

    const prefix =
        `${batchId}::`;


    for (
        const [
            key,
            notification
        ]
        of continueNotifications
    ) {

        if (
            !key.startsWith(
                prefix
            )
        ) {

            continue;
        }


        try {

            notification.close();

        } catch {
            // Ignore notification close errors
        }


        continueNotifications.delete(
            key
        );
    }
}

// ==========================================================
// APPLICATION MENU - v5.2.0
// ==========================================================

function getBundledProfilesPath() {

    return path.join(
        __dirname,
        "profiles.json"
    );
}


function getProfilesPath() {

    return path.join(
        app.getPath("userData"),
        "profiles.json"
    );
}


function ensureWritableProfilesFile() {

    const userDataDir =
        app.getPath("userData");

    const writablePath =
        getProfilesPath();

    const bundledPath =
        getBundledProfilesPath();


    fs.mkdirSync(
        userDataDir,
        {
            recursive: true
        }
    );


    if (
        fs.existsSync(
            writablePath
        )
    ) {

        return writablePath;
    }


    if (
        !fs.existsSync(
            bundledPath
        )
    ) {

        throw new Error(
            "Default profiles.json was not found."
        );
    }


    fs.copyFileSync(
        bundledPath,
        writablePath
    );


    return writablePath;
}


function setDefaultProfile(
    profileId
) {

    const profilePath =
        getProfilesPath();


    const data =
        JSON.parse(
            fs.readFileSync(
                profilePath,
                "utf8"
            )
        );


    data.defaultProfile =
        profileId;


    fs.writeFileSync(
        profilePath,
        JSON.stringify(
            data,
            null,
            2
        ) + "\n",
        "utf8"
    );


    buildApplicationMenu();


    if (
        mainWindow &&
        !mainWindow.isDestroyed()
    ) {

        mainWindow.webContents.send(
            "profiles-changed"
        );
    }
}
function getLicenseMachineId() {

    const psScript = `
        $g=(Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Cryptography').MachineGuid
        $b=(Get-CimInstance Win32_BIOS).SerialNumber
        $m=(Get-CimInstance Win32_BaseBoard).SerialNumber
        $u=(Get-CimInstance Win32_ComputerSystemProduct).UUID
        @($g,$b,$m,$u) | ForEach-Object { ([string]$_).Trim().ToUpperInvariant() }
    `;

    const output = execFileSync(
        "powershell.exe",
        [
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            psScript
        ],
        {
            encoding: "utf8",
            windowsHide: true
        }
    );

    const raw = String(output)
        .split(/\r?\n/)
        .map(value => value.trim())
        .filter(Boolean)
        .join("|");

    return crypto
        .createHash("sha256")
        .update(raw, "utf8")
        .digest("hex")
        .toUpperCase();
}


async function showLicenseMachineId() {

    try {

        const machineId = getLicenseMachineId();

        const result = await dialog.showMessageBox(
            mainWindow,
            {
                type: "info",
                title: "License Machine ID",
                message: "Machine ID",
                detail: machineId,
                buttons: [
                    "Copy Machine ID",
                    "Close"
                ],
                defaultId: 0,
                cancelId: 1
            }
        );

        if (result.response === 0) {

            const { clipboard } = require("electron");

            clipboard.writeText(machineId);
        }

    } catch (error) {

        dialog.showErrorBox(
            "License Machine ID",
            error.message
        );
    }
}

function buildApplicationMenu() {

    let profileData = {
        defaultProfile:
            null,

        profiles:
            []
    };


    try {

        profileData =
            loadPrintProfiles();

    } catch (
    error
    ) {

        console.warn(
            "[MENU PROFILES]",
            error.message
        );
    }


    const defaultItems =
        profileData.profiles.map(
            profile => ({
                label:
                    profile.name ||
                    profile.id,

                type:
                    "radio",

                checked:
                    profile.id ===
                    profileData.defaultProfile,

                click:
                    () =>
                        setDefaultProfile(
                            profile.id
                        )
            })
        );


    const template = [
        {
            label:
                "File",

            submenu: [
                {
                    label:
                        "Home",

                    accelerator:
                        "Ctrl+H",

                    click:
                        () =>
                            mainWindow?.loadFile(
                                "index.html"
                            )
                },

                {
                    label:
                        "New Print Job",

                    accelerator:
                        "Ctrl+N",

                    click:
                        () =>
                            mainWindow?.loadFile(
                                "print.html"
                            )
                },

                {
                    label:
                        "Test Print",

                    accelerator:
                        "Ctrl+T",

                    click:
                        () =>
                            mainWindow?.loadFile(
                                "test.html"
                            )
                },

                {
                    type:
                        "separator"
                },

                {
                    role:
                        "quit"
                }
            ]
        },

        {
            label:
                "Edit",

            submenu: [
                {
                    role:
                        "undo"
                },

                {
                    role:
                        "redo"
                },

                {
                    type:
                        "separator"
                },

                {
                    role:
                        "cut"
                },

                {
                    role:
                        "copy"
                },

                {
                    role:
                        "paste"
                }
            ]
        },

        {
            label:
                "View",

            submenu: [
                {
                    role:
                        "reload"
                },

                {
                    role:
                        "forceReload"
                },

                {
                    role:
                        "toggleDevTools"
                },

                {
                    type:
                        "separator"
                },

                {
                    role:
                        "resetZoom"
                },

                {
                    role:
                        "zoomIn"
                },

                {
                    role:
                        "zoomOut"
                }
            ]
        },

        {
            label:
                "Profiles",

            submenu: [
                {
                    label:
                        "Manage profiles...",

                    accelerator:
                        "Ctrl+Shift+P",

                    click:
                        () =>
                            mainWindow?.loadFile(
                                "profile-editor.html"
                            )
                },

                {
                    label:
                        "Reload profiles",

                    click:
                        () => {

                            buildApplicationMenu();


                            mainWindow?.webContents.send(
                                "profiles-changed"
                            );
                        }
                },

                {
                    type:
                        "separator"
                },

                {
                    label:
                        "Default profile",

                    submenu:
                        defaultItems.length >
                            0
                            ? defaultItems
                            : [
                                {
                                    label:
                                        "No profiles found",

                                    enabled:
                                        false
                                }
                            ]
                }
            ]
        },

        {
            label:
                "License",

            submenu: [
                {
                    label:
                        "Show Machine ID",

                    click:
                        () =>
                            showLicenseMachineId()
                }
            ]
        },
    ];


    Menu.setApplicationMenu(
        Menu.buildFromTemplate(
            template
        )
    );
}


// ==========================================================
// WINDOW
// ==========================================================

function createWindow() {
    mainWindow =
        new BrowserWindow({
            width: 1200,
            height: 800,

            minWidth: 900,
            minHeight: 650,

            webPreferences: {
                preload:
                    path.join(
                        __dirname,
                        "preload.js"
                    ),

                contextIsolation:
                    true,

                nodeIntegration:
                    false
            }
        });

    mainWindow.loadFile(
        "index.html"
    );


    buildApplicationMenu();
}


// ==========================================================
// ELECTRON LIFECYCLE
// ==========================================================

app.whenReady().then(async () => {

    const machineLock =
        acquireMachineLock();


    if (
        !machineLock.success
    ) {

        const message =
            machineLock.alreadyRunning
                ? "Brother Print Farm is already running on this computer. Only one Windows user can run it at a time."
                : "Brother Print Farm could not create the machine-wide application lock.\n\n" +
                (machineLock.error ||
                    "Unknown lock error.");


        dialog.showErrorBox(
            "Brother Print Farm",
            message
        );


        app.quit();

        return;
    }


    // Create a writable user profile copy outside app.asar.
    ensureWritableProfilesFile();
    const licenseResult =
        validateLicense(app);

    if (!licenseResult.ok) {

        const messages = {
            NO_LICENSE:
                "No license was found for this computer.",

            BAD_SIGNATURE:
                "The license is invalid or has been modified.",

            WRONG_DEVICE:
                "This license belongs to another computer.",

            EXPIRED:
                "This license has expired.",

            WRONG_NETWORK:
                "This computer is not connected to an authorized network."
        };

        const machineId =
            licenseResult.machineId ||
            getLicenseMachineId();

        const result =
            await dialog.showMessageBox({
                type: "error",

                title:
                    "Brother Print Farm - Authorization Required",

                message:
                    messages[licenseResult.reason] ||
                    `License validation failed: ${licenseResult.reason}`,

                detail:
                    `Machine ID:\n\n${machineId}\n\n` +
                    `Send this Machine ID to the administrator to authorize this computer.`,

                buttons: [
                    "Copy Machine ID",
                    "Close"
                ],

                defaultId: 0,
                cancelId: 1,
                noLink: true
            });

        if (result.response === 0) {

            const { clipboard } =
                require("electron");

            clipboard.writeText(
                machineId
            );
        }

        releaseMachineLock();

        app.quit();

        return;

        releaseMachineLock();

        app.quit();

        return;
    }
    createWindow();

    app.on(
        "activate",
        () => {
            if (
                BrowserWindow
                    .getAllWindows()
                    .length === 0
            ) {
                createWindow();
            }
        }
    );
});


app.on(
    "window-all-closed",
    () => {
        if (
            process.platform !==
            "darwin"
        ) {
            app.quit();
        }
    }
);


app.on(
    "before-quit",
    () => {

        releaseMachineLock();
    }
);


// ==========================================================
// PDF FILE PICKER
// ==========================================================

ipcMain.handle(
    "select-pdf",
    async () => {

        const result =
            await dialog.showOpenDialog(
                mainWindow,
                {
                    title:
                        "Select PDF",

                    properties: [
                        "openFile"
                    ],

                    filters: [
                        {
                            name:
                                "PDF files",

                            extensions: [
                                "pdf"
                            ]
                        }
                    ]
                }
            );

        if (
            result.canceled ||
            result.filePaths.length === 0
        ) {
            return null;
        }

        return result.filePaths[0];
    }
);


// ==========================================================
// PRINTER DISCOVERY
// ==========================================================

ipcMain.handle(
    "get-printers",
    async () => {

        try {
            const printers =
                await getWindowsPrinters();

            return {
                success: true,
                printers
            };

        } catch (error) {
            return {
                success: false,
                error:
                    error.message
            };
        }
    }
);


// ==========================================================
// PRINTER STATUS
// ==========================================================

ipcMain.handle(
    "get-printer-status",

    async (
        _event,
        printerName
    ) => {

        try {
            const printer =
                await getPrinterStatus(
                    printerName
                );

            if (!printer) {
                return {
                    success: false,
                    error:
                        "Printer not found"
                };
            }

            return {
                success: true,
                printer
            };

        } catch (error) {
            return {
                success: false,
                error:
                    error.message
            };
        }
    }
);


// ==========================================================
// PRINT JOBS
// ==========================================================

ipcMain.handle(
    "get-print-jobs",

    async (
        _event,
        printerName
    ) => {

        try {
            const jobs =
                await getPrintJobs(
                    printerName
                );

            return {
                success: true,
                jobs
            };

        } catch (error) {
            return {
                success: false,
                error:
                    error.message
            };
        }
    }
);
// ==========================================================
// LIVE PRINTER STATES
// ==========================================================

ipcMain.handle(
    "get-live-printer-states",
    async () => {

        try {
            const printers =
                await getLivePrinterStates();

            return {
                success: true,
                printers
            };

        } catch (error) {
            console.error(
                "[LIVE MONITOR]",
                error.message
            );

            return {
                success: false,
                error:
                    error.message
            };
        }
    }
);


// ==========================================================
// LEGACY DIRECT PRINT
// ==========================================================
//
// Kept temporarily for backwards compatibility.
// The renderer can eventually use start-batch exclusively.
//
// ==========================================================

ipcMain.handle(
    "print-job",

    async (
        _event,
        job
    ) => {

        return await printPdf(
            job
        );
    }
);


// ==========================================================
// TEST PRINT
// ==========================================================

ipcMain.handle(
    "test-print",

    async (
        _event,
        data
    ) => {

        try {

            if (
                !data ||
                !data.printerName
            ) {

                return {
                    success: false,
                    error:
                        "No printer selected."
                };
            }


            const testFilePath =
                path.join(
                    __dirname,
                    "assets",
                    "test-print.pdf"
                );


            if (
                !fs.existsSync(
                    testFilePath
                )
            ) {

                return {
                    success: false,
                    error:
                        "assets/test-print.pdf was not found."
                };
            }


            return await printPdf({

                filePath:
                    testFilePath,

                printerName:
                    data.printerName,

                copies:
                    1,

                paperSize:
                    "A4",

                duplex:
                    "simplex",

                monochrome:
                    false
            });


        } catch (
        error
        ) {

            console.error(
                "[TEST PRINT]",
                error
            );


            return {
                success: false,
                error:
                    error.message
            };
        }
    }
);


// ==========================================================
// START QUEUE BATCH - v5.1.3
// ==========================================================

ipcMain.handle(
    "start-batch",

    async (
        _event,
        data
    ) => {

        try {

            if (
                !data.filePath
            ) {

                return {
                    success: false,
                    error:
                        "No PDF selected."
                };
            }


            if (
                !Number.isInteger(
                    data.totalCopies
                ) ||
                data.totalCopies <
                1
            ) {

                return {
                    success: false,
                    error:
                        "Invalid copy count."
                };
            }


            if (
                !Array.isArray(
                    data.printers
                ) ||
                data.printers.length ===
                0
            ) {

                return {
                    success: false,
                    error:
                        "No printers selected."
                };
            }


            const batch =
                createBatch(
                    data
                );
            // Save batch to permanent job history
            saveJobId(
                batch.id
            );

            // IMPORTANT:
            // Do not await. A printer can sit waiting for the
            // notification Continue button indefinitely.
            runBatch(
                batch,
                {

                    onCopyComplete:
                        info => {

                            if (
                                info.batchCompleted >=
                                info.totalCopies
                            ) {

                                closeBatchContinueNotifications(
                                    info.batchId
                                );
                            }


                            if (
                                !Notification.isSupported()
                            ) {

                                console.warn(
                                    "[NOTIFICATION] Unsupported."
                                );

                                return;
                            }


                            // ----------------------------------
                            // FINISHED, MORE COPIES AVAILABLE
                            // ----------------------------------

                            if (
                                info.canContinue
                            ) {

                                const key =
                                    `${info.batchId}::${info.printerName}`;


                                // Remove any previous notification for
                                // this same printer/batch.
                                const oldNotification =
                                    continueNotifications.get(
                                        key
                                    );


                                if (
                                    oldNotification
                                ) {

                                    try {

                                        oldNotification.close();

                                    } catch { }

                                    continueNotifications.delete(
                                        key
                                    );
                                }


                                const notification =
                                    new Notification({

                                        title:
                                            `${info.printerName} finished`,

                                        body:
                                            `Copy ${info.copyNumber} finished. ` +
                                            `${info.batchCompleted}/${info.totalCopies} completed.`,

                                        // User asked for Continue on
                                        // the COMPUTER notification.
                                        actions: [
                                            {
                                                type:
                                                    "button",

                                                text:
                                                    "Continue"
                                            }
                                        ],

                                        // Stay available until user acts.
                                        timeoutType:
                                            "never"
                                    });


                                continueNotifications.set(
                                    key,
                                    notification
                                );


                                notification.on(
                                    "action",
                                    event => {

                                        if (
                                            event.actionIndex !==
                                            0
                                        ) {

                                            return;
                                        }


                                        const result =
                                            continuePrinter(
                                                info.batchId,
                                                info.printerName
                                            );


                                        console.log(
                                            "[CONTINUE]",
                                            info.printerName,
                                            result
                                        );


                                        if (
                                            result.success
                                        ) {

                                            try {

                                                notification.close();

                                            } catch { }


                                            continueNotifications.delete(
                                                key
                                            );

                                        } else {

                                            // If Continue somehow fails,
                                            // tell the user instead of silently
                                            // losing the button.
                                            new Notification({

                                                title:
                                                    `${info.printerName} could not continue`,

                                                body:
                                                    result.error ||
                                                    "Unknown Continue error."
                                            }).show();
                                        }
                                    }
                                );


                                notification.on(
                                    "close",
                                    () => {

                                        if (
                                            continueNotifications.get(
                                                key
                                            ) ===
                                            notification
                                        ) {

                                            continueNotifications.delete(
                                                key
                                            );
                                        }
                                    }
                                );


                                notification.show();


                                return;
                            }


                            // ----------------------------------
                            // FINISHED, NOTHING ELSE TO CLAIM
                            // ----------------------------------

                            new Notification({

                                title:
                                    `${info.printerName} finished`,

                                body:
                                    `Copy ${info.copyNumber} finished. ` +
                                    `${info.batchCompleted}/${info.totalCopies} completed.`
                            }).show();
                        },


                    onRecoveryAvailable:
                        info => {

                            if (
                                !Notification.isSupported()
                            ) {

                                return;
                            }


                            const key =
                                `${info.batchId}::${info.printerName}`;


                            const oldNotification =
                                continueNotifications.get(
                                    key
                                );


                            if (
                                oldNotification
                            ) {

                                try {

                                    oldNotification.close();

                                } catch { }


                                continueNotifications.delete(
                                    key
                                );
                            }


                            const notification =
                                new Notification({

                                    title:
                                        `${info.printerName} available`,

                                    body:
                                        info.copyNumber
                                            ? `Copy ${info.copyNumber} needs reassignment. Continue printing on this printer?`
                                            : "A failed copy needs reassignment. Continue printing on this printer?",

                                    actions: [
                                        {
                                            type:
                                                "button",

                                            text:
                                                "Continue"
                                        }
                                    ],

                                    timeoutType:
                                        "never"
                                });


                            continueNotifications.set(
                                key,
                                notification
                            );


                            notification.on(
                                "action",
                                event => {

                                    if (
                                        event.actionIndex !==
                                        0
                                    ) {

                                        return;
                                    }


                                    const result =
                                        continuePrinter(
                                            info.batchId,
                                            info.printerName
                                        );


                                    if (
                                        result.success
                                    ) {

                                        try {

                                            notification.close();

                                        } catch { }


                                        continueNotifications.delete(
                                            key
                                        );

                                    } else {

                                        new Notification({

                                            title:
                                                `${info.printerName} could not continue`,

                                            body:
                                                result.error ||
                                                "Unknown Continue error."
                                        }).show();
                                    }
                                }
                            );


                            notification.on(
                                "close",
                                () => {

                                    if (
                                        continueNotifications.get(
                                            key
                                        ) ===
                                        notification
                                    ) {

                                        continueNotifications.delete(
                                            key
                                        );
                                    }
                                }
                            );


                            notification.show();
                        },


                    onCopyFailed:
                        info => {

                            if (
                                Notification.isSupported()
                            ) {

                                new Notification({

                                    title:
                                        `${info.printerName} error`,

                                    body:
                                        `Copy ${info.copyNumber} failed: ` +
                                        `${info.error}`
                                }).show();
                            }
                        },


                    onBatchFinished:
                        info => {

                            closeBatchContinueNotifications(
                                info.batchId
                            );
                        }
                }
            )
                .catch(
                    error => {

                        console.error(
                            "[BATCH]",
                            error
                        );
                    }
                );


            return {

                success:
                    true,

                batch
            };


        } catch (
        error
        ) {

            return {

                success:
                    false,

                error:
                    error.message
            };
        }
    }
);
// ==========================================================
// GET BATCH
// ==========================================================

ipcMain.handle(
    "get-batch",

    async (
        _event,
        batchId
    ) => {

        const batch =
            getBatch(batchId);

        if (!batch) {
            return {
                success: false,
                error:
                    "Batch not found."
            };
        }

        return {
            success: true,
            batch
        };
    }
);


// ==========================================================
// RETRY JOB
// ==========================================================

ipcMain.handle(
    "retry-job",

    async (
        _event,
        batchId,
        jobId
    ) => {

        return await retryJob(
            batchId,
            jobId
        );
    }
);


// ==========================================================
// DASHBOARD JOB CONTROLS - v5.1.0
// ==========================================================

ipcMain.handle(
    "cancel-batch",
    async (
        _event,
        batchId
    ) => {

        const result =
            cancelBatch(
                batchId
            );


        if (
            result.success
        ) {

            closeBatchContinueNotifications(
                batchId
            );
        }


        return result;
    }
);


ipcMain.handle(
    "force-error",
    async (
        _event,
        batchId,
        jobId
    ) =>
        forceError(
            batchId,
            jobId
        )
);


ipcMain.handle(
    "pause-copy",
    async (
        _event,
        batchId,
        copyNumber
    ) =>
        pauseCopy(
            batchId,
            copyNumber
        )
);


ipcMain.handle(
    "resume-copy",
    async (
        _event,
        batchId,
        copyNumber
    ) =>
        resumeCopy(
            batchId,
            copyNumber
        )
);


// ==========================================================
// PRINT PROFILES
// ==========================================================

function loadPrintProfiles() {

    const profilePath =
        ensureWritableProfilesFile();

    if (!fs.existsSync(profilePath)) {

        throw new Error(
            "profiles.json was not found."
        );
    }

    let raw =
        fs.readFileSync(
            profilePath,
            "utf8"
        );


    // v6.2.5 migration:
    // Older builds accidentally appended the two literal characters
    // "\\n" after the closing JSON brace. Repair that file once.
    const repairedRaw =
        raw.replace(
            /\\n\s*$/,
            ""
        );


    if (
        repairedRaw !==
        raw
    ) {

        raw =
            repairedRaw;


        fs.writeFileSync(
            profilePath,
            raw + "\n",
            "utf8"
        );
    }


    const data =
        JSON.parse(raw);

    if (!Array.isArray(data.profiles)) {

        throw new Error(
            "profiles.json does not contain a valid profiles array."
        );
    }

    return {
        defaultProfile:
            data.defaultProfile || null,

        profiles:
            data.profiles
    };
}


function validateProfileData(
    data
) {

    if (
        !data ||
        !Array.isArray(
            data.profiles
        )
    ) {

        throw new Error(
            "Profiles data is invalid."
        );
    }


    if (
        data.profiles.length ===
        0
    ) {

        throw new Error(
            "At least one print profile is required."
        );
    }


    const ids =
        new Set();


    for (
        const profile
        of data.profiles
    ) {

        const id =
            String(
                profile?.id ||
                ""
            ).trim();


        const name =
            String(
                profile?.name ||
                ""
            ).trim();


        if (!id) {

            throw new Error(
                "Every profile needs an ID."
            );
        }


        if (
            !/^[a-z0-9][a-z0-9-_]*$/i.test(
                id
            )
        ) {

            throw new Error(
                `Profile ID "${id}" can only contain letters, numbers, hyphens, and underscores.`
            );
        }


        if (
            ids.has(
                id
            )
        ) {

            throw new Error(
                `Duplicate profile ID: ${id}`
            );
        }


        ids.add(
            id
        );


        if (!name) {

            throw new Error(
                `Profile "${id}" needs a name.`
            );
        }
    }


    if (
        data.defaultProfile &&
        !ids.has(
            data.defaultProfile
        )
    ) {

        throw new Error(
            "The selected default profile does not exist."
        );
    }


    return true;
}


function savePrintProfiles(
    data
) {

    validateProfileData(
        data
    );


    const profilePath =
        getProfilesPath();


    const backupPath =
        `${profilePath}.backup`;


    if (
        fs.existsSync(
            profilePath
        )
    ) {

        fs.copyFileSync(
            profilePath,
            backupPath
        );
    }


    fs.writeFileSync(
        profilePath,
        JSON.stringify(
            data,
            null,
            2
        ) + "\n",
        "utf8"
    );


    return {
        defaultProfile:
            data.defaultProfile ||
            null,

        profiles:
            data.profiles
    };
}


// ==========================================================
// GET PRINT PROFILES
// ==========================================================

ipcMain.handle(
    "get-print-profiles",
    async () => {

        try {

            const data =
                loadPrintProfiles();

            return {
                success: true,
                ...data
            };

        } catch (error) {

            console.error(
                "[PROFILES]",
                error.message
            );

            return {
                success: false,
                defaultProfile: null,
                profiles: [],
                error:
                    error.message
            };
        }
    }
);


// ==========================================================
// SAVE PRINT PROFILES - v5.2.0
// ==========================================================

ipcMain.handle(
    "save-print-profiles",
    async (
        _event,
        data
    ) => {

        try {

            const saved =
                savePrintProfiles(
                    data
                );


            buildApplicationMenu();


            if (
                mainWindow &&
                !mainWindow.isDestroyed()
            ) {

                mainWindow.webContents.send(
                    "profiles-changed"
                );
            }


            return {
                success:
                    true,

                ...saved
            };

        } catch (
        error
        ) {

            console.error(
                "[SAVE PROFILES]",
                error
            );


            return {
                success:
                    false,

                error:
                    error.message
            };
        }
    }
);


// ==========================================================
// PRINTER MODEL IMAGES
// ==========================================================

function loadPrinterModels() {
    const modelPath = path.join(
        __dirname,
        "printer-models.json"
    );

    if (!fs.existsSync(modelPath)) {
        return {
            defaultImage: "assets/printers/default.png",
            models: []
        };
    }

    const data = JSON.parse(
        fs.readFileSync(modelPath, "utf8")
    );

    return {
        defaultImage:
            data.defaultImage ||
            "assets/printers/default.png",
        models:
            Array.isArray(data.models)
                ? data.models
                : []
    };
}


ipcMain.handle(
    "get-printer-models",
    async () => {
        try {
            return {
                success: true,
                ...loadPrinterModels()
            };
        } catch (error) {
            return {
                success: false,
                error: error.message,
                defaultImage: "assets/printers/default.png",
                models: []
            };
        }
    }
);


// ==========================================================
// WINDOWS NOTIFICATIONS
// ==========================================================

ipcMain.on(
    "show-notification",

    (_event, data) => {

        if (
            !Notification.isSupported()
        ) {
            return;
        }

        new Notification({
            title:
                data.title ||
                "Brother Print Farm",

            body:
                data.body || ""
        }).show();
    }
);
