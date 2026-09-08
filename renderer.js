const selectPdfBtn = document.getElementById("selectPdfBtn");
const refreshPrintersBtn = document.getElementById("refreshPrintersBtn");
const selectAllBtn = document.getElementById("selectAllBtn");
const startBtn = document.getElementById("startBtn");
const clearBtn = document.getElementById("clearBtn");

const filePathElement = document.getElementById("filePath");
const printerListElement = document.getElementById("printerList");
const printerSummaryElement = document.getElementById("printerSummary");
const distributionPreviewElement =
    document.getElementById("distributionPreview");
const statusListElement = document.getElementById("statusList");

const totalCopiesInput = document.getElementById("totalCopies");
const paperSizeSelect = document.getElementById("paperSize");
const duplexSelect = document.getElementById("duplex");
const monochromeCheckbox = document.getElementById("monochrome");
const realPrintingCheckbox = document.getElementById("realPrinting");
const modeBadge = document.getElementById("modeBadge");

let selectedFilePath = "";
let printers = [];
let batchRunning = false;
const LIVE_REFRESH_MS = 3000;

let liveMonitorTimer = null;

selectPdfBtn.addEventListener("click", async () => {
    const filePath = await window.printFarm.selectPdf();

    if (!filePath) {
        return;
    }

    selectedFilePath = filePath;
    filePathElement.textContent = filePath;
});

refreshPrintersBtn.addEventListener("click", loadPrinters);

selectAllBtn.addEventListener("click", () => {
    const checkboxes = getPrinterCheckboxes();
    const shouldSelectAll = checkboxes.some(box => !box.checked);

    checkboxes.forEach(box => {
        box.checked = shouldSelectAll;
    });

    selectAllBtn.textContent = shouldSelectAll
        ? "Clear selection"
        : "Select all";

    updateDistribution();
});

totalCopiesInput.addEventListener("input", updateDistribution);

realPrintingCheckbox.addEventListener("change", () => {
    if (realPrintingCheckbox.checked) {
        modeBadge.textContent = "REAL PRINTING";
        modeBadge.className = "badge real";
    } else {
        modeBadge.textContent = "TEST MODE";
        modeBadge.className = "badge test";
    }
});

clearBtn.addEventListener("click", () => {
    if (batchRunning) {
        return;
    }

    statusListElement.textContent = "No batch started.";
});

startBtn.addEventListener("click", startBatch);

async function loadPrinters() {
    refreshPrintersBtn.disabled = true;

    printerListElement.textContent =
        "Loading Windows printers...";

    const result =
        await window.printFarm.getPrinters();

    refreshPrintersBtn.disabled = false;

    if (!result.success) {
        printerListElement.textContent =
            `Could not load printers: ${result.error}`;

        return;
    }

    printers =
        result.printers || [];

    renderPrinters();

    await refreshLivePrinterStates();

    startLiveMonitoring();
}

function renderPrinters() {
    printerListElement.innerHTML = "";

    if (printers.length === 0) {
        printerListElement.textContent =
            "No printers were found in Windows.";

        printerSummaryElement.textContent =
            "0 printers found";

        return;
    }

    printers.forEach((printer, index) => {
        const label =
            document.createElement("label");

        label.className =
            "printer-card";

        const checkbox =
            document.createElement("input");

        checkbox.type =
            "checkbox";

        checkbox.value =
            printer.name;

        checkbox.dataset.index =
            index;

        checkbox.addEventListener(
            "change",
            updateDistribution
        );

        const information =
            document.createElement("div");

        information.className =
            "printer-information";

        const name =
            document.createElement("span");

        name.className =
            "printer-name";

        name.textContent =
            printer.name;

        const liveRow =
            document.createElement("div");

        liveRow.className =
            "printer-live-row";

        const status =
            document.createElement("span");

        status.className =
            "printer-status status-unknown";

        status.dataset.printerStatus =
            printer.name;

        status.textContent =
            "● Checking...";

        const queue =
            document.createElement("span");

        queue.className =
            "printer-queue";

        queue.dataset.printerQueue =
            printer.name;

        queue.textContent =
            "Queue: --";

        liveRow.appendChild(
            status
        );

        liveRow.appendChild(
            queue
        );

        information.appendChild(
            name
        );

        information.appendChild(
            liveRow
        );

        label.appendChild(
            checkbox
        );

        label.appendChild(
            information
        );

        printerListElement.appendChild(
            label
        );
    });

    printerSummaryElement.textContent =
        `${printers.length} printers found`;

    updateDistribution();
}

function startLiveMonitoring() {
    if (liveMonitorTimer) {
        clearInterval(
            liveMonitorTimer
        );
    }

    liveMonitorTimer =
        setInterval(
            refreshLivePrinterStates,
            LIVE_REFRESH_MS
        );
}


async function refreshLivePrinterStates() {
    try {
        const result =
            await window.printFarm
                .getLivePrinterStates();

        if (!result.success) {
            console.warn(
                "Live monitor failed:",
                result.error
            );

            return;
        }

        const livePrinters =
            result.printers || [];

        livePrinters.forEach(
            updatePrinterLiveUI
        );

    } catch (error) {
        console.error(
            "Live printer refresh failed:",
            error
        );
    }
}


