const { execFile } = require("child_process");
const { getPrinters, print } = require("pdf-to-printer");


// ==========================================================
// BROTHER PRINT FARM
// printer.js
// v4.0.0
//
// Handles:
// - Windows printer discovery
// - Printer status
// - Windows print queue
// - Live printer monitoring
// - REAL PDF printing
//
// v4.0.0:
// Test / simulation mode has been removed.
// printPdf() ALWAYS sends the job to a real printer.
// ==========================================================


// ==========================================================
// POWERSHELL
// ==========================================================

function runPowerShell(command) {

    return new Promise((resolve, reject) => {

        execFile(
            "powershell.exe",
            [
                "-NoProfile",
                "-ExecutionPolicy",
                "Bypass",
                "-Command",
                command
            ],
            {
                windowsHide: true,
                maxBuffer: 1024 * 1024 * 10
            },
            (error, stdout, stderr) => {

                if (error) {

                    reject(
                        new Error(
                            stderr?.trim() ||
                            error.message
                        )
                    );

                    return;
                }


                resolve(
                    stdout.trim()
                );
            }
        );
    });
}


// ==========================================================
// PRINTER DISCOVERY
// ==========================================================

async function getWindowsPrinters() {

    const basicPrinters =
        await getPrinters();


    const command = `
        Get-CimInstance Win32_Printer |
        Select-Object Name,
            Default,
            WorkOffline,
            PrinterStatus,
            ExtendedPrinterStatus,
            DetectedErrorState,
            DriverName,
            PortName |
        ConvertTo-Json -Compress
    `;


    let windowsPrinters = [];


    try {

        const output =
            await runPowerShell(command);


        if (output) {

            const parsed =
                JSON.parse(output);


            windowsPrinters =
                Array.isArray(parsed)
                    ? parsed
                    : [parsed];
        }


    } catch (error) {

        console.warn(
            "[PRINTER] Could not query detailed printer status:",
            error.message
        );
    }


    return basicPrinters.map(printer => {

        const windowsPrinter =
            windowsPrinters.find(
                item =>
                    item.Name === printer.name
            );


        return {

            ...printer,

            default:
                windowsPrinter?.Default ??
                false,

            offline:
                windowsPrinter?.WorkOffline ??
                false,

            printerStatus:
                windowsPrinter?.PrinterStatus ??
                null,

            extendedStatus:
                windowsPrinter?.ExtendedPrinterStatus ??
                null,

            errorState:
                windowsPrinter?.DetectedErrorState ??
                null,

            driverName:
                windowsPrinter?.DriverName ??
                "",

            portName:
                windowsPrinter?.PortName ??
                ""
        };
    });
}


// ==========================================================
// INDIVIDUAL PRINTER STATUS
// ==========================================================

