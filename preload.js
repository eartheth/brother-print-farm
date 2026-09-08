const {
    contextBridge,
    ipcRenderer
} = require("electron");


// ==========================================================
// BROTHER PRINT FARM
// preload.js
// v5.2.0
//
// Secure bridge between:
// app.js  <->  main.js
// ==========================================================


contextBridge.exposeInMainWorld(
    "printFarm",
    {

        // ==================================================
        // PDF
        // ==================================================

        selectPdf: () =>
            ipcRenderer.invoke(
                "select-pdf"
            ),


        // ==================================================
        // PRINT PROFILES
        // ==================================================

        getPrintProfiles: () =>
            ipcRenderer.invoke(
                "get-print-profiles"
            ),


        savePrintProfiles: data =>
            ipcRenderer.invoke(
                "save-print-profiles",
                data
            ),


        // ==================================================
        // PRINTER MODEL IMAGES
        // ==================================================

        getPrinterModels: () =>
            ipcRenderer.invoke(
                "get-printer-models"
            ),


        // ==================================================
        // PRINTER DISCOVERY
        // ==================================================

        getPrinters: () =>
            ipcRenderer.invoke(
                "get-printers"
            ),


        // ==================================================
        // INDIVIDUAL PRINTER STATUS
        // ==================================================

        getPrinterStatus: printerName =>
            ipcRenderer.invoke(
                "get-printer-status",
                printerName
            ),


        // ==================================================
        // WINDOWS PRINT QUEUE
        // ==================================================

        getPrintJobs: printerName =>
            ipcRenderer.invoke(
                "get-print-jobs",
                printerName
            ),


        // ==================================================
        // LIVE PRINTER MONITOR
        // ==================================================

        getLivePrinterStates: () =>
            ipcRenderer.invoke(
                "get-live-printer-states"
            ),


        // ==================================================
        // START PRINT BATCH
        // ==================================================

        startBatch: data =>
            ipcRenderer.invoke(
                "start-batch",
                data
            ),


        // ==================================================
        // GET BATCH
        // ==================================================

        getBatch: batchId =>
            ipcRenderer.invoke(
                "get-batch",
                batchId
            ),

        // ==================================================
        // JOB HISTORY
        // ==================================================

        getJobHistory: () =>
            ipcRenderer.invoke(
                "get-job-history"
            ),

        // ==================================================
        // RETRY FAILED JOB
        // ==================================================

        retryJob: (
            batchId,
            jobId
        ) =>
            ipcRenderer.invoke(
                "retry-job",
                batchId,
                jobId
            ),

        // ==================================================
        // TEST PRINT
        // ==================================================

        testPrint: printerName =>
            ipcRenderer.invoke(
                "test-print",
                {
                    printerName
                }
            ),


        // ==================================================
        // DASHBOARD CONTROLS
        // ==================================================

        cancelBatch: batchId =>
            ipcRenderer.invoke(
                "cancel-batch",
                batchId
            ),


        forceError: (
            batchId,
            jobId
        ) =>
            ipcRenderer.invoke(
                "force-error",
                batchId,
                jobId
            ),


        pauseCopy: (
            batchId,
            copyNumber
        ) =>
            ipcRenderer.invoke(
                "pause-copy",
                batchId,
                copyNumber
            ),


        resumeCopy: (
            batchId,
            copyNumber
        ) =>
            ipcRenderer.invoke(
                "resume-copy",
                batchId,
                copyNumber
            ),


        onProfilesChanged:
            callback => {

                const listener =
                    () =>
                        callback();


                ipcRenderer.on(
                    "profiles-changed",
                    listener
                );


                return () =>
                    ipcRenderer.removeListener(
                        "profiles-changed",
                        listener
                    );
            },


        // ==================================================
        // WINDOWS NOTIFICATION
        // ==================================================

        notify: data =>
            ipcRenderer.send(
                "show-notification",
                data
            )
    }
);