function updatePrinterLiveUI(printer) {
    const statusElement =
        document.querySelector(
            `[data-printer-status="${CSS.escape(printer.name)}"]`
        );

    const queueElement =
        document.querySelector(
            `[data-printer-queue="${CSS.escape(printer.name)}"]`
        );

    if (!statusElement) {
        return;
    }

    statusElement.textContent =
        `● ${printer.stateLabel}`;

    statusElement.className =
        "printer-status";

    switch (printer.state) {
        case "READY":
            statusElement.classList.add(
                "status-ready"
            );
            break;

        case "PRINTING":
        case "WARMING_UP":
            statusElement.classList.add(
                "status-printing"
            );
            break;

        case "LOW_PAPER":
        case "LOW_TONER":
            statusElement.classList.add(
                "status-warning"
            );
            break;

        case "PAPER_OUT":
        case "TONER_OUT":
        case "PAPER_JAM":
        case "DOOR_OPEN":
        case "SERVICE":
        case "OUTPUT_FULL":
        case "OFFLINE":
        case "STOPPED":
            statusElement.classList.add(
                "status-error"
            );
            break;

        default:
            statusElement.classList.add(
                "status-unknown"
            );
    }

    if (queueElement) {
        queueElement.textContent =
            `Queue: ${printer.jobCount}`;
    }
}

function getPrinterCheckboxes() {
    return Array.from(
        printerListElement.querySelectorAll(
            'input[type="checkbox"]'
        )
    );
}

function getSelectedPrinterNames() {
    return getPrinterCheckboxes()
        .filter(box => box.checked)
        .map(box => box.value);
}

function calculateDistribution(totalCopies, selectedPrinters) {
    const count = selectedPrinters.length;

    if (count === 0 || totalCopies < 1) {
        return [];
    }

    const baseCopies = Math.floor(totalCopies / count);
    const remainder = totalCopies % count;

    return selectedPrinters
        .map((printerName, index) => ({
            printerName,
            copies: baseCopies + (index < remainder ? 1 : 0)
        }))
        .filter(item => item.copies > 0);
}

function updateDistribution() {
    const totalCopies = Number(totalCopiesInput.value);
    const selectedPrinters = getSelectedPrinterNames();
    const distribution =
        calculateDistribution(totalCopies, selectedPrinters);

    printerSummaryElement.textContent =
        `${printers.length} found · ${selectedPrinters.length} selected`;

    distributionPreviewElement.innerHTML = "";

    if (selectedPrinters.length === 0) {
        distributionPreviewElement.textContent =
            "Select printers to see the copy distribution.";
        return;
    }

    if (!Number.isInteger(totalCopies) || totalCopies < 1) {
        distributionPreviewElement.textContent =
            "Enter a valid total number of copies.";
        return;
    }

    distribution.forEach(item => {
        const row = document.createElement("div");
        row.className = "distribution-row";

        row.innerHTML = `
      <span>${escapeHtml(item.printerName)}</span>
      <strong>${item.copies} copies</strong>
      <span>Ready</span>
    `;

        distributionPreviewElement.appendChild(row);
    });
}

async function startBatch() {
    if (batchRunning) {
        return;
    }

    const totalCopies =
        Number(totalCopiesInput.value);

    const selectedPrinters =
        getSelectedPrinterNames();

    const realPrinting =
        realPrintingCheckbox.checked;

    if (!selectedFilePath) {
        alert("Choose a PDF first.");
        return;
    }

    if (
        !Number.isInteger(totalCopies) ||
        totalCopies < 1
    ) {
        alert(
            "Enter a valid number of copies."
        );

        return;
    }

    if (selectedPrinters.length === 0) {
        alert(
            "Select at least one printer."
        );

        return;
    }

    if (realPrinting) {
        const confirmed =
            confirm(
                `REAL PRINTING IS ENABLED.\n\n` +
                `This will send ${totalCopies} copies across ` +
                `${selectedPrinters.length} printers.\n\n` +
                `Continue?`
            );

        if (!confirmed) {
            return;
        }
    }

    batchRunning = true;

    startBtn.disabled = true;
    refreshPrintersBtn.disabled = true;

    statusListElement.textContent =
        realPrinting
            ? "Creating print batch..."
            : "Creating simulated batch...";

    try {
        const result =
            await window.printFarm.startBatch({
                filePath:
                    selectedFilePath,

                totalCopies,

                printers:
                    selectedPrinters,

                paperSize:
                    paperSizeSelect.value,

                duplex:
                    duplexSelect.value,

                monochrome:
                    monochromeCheckbox.checked,

                realPrinting
            });

        if (!result.success) {
            statusListElement.textContent =
                `Batch failed: ${result.error}`;

            return;
        }

        const batch =
            result.batch;

        renderBatchStatus(batch);

        const failedJobs =
            batch.jobs.filter(
                job =>
                    job.status === "FAILED"
            );

        window.printFarm.notify({
            title:
                failedJobs.length === 0
                    ? "Print batch submitted"
                    : "Print batch finished with errors",

            body:
                `${batch.id}: ` +
                `${batch.jobs.length - failedJobs.length} successful, ` +
                `${failedJobs.length} failed.`
        });

        await refreshLivePrinterStates();

    } catch (error) {
        statusListElement.textContent =
            `Unexpected error: ${error.message}`;

    } finally {
        batchRunning = false;

        startBtn.disabled = false;
        refreshPrintersBtn.disabled = false;
    }
}

function renderBatchStatus(batch) {
    statusListElement.innerHTML = "";

    const heading =
        document.createElement("div");

    heading.className =
        "batch-heading";

    heading.innerHTML = `
        <strong>${escapeHtml(batch.id)}</strong>
        <span>${escapeHtml(batch.status)}</span>
    `;

    statusListElement.appendChild(
        heading
    );

    batch.jobs.forEach(job => {
        const row =
            document.createElement("div");

        row.className =
            "status-row";

        const statusClass =
            job.status === "FAILED"
                ? "status-error"
                : "status-success";

        row.innerHTML = `
            <span>
                ${escapeHtml(job.printerName)}
            </span>

            <span>
                ${job.copies} copies
            </span>

            <span class="${statusClass}">
                ${escapeHtml(job.status)}
            </span>
        `;

        statusListElement.appendChild(
            row
        );
    });
}

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}