async function getPrinterStatus(printerName) {

    const safeName =
        String(printerName)
            .replace(/'/g, "''");


    const command = `
        Get-CimInstance Win32_Printer |
        Where-Object {
            $_.Name -eq '${safeName}'
        } |
        Select-Object Name,
            Default,
            WorkOffline,
            PrinterStatus,
            ExtendedPrinterStatus,
            DetectedErrorState,
            DriverName,
            PortName |
        ConvertTo-Json -Compress
    `;


    const output =
        await runPowerShell(command);


    if (!output) {

        return null;
    }


    return JSON.parse(output);
}


// ==========================================================
// WINDOWS PRINT QUEUE
// ==========================================================

async function getPrintJobs(printerName) {

    const safeName =
        String(printerName)
            .replace(/'/g, "''");


    const command = `
        Get-PrintJob -PrinterName '${safeName}' |
        Select-Object ID,
            DocumentName,
            JobStatus,
            SubmittedTime,
            Size,
            TotalPages |
        ConvertTo-Json -Compress
    `;


    try {

        const output =
            await runPowerShell(command);


        if (!output) {

            return [];
        }


        const parsed =
            JSON.parse(output);


        return Array.isArray(parsed)
            ? parsed
            : [parsed];


    } catch (error) {

        console.warn(
            `[PRINTER] Could not read queue for "${printerName}":`,
            error.message
        );


        return [];
    }
}


// ==========================================================
// REAL PDF PRINTING
// ==========================================================
//
// IMPORTANT:
// v4.0.0 has NO simulation mode.
//
// Calling printPdf() WILL send the PDF to Windows printing.
// ==========================================================

async function printPdf(options) {

    const {
        filePath,
        printerName,
        copies,
        paperSize,
        duplex,
        monochrome
    } = options;


    // ------------------------------------------------------
    // Basic validation
    // ------------------------------------------------------

    if (!filePath) {

        return {
            success: false,
            printerName,
            copies,
            error:
                "No PDF file was provided."
        };
    }


    if (!printerName) {

        return {
            success: false,
            printerName,
            copies,
            error:
                "No printer was selected."
        };
    }


    if (
        !Number.isInteger(copies) ||
        copies < 1
    ) {

        return {
            success: false,
            printerName,
            copies,
            error:
                "Invalid copy count."
        };
    }


    // ------------------------------------------------------
    // Build pdf-to-printer options
    // ------------------------------------------------------

    try {

        const printOptions = {

            printer:
                printerName,

            copies,

            paperSize,

            monochrome:
                Boolean(monochrome)
        };


        // --------------------------------------------------
        // Duplex
        // --------------------------------------------------

        if (
            duplex &&
            duplex !== "simplex"
        ) {

            printOptions.side =
                duplex;
        }


        console.log(
            `[PRINTER] Sending ${copies} ` +
            `${copies === 1 ? "copy" : "copies"} ` +
            `to "${printerName}"`
        );


        console.log(
            `[PRINTER] File: ${filePath}`
        );


        // --------------------------------------------------
        // REAL PRINT COMMAND
        // --------------------------------------------------

        await print(
            filePath,
            printOptions
        );


        console.log(
            `[PRINTER] Job accepted for "${printerName}"`
        );


        return {

            success: true,

            printerName,

            copies
        };


    } catch (error) {

        console.error(
            `[PRINTER] Printing failed on "${printerName}":`,
            error.message
        );


        return {

            success: false,

            printerName,

            copies,

            error:
                error.message
        };
    }
}


// ==========================================================
// READABLE PRINTER STATE
// ==========================================================

function getReadablePrinterState(printer) {

    const errorState =
        Number(
            printer.DetectedErrorState
        );


    const printerStatus =
        Number(
            printer.PrinterStatus
        );


    const jobCount =
        Number(
            printer.JobCount || 0
        );


    // ------------------------------------------------------
    // OFFLINE
    // ------------------------------------------------------

    if (
        printer.WorkOffline === true ||
        printerStatus === 7 ||
        errorState === 9
    ) {

        return {

            state:
                "OFFLINE",

            label:
                "Offline"
        };
    }


    // ------------------------------------------------------
    // WINDOWS ERROR STATES
    // ------------------------------------------------------

    const errorStates = {

        3: {

            state:
                "LOW_PAPER",

            label:
                "Low paper"
        },


        4: {

            state:
                "PAPER_OUT",

            label:
                "Paper out"
        },


        5: {

            state:
                "LOW_TONER",

            label:
                "Low toner"
        },


        6: {

            state:
                "TONER_OUT",

            label:
                "Toner empty"
        },


        7: {

            state:
                "DOOR_OPEN",

            label:
                "Door open"
        },


        8: {

            state:
                "PAPER_JAM",

            label:
                "Paper jam"
        },


        10: {

            state:
                "SERVICE",

            label:
                "Service required"
        },


        11: {

            state:
                "OUTPUT_FULL",

            label:
                "Output bin full"
        }
    };


    if (
        errorStates[errorState]
    ) {

        return errorStates[
            errorState
        ];
    }


    // ------------------------------------------------------
    // PRINTING
    // ------------------------------------------------------

    if (
        jobCount > 0 ||
        printerStatus === 4
    ) {

        return {

            state:
                "PRINTING",

            label:
                "Printing"
        };
    }


    // ------------------------------------------------------
    // WARMING UP
    // ------------------------------------------------------

    if (
        printerStatus === 5
    ) {

        return {

            state:
                "WARMING_UP",

            label:
                "Warming up"
        };
    }


    // ------------------------------------------------------
    // STOPPED
    // ------------------------------------------------------

    if (
        printerStatus === 6
    ) {

        return {

            state:
                "STOPPED",

            label:
                "Stopped"
        };
    }


    // ------------------------------------------------------
    // READY
    // ------------------------------------------------------

    if (
        printerStatus === 3
    ) {

        return {

            state:
                "READY",

            label:
                "Ready"
        };
    }


    // ------------------------------------------------------
    // UNKNOWN
    // ------------------------------------------------------

    return {

        state:
            "UNKNOWN",

        label:
            "Unknown"
    };
}


// ==========================================================
// LIVE PRINTER STATES
// ==========================================================

async function getLivePrinterStates() {

    const command = `

        $printers =
            Get-CimInstance Win32_Printer


        $result =
            foreach ($printer in $printers) {


                try {

                    $jobs = @(

                        Get-PrintJob \
                            -PrinterName $printer.Name \
                            -ErrorAction Stop

                    )

                }

                catch {

                    $jobs = @()

                }


                [PSCustomObject]@{

                    Name =
                        $printer.Name

                    Default =
                        [bool]$printer.Default

                    WorkOffline =
                        [bool]$printer.WorkOffline

                    PrinterStatus =
                        $printer.PrinterStatus

                    ExtendedPrinterStatus =
                        $printer.ExtendedPrinterStatus

                    DetectedErrorState =
                        $printer.DetectedErrorState

                    DriverName =
                        $printer.DriverName

                    PortName =
                        $printer.PortName

                    JobCount =
                        $jobs.Count


                    Jobs = @(

                        $jobs |

                        Select-Object \
                            ID,
                            DocumentName,
                            JobStatus,
                            SubmittedTime,
                            Size,
                            TotalPages

                    )
                }
            }


        $result |
            ConvertTo-Json \
                -Depth 6 \
                -Compress
    `;


    const output =
        await runPowerShell(command);


    if (!output) {

        return [];
    }


    const parsed =
        JSON.parse(output);


    const rawPrinters =
        Array.isArray(parsed)
            ? parsed
            : [parsed];


    return rawPrinters.map(
        printer => {


            const readable =
                getReadablePrinterState(
                    printer
                );


            return {

                name:
                    printer.Name,

                default:
                    printer.Default,

                offline:
                    printer.WorkOffline,

                printerStatus:
                    printer.PrinterStatus,

                extendedStatus:
                    printer.ExtendedPrinterStatus,

                errorState:
                    printer.DetectedErrorState,

                driverName:
                    printer.DriverName,

                portName:
                    printer.PortName,

                jobCount:
                    printer.JobCount || 0,

                jobs:
                    printer.Jobs || [],

                state:
                    readable.state,

                stateLabel:
                    readable.label
            };
        }
    );
}


// ==========================================================
// EXPORTS
// ==========================================================

module.exports = {

    getWindowsPrinters,

    getPrinterStatus,

    getPrintJobs,

    getLivePrinterStates,

    printPdf
};