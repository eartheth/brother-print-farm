// ==========================================================
// BROTHER PRINT FARM
// app.js
// v4.6.0
//
// Features:
// - Step-by-step workflow
// - PDF selection
// - JSON print profiles
// - Saved profiles show summary only
// - Custom profile reveals limited settings
// - Printer shelf UI
// - Live printer monitoring
// - Distribution preview
// - REAL PRINTING ONLY
// ==========================================================


// ==========================================================
// APPLICATION STATE
// ==========================================================

let selectedFilePath = null;

let printers = [];

let currentStep = 1;

let batchRunning = false;

let liveMonitorTimer = null;

let pendingProfilePrinterSelection = null;


// ==========================================================
// PROFILE STATE
// ==========================================================

let printProfiles = [];

let defaultProfileId = null;

let applyingProfile = false;

let printerModelConfig = {
    defaultImage: "assets/printers/default.png",
    models: []
};


// ==========================================================
// CONSTANTS
// ==========================================================

const LIVE_REFRESH_MS = 3000;


// ==========================================================
// PAGE ELEMENTS
// ==========================================================

const pageTitle =
    document.getElementById(
        "pageTitle"
    );


const pageDescription =
    document.getElementById(
        "pageDescription"
    );


const systemStatus =
    document.getElementById(
        "systemStatus"
    );


// ==========================================================
// STEP 1 - PDF
// ==========================================================

const choosePdfBtn =
    document.getElementById(
        "choosePdfBtn"
    );


const changePdfBtn =
    document.getElementById(
        "changePdfBtn"
    );


const selectedFileCard =
    document.getElementById(
        "selectedFileCard"
    );


const selectedFileName =
    document.getElementById(
        "selectedFileName"
    );


const selectedFilePathElement =
    document.getElementById(
        "selectedFilePath"
    );


const documentActions =
    document.getElementById(
        "documentActions"
    );


const documentNextBtn =
    document.getElementById(
        "documentNextBtn"
    );


// ==========================================================
// STEP 2 - JOB SETTINGS
// ==========================================================

const totalCopiesInput =
    document.getElementById(
        "totalCopies"
    );


// ==========================================================
// STEP 2 - PROFILE
// ==========================================================

const printProfileSelect =
    document.getElementById(
        "printProfile"
    );


const profileName =
    document.getElementById(
        "profileName"
    );


const profileDescription =
    document.getElementById(
        "profileDescription"
    );


const profileSummary =
    document.getElementById(
        "profileSummary"
    );


const profileSummaryPaper =
    document.getElementById(
        "profileSummaryPaper"
    );


const profileSummaryLayout =
    document.getElementById(
        "profileSummaryLayout"
    );


const profileSummarySource =
    document.getElementById(
        "profileSummarySource"
    );


const profileSummaryQuality =
    document.getElementById(
        "profileSummaryQuality"
    );


const profileSummaryColor =
    document.getElementById(
        "profileSummaryColor"
    );


// ==========================================================
// STEP 2 - CUSTOM SETTINGS
// ==========================================================

const customSettingsPanel =
    document.getElementById(
        "customSettingsPanel"
    );


const paperSizeSelect =
    document.getElementById(
        "paperSize"
    );


const mediaTypeSelect =
    document.getElementById(
        "mediaType"
    );


const orientationSelect =
    document.getElementById(
        "orientation"
    );


const pageOrderSelect =
    document.getElementById(
        "pageOrder"
    );


const pagesPerSheetSelect =
    document.getElementById(
        "pagesPerSheet"
    );

const pageSelectionSelect =
    document.getElementById(
        "pageSelection"
    );

const customPagesField =
    document.getElementById(
        "customPagesField"
    );

const customPagesInput =
    document.getElementById(
        "customPages"
    );


const paperSourceSelect =
    document.getElementById(
        "paperSource"
    );


const printQualitySelect =
    document.getElementById(
        "printQuality"
    );


const colorModeSelect =
    document.getElementById(
        "colorMode"
    );


const settingsNextBtn =
    document.getElementById(
        "settingsNextBtn"
    );


// ==========================================================
// STEP 3 - PRINTERS
// ==========================================================

const printerListElement =
    document.getElementById(
        "printerList"
    );


const printerSummaryElement =
    document.getElementById(
        "printerSummary"
    );


const refreshPrintersBtn =
    document.getElementById(
        "refreshPrintersBtn"
    );


const selectAllBtn =
    document.getElementById(
        "selectAllBtn"
    );


const printersNextBtn =
    document.getElementById(
        "printersNextBtn"
    );


// ==========================================================
// STEP 4 - REVIEW
// ==========================================================

const summaryCopies =
    document.getElementById(
        "summaryCopies"
    );


const summaryPrinters =
    document.getElementById(
        "summaryPrinters"
    );


const distributionPreview =
    document.getElementById(
        "distributionPreview"
    );


const startBtn =
    document.getElementById(
        "startBtn"
    );


const batchStatusCard =
    document.getElementById(
        "batchStatusCard"
    );


const statusListElement =
    document.getElementById(
        "statusList"
    );


// ==========================================================
// STEP INFORMATION
// ==========================================================

const stepInformation = {

    1: {

        title:
            "Select document",

        description:
            "Choose the PDF you want to distribute."
    },


    2: {

        title:
            "Print settings",

        description:
            "Choose a saved print profile or configure custom settings."
    },


    3: {

        title:
            "Select printers",

        description:
            "Choose which printers will receive this batch."
    },


    4: {

        title:
            "Review & print",

        description:
            "Check the distribution before printing."
    }
};


// ==========================================================
// NAVIGATION
// ==========================================================

function goToStep(step) {

    // ------------------------------------------------------
    // Cannot go beyond Step 1 without a PDF
    // ------------------------------------------------------

    if (
        step > 1 &&
        !selectedFilePath
    ) {

        step = 1;
    }


    // ------------------------------------------------------
    // Cannot go to review without printers
    // ------------------------------------------------------

    if (
        step === 4 &&
        getSelectedPrinterNames()
            .length === 0
    ) {

        step = 3;
    }


    currentStep =
        step;


    // ------------------------------------------------------
    // Hide all pages
    // ------------------------------------------------------

    document
        .querySelectorAll(
            ".step-page"
        )
        .forEach(
            page => {

                page.classList.remove(
                    "active"
                );
            }
        );


    // ------------------------------------------------------
    // Show requested page
    // ------------------------------------------------------

    const targetPage =
        document.getElementById(
            `step${step}`
        );


    if (targetPage) {

        targetPage.classList.add(
            "active"
        );
    }


    // ------------------------------------------------------
    // Sidebar indicators
    // ------------------------------------------------------

    document
        .querySelectorAll(
            ".step-indicator"
        )
        .forEach(
            indicator => {

                const indicatorStep =
                    Number(
                        indicator.dataset
                            .stepIndicator
                    );


                indicator.classList.remove(
                    "active",
                    "completed"
                );


                if (
                    indicatorStep ===
                    step
                ) {

                    indicator.classList.add(
                        "active"
                    );
                }


                if (
                    indicatorStep <
                    step
                ) {

                    indicator.classList.add(
                        "completed"
                    );
                }
            }
        );


    // ------------------------------------------------------
    // Header
    // ------------------------------------------------------

    const information =
        stepInformation[
        step
        ];


    pageTitle.textContent =
        information.title;


    pageDescription.textContent =
        information.description;


    // ------------------------------------------------------
    // Step-specific actions
    // ------------------------------------------------------

    if (
        step === 2
    ) {

        updateCustomPagesVisibility();
    }


    if (
        step === 3
    ) {

        loadPrintersIfNeeded();
    }


    if (
        step === 4
    ) {

        updateDistribution();

        updateSummary();
    }
}


// ==========================================================
// PDF SELECTION
// ==========================================================

async function choosePdf() {

    try {

        const filePath =
            await window
                .printFarm
                .selectPdf();


        if (!filePath) {

            return;
        }


        selectedFilePath =
            filePath;


        const normalized =
            filePath.replace(
                /\\/g,
                "/"
            );


        const fileName =
            normalized
                .split("/")
                .pop();


        selectedFileName.textContent =
            fileName;


        selectedFilePathElement.textContent =
            filePath;


        choosePdfBtn.classList.add(
            "hidden"
        );


        selectedFileCard.classList.remove(
            "hidden"
        );


        documentActions.classList.remove(
            "hidden"
        );


        systemStatus.textContent =
            "PDF ready";


    } catch (error) {

        console.error(
            "[PDF]",
            error
        );


        alert(
            "Could not select the PDF."
        );
    }
}


// ==========================================================
// LOAD PRINT PROFILES
// ==========================================================

async function loadPrintProfiles() {

    try {

        const result =
            await window
                .printFarm
                .getPrintProfiles();


        if (
            !result ||
            !result.success
        ) {

            throw new Error(
                result?.error ||
                "Could not load print profiles."
            );
        }


        printProfiles =
            result.profiles ||
            [];


        defaultProfileId =
            result.defaultProfile ||
            null;


        renderPrintProfiles();


        // --------------------------------------------------
        // Apply default profile
        // --------------------------------------------------

        if (
            defaultProfileId &&
            printProfiles.some(
                profile =>
                    profile.id ===
                    defaultProfileId
            )
        ) {

            printProfileSelect.value =
                defaultProfileId;


            applyPrintProfile(
                defaultProfileId
            );

        } else {

            // No default profile = Custom

            printProfileSelect.value =
                "";


            applyPrintProfile(
                ""
            );
        }


    } catch (error) {

        console.error(
            "[PROFILES]",
            error
        );


        printProfiles =
            [];


        printProfileSelect.innerHTML =
            "";


        const option =
            document.createElement(
                "option"
            );


        option.value =
            "";


        option.textContent =
            "Custom Settings";


        printProfileSelect.appendChild(
            option
        );


        applyPrintProfile(
            ""
        );


        profileDescription.textContent =
            "Print profiles could not be loaded.";
    }
}


// ==========================================================
// RENDER PROFILE OPTIONS
// ==========================================================

function renderPrintProfiles() {

    printProfileSelect.innerHTML =
        "";


    // ------------------------------------------------------
    // Custom first
    // ------------------------------------------------------

    const customOption =
        document.createElement(
            "option"
        );


    customOption.value =
        "";


    customOption.textContent =
        "Custom Settings";


    printProfileSelect.appendChild(
        customOption
    );


    // ------------------------------------------------------
    // JSON profiles
    // ------------------------------------------------------

    printProfiles.forEach(
        profile => {

            const option =
                document.createElement(
                    "option"
                );


            option.value =
                profile.id;


            option.textContent =
                profile.name ||
                profile.id;


            printProfileSelect.appendChild(
                option
            );
        }
    );
}


// ==========================================================
// GET SELECTED PROFILE OBJECT
// ==========================================================

function getSelectedProfile() {

    const profileId =
        printProfileSelect.value;

    pendingProfilePrinterSelection =
        null;


    if (!profileId) {

        return null;
    }




    return printProfiles.find(
        profile =>
            profile.id ===
            profileId
    ) || null;
}


// ==========================================================
// APPLY PRINT PROFILE
// ==========================================================

function applyPrintProfile(
    profileId
) {

    // ------------------------------------------------------
    // CUSTOM SETTINGS
    // ------------------------------------------------------

    if (!profileId) {

        profileName.textContent =
            "Custom Settings";


        profileDescription.textContent =
            "Configure print settings manually.";


        customSettingsPanel.classList.remove(
            "hidden"
        );


        profileSummary.classList.add(
            "hidden"
        );


        return;
    }


    // ------------------------------------------------------
    // SAVED PROFILE
    // ------------------------------------------------------

    const profile =
        printProfiles.find(
            item =>
                item.id ===
                profileId
        );


    if (!profile) {

        console.warn(
            "[PROFILE] Profile not found:",
            profileId
        );


        return;
    }


    applyingProfile =
        true;


    try {

        // --------------------------------------------------
        // Name / description
        // --------------------------------------------------

        profileName.textContent =
            profile.name ||
            profile.id;


        profileDescription.textContent =
            profile.description ||
            "";


        // --------------------------------------------------
        // Saved profile = hide controls
        // --------------------------------------------------

        customSettingsPanel.classList.add(
            "hidden"
        );


        profileSummary.classList.remove(
            "hidden"
        );


        // --------------------------------------------------
        // Still populate hidden controls
        //
        // This is useful because the existing print engine
        // expects generic values such as paperSize and color.
        // --------------------------------------------------

        setSelectValue(
            paperSizeSelect,
            profile.paperSize
                ?.type ||
            "A4"
        );


        setSelectValue(
            mediaTypeSelect,
            profile.mediaType ||
            "plain"
        );


        setSelectValue(
            orientationSelect,
            profile.paperLayout
                ?.orientation ||
            "portrait"
        );


        setSelectValue(
            pageOrderSelect,
            profile.paperLayout
                ?.pageOrder ||
            "normal"
        );


        setSelectValue(
            pagesPerSheetSelect,
            profile.paperLayout
                ?.pagesPerSheet ||
            1
        );


        setSelectValue(
            paperSourceSelect,
            profile.paperSource ||
            "auto"
        );


        setSelectValue(
            printQualitySelect,
            profile.printQuality
                ?.quality ||
            "normal"
        );


        setSelectValue(
            colorModeSelect,
            profile.printQuality
                ?.colorMode ||
            "grayscale"
        );


        // --------------------------------------------------
        // Summary
        // --------------------------------------------------

        updateProfileSummary(
            profile
        );
        pendingProfilePrinterSelection =
            Array.isArray(
                profile.printers
            )
                ? profile.printers
                : [];

    } finally {

        applyingProfile =
            false;
    }

    applyProfilePrinterSelection();


    updateDistribution();

    updateSummary();
}


// ==========================================================
// SAFE SELECT VALUE
// ==========================================================

function setSelectValue(
    selectElement,
    value
) {

    if (
        !selectElement ||
        value === undefined ||
        value === null
    ) {

        return;
    }


    const stringValue =
        String(value);


    const exists =
        Array.from(
            selectElement.options
        )
            .some(
                option =>
                    option.value ===
                    stringValue
            );


    if (exists) {

        selectElement.value =
            stringValue;
    }
}


// ==========================================================
// UPDATE SAVED PROFILE SUMMARY
// ==========================================================

function updateProfileSummary(
    profile
) {

    // ------------------------------------------------------
    // PAPER
    // ------------------------------------------------------

    const paper =
        profile.paperSize
            ?.type ||
        "A4";


    const media =
        formatMediaType(
            profile.mediaType ||
            "plain"
        );


    profileSummaryPaper.textContent =
        `${paper} · ${media}`;


    // ------------------------------------------------------
    // LAYOUT
    // ------------------------------------------------------

    const orientation =
        formatValue(
            profile.paperLayout
                ?.orientation ||
            "portrait"
        );


    const pagesPerSheet =
        Number(
            profile.paperLayout
                ?.pagesPerSheet ||
            1
        );


    profileSummaryLayout.textContent =
        `${orientation} · ` +
        `${pagesPerSheet} ` +
        `${pagesPerSheet === 1
            ? "page"
            : "pages"
        } / sheet`;


    // ------------------------------------------------------
    // SOURCE
    // ------------------------------------------------------

    profileSummarySource.textContent =
        formatPaperSource(
            profile.paperSource ||
            "auto"
        );


    // ------------------------------------------------------
    // QUALITY
    // ------------------------------------------------------

    profileSummaryQuality.textContent =
        formatValue(
            profile.printQuality
                ?.quality ||
            "normal"
        );


    // ------------------------------------------------------
    // COLOR
    // ------------------------------------------------------

    profileSummaryColor.textContent =
        profile.printQuality
            ?.colorMode ===
            "color"
            ? "Color"
            : "Grayscale";
}


// ==========================================================
// FORMAT HELPERS
// ==========================================================

function formatValue(
    value
) {

    return String(
        value
    )
        .replace(
            /-/g,
            " "
        )
        .replace(
            /\b\w/g,
            character =>
                character
                    .toUpperCase()
        );
}


function formatPaperSource(
    value
) {

    switch (value) {

        case "main":

            return "Main Tray";


        case "manual":

            return "Manual Feed Slot";


        default:

            return "Auto Select";
    }
}


function formatMediaType(
    value
) {

    switch (value) {

        case "thin":

            return "Thin Paper";


        case "thick":

            return "Thick Paper";


        case "envelope":

            return "Envelope";


        case "glossy":

            return "Glossy";


        default:

            return "Plain Paper";
    }
}


// ==========================================================
// MARK PROFILE AS CUSTOM
// ==========================================================

function markProfileCustom() {

    if (
        applyingProfile
    ) {

        return;
    }


    // Already custom

    if (
        printProfileSelect.value ===
        ""
    ) {

        return;
    }


    printProfileSelect.value =
        "";


    profileName.textContent =
        "Custom Settings";


    profileDescription.textContent =
        "Settings have been modified manually.";


    customSettingsPanel.classList.remove(
        "hidden"
    );


    profileSummary.classList.add(
        "hidden"
    );
}


// ==========================================================
// VALIDATE SETTINGS
// ==========================================================

function validateSettings() {

    const copies =
        Number(
            totalCopiesInput.value
        );


    if (
        !Number.isInteger(
            copies
        ) ||
        copies < 1
    ) {

        alert(
            "Enter a valid number of copies."
        );


        totalCopiesInput.focus();


        return false;
    }


    return true;
}


// ==========================================================
// BUILD CUSTOM SETTINGS OBJECT
// ==========================================================

function getCustomPrintSettings() {

    return {

        paperLayout: {

            orientation:
                orientationSelect.value,

            pageOrder:
                pageOrderSelect.value,

            pagesPerSheet:
                Number(
                    pagesPerSheetSelect
                        .value
                )
        },


        mediaType:
            mediaTypeSelect.value,


        paperSize: {

            type:
                paperSizeSelect.value,

            widthMm:
                null,

            heightMm:
                null
        },


        paperSource:
            paperSourceSelect.value,


        printQuality: {

            quality:
                printQualitySelect.value,

            colorMode:
                colorModeSelect.value
        },


        // --------------------------------------------------
        // v4.3.0 Custom Settings does not expose duplex.
        // Custom jobs therefore default to simplex.
        // --------------------------------------------------

        duplex: {

            enabled:
                false,

            binding:
                null
        }
    };
}


// ==========================================================
// GET EFFECTIVE PRINT SETTINGS
//
// Saved profile:
// use profile.json.
//
// Custom profile:
// use visible custom controls.
// ==========================================================

function getPrintSettings() {

    const selectedProfile =
        getSelectedProfile();


    if (
        selectedProfile
    ) {

        // --------------------------------------------------
        // Return normalized profile settings
        // --------------------------------------------------

        return {

            paperLayout: {

                orientation:
                    selectedProfile
                        .paperLayout
                        ?.orientation ||
                    "portrait",

                pageOrder:
                    selectedProfile
                        .paperLayout
                        ?.pageOrder ||
                    "normal",

                pagesPerSheet:
                    Number(
                        selectedProfile
                            .paperLayout
                            ?.pagesPerSheet ||
                        1
                    )
            },


            mediaType:
                selectedProfile
                    .mediaType ||
                "plain",


            paperSize: {

                type:
                    selectedProfile
                        .paperSize
                        ?.type ||
                    "A4",

                widthMm:
                    selectedProfile
                        .paperSize
                        ?.widthMm ??
                    null,

                heightMm:
                    selectedProfile
                        .paperSize
                        ?.heightMm ??
                    null
            },


            paperSource:
                selectedProfile
                    .paperSource ||
                "auto",


            printQuality: {

                quality:
                    selectedProfile
                        .printQuality
                        ?.quality ||
                    "normal",

                colorMode:
                    selectedProfile
                        .printQuality
                        ?.colorMode ||
                    "grayscale"
            },


            // ------------------------------------------------
            // Duplex stays available to SAVED PROFILES even
            // though we no longer expose a duplex control.
            // ------------------------------------------------

            duplex: {

                enabled:
                    Boolean(
                        selectedProfile
                            .duplex
                            ?.enabled
                    ),

                binding:
                    selectedProfile
                        .duplex
                        ?.binding ||
                    "long-edge"
            }
        };
    }


    return getCustomPrintSettings();
}


// ==========================================================
// LOAD PRINTERS IF NEEDED
// ==========================================================

async function loadPrintersIfNeeded() {

    if (
        printers.length > 0
    ) {

        return;
    }


    await loadPrinters();
}


// ==========================================================
// LOAD WINDOWS PRINTERS
// ==========================================================

async function loadPrinters() {

    // ------------------------------------------------------
    // Preserve selected printers during refresh
    // ------------------------------------------------------

    const previousSelection =
        new Set(
            getSelectedPrinterNames()
        );


    refreshPrintersBtn.disabled =
        true;


    printerSummaryElement.textContent =
        "Loading Windows printers...";


    printerListElement.innerHTML =
        `
            <div class="empty-message">
                Looking for printers...
            </div>
        `;


    try {

        const result =
            await window
                .printFarm
                .getPrinters();


        if (
            !result ||
            !result.success
        ) {

            throw new Error(
                result?.error ||
                "Could not load printers."
            );
        }


        printers =
            result.printers ||
            [];


        // Render the discovered Windows printers before
        // applying any profile-based automatic selection.
        renderPrinters(
            previousSelection
        );


        if (
            pendingProfilePrinterSelection !==
            null
        ) {

            selectProfilePrinters(
                pendingProfilePrinterSelection
            );
        }

        await refreshLivePrinterStates();


        startLiveMonitoring();


    } catch (error) {

        console.error(
            "[PRINTER DISCOVERY]",
            error
        );


        printerSummaryElement.textContent =
            "Printer discovery failed";


        printerListElement.innerHTML =
            `
                <div class="empty-message">
                    ${escapeHtml(
                error.message
            )}
                </div>
            `;


        printersNextBtn.disabled =
            true;


    } finally {

        refreshPrintersBtn.disabled =
            false;
    }
}


// ==========================================================
// PRINTER MODEL IMAGES
// ==========================================================

async function loadPrinterModels() {
    try {
        const result =
            await window.printFarm.getPrinterModels();

        if (!result || !result.success) {
            throw new Error(
                result?.error ||
                "Could not load printer model configuration."
            );
        }

        printerModelConfig = {
            defaultImage:
                result.defaultImage ||
                "assets/printers/default.png",
            models:
                Array.isArray(result.models)
                    ? result.models
                    : []
        };
    } catch (error) {
        console.warn("[PRINTER IMAGES]", error.message);
    }
}

function normalizePrinterModelName(value) {
    return String(value || "")
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "");
}

function getPrinterImage(printerName) {
    const normalizedPrinter =
        normalizePrinterModelName(printerName);

    for (const model of printerModelConfig.models) {
        const matches =
            Array.isArray(model.match)
                ? model.match
                : [];

        for (const candidate of matches) {
            const normalizedMatch =
                normalizePrinterModelName(candidate);

            if (
                normalizedMatch &&
                normalizedPrinter.includes(normalizedMatch)
            ) {
                return (
                    model.image ||
                    printerModelConfig.defaultImage
                );
            }
        }
    }

    return printerModelConfig.defaultImage;
}

// ==========================================================
// RENDER PRINTERS
// ==========================================================

function renderPrinters(
    previousSelection =
        new Set()
) {

    printerListElement.innerHTML =
        "";


    if (
        printers.length === 0
    ) {

        printerSummaryElement.textContent =
            "No printers found";


        printerListElement.innerHTML =
            `
                <div class="empty-message">
                    No Windows printers were found.
                </div>
            `;


        printersNextBtn.disabled =
            true;


        return;
    }


    printers.forEach(
        (printer, index) => {

            // ------------------------------------------------
            // CARD
            // ------------------------------------------------

            const label =
                document.createElement(
                    "label"
                );


            label.className =
                "printer-card";


            // ------------------------------------------------
            // CHECKBOX
            // ------------------------------------------------

            const checkbox =
                document.createElement(
                    "input"
                );


            checkbox.type =
                "checkbox";


            checkbox.value =
                printer.name;


            checkbox.dataset.index =
                index;


            checkbox.checked =
                previousSelection.has(
                    printer.name
                );


            if (
                checkbox.checked
            ) {

                label.classList.add(
                    "selected"
                );
            }


            // ------------------------------------------------
            // PRINTER + SHELF PNG
            // ------------------------------------------------

            const image =
                document.createElement(
                    "img"
                );


            image.className =
                "printer-image";


            image.src =
                getPrinterImage(
                    printer.name
                );


            image.alt =
                printer.name;


            image.draggable =
                false;

            image.onerror =
                () => {
                    const fallback =
                        printerModelConfig.defaultImage;

                    if (
                        image.getAttribute("src") !==
                        fallback
                    ) {
                        image.src = fallback;
                    }
                };


            // ------------------------------------------------
            // INFO
            // ------------------------------------------------

            const information =
                document.createElement(
                    "div"
                );


            information.className =
                "printer-information";


            const name =
                document.createElement(
                    "span"
                );


            name.className =
                "printer-name";


            name.textContent =
                printer.name;


            name.title =
                printer.name;


            // ------------------------------------------------
            // MACHINE NUMBER
            // Brother MFC-T920DW Printer (11) -> 11
            // ------------------------------------------------

            const machineNumber =
                document.createElement(
                    "span"
                );


            machineNumber.className =
                "printer-machine-number";


            const machineNumberMatch =
                String(
                    printer.name || ""
                ).match(
                    /\((\d+)\)\s*$/
                );


            if (
                machineNumberMatch
            ) {

                machineNumber.textContent =
                    machineNumberMatch[1];

                machineNumber.title =
                    `Printer ${machineNumberMatch[1]}`;

            } else {

                machineNumber.classList.add(
                    "hidden"
                );
            }


            // ------------------------------------------------
            // LIVE STATUS
            // ------------------------------------------------

            const liveRow =
                document.createElement(
                    "div"
                );


            liveRow.className =
                "printer-live-row";


            const status =
                document.createElement(
                    "span"
                );


            status.className =
                "printer-status status-unknown";


            status.dataset.printerStatus =
                printer.name;


            status.textContent =
                "● Checking...";


            const queue =
                document.createElement(
                    "span"
                );


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


            label.appendChild(
                machineNumber
            );


            information.appendChild(
                liveRow
            );


            label.appendChild(
                checkbox
            );


            label.appendChild(
                image
            );


            label.appendChild(
                information
            );


            // ------------------------------------------------
            // CHECKBOX EVENT
            // ------------------------------------------------

            checkbox.addEventListener(
                "change",
                () => {

                    label.classList.toggle(
                        "selected",
                        checkbox.checked
                    );


                    updatePrinterSelection();
                }
            );


            printerListElement.appendChild(
                label
            );
        }
    );


    updatePrinterSelection();
}


// ==========================================================
// PRINTER CHECKBOXES
// ==========================================================

function getPrinterCheckboxes() {

    return Array.from(
        printerListElement
            .querySelectorAll(
                'input[type="checkbox"]'
            )
    );
}


// ==========================================================
// SELECTED PRINTER NAMES
// ==========================================================

function getSelectedPrinterNames() {

    return getPrinterCheckboxes()
        .filter(
            checkbox =>
                checkbox.checked
        )
        .map(
            checkbox =>
                checkbox.value
        );
}


// ==========================================================
// UPDATE PRINTER SELECTION
// ==========================================================

function updatePrinterSelection() {

    const selected =
        getSelectedPrinterNames();


    printersNextBtn.disabled =
        selected.length ===
        0;


    if (
        selected.length ===
        0
    ) {

        printerSummaryElement.textContent =
            `${printers.length} printers available`;

    } else {

        printerSummaryElement.textContent =
            `${selected.length} of ${printers.length} selected`;
    }


    // ------------------------------------------------------
    // Update Select All button
    // ------------------------------------------------------

    const checkboxes =
        getPrinterCheckboxes();


    const allSelected =
        checkboxes.length >
        0 &&
        checkboxes.every(
            checkbox =>
                checkbox.checked
        );


    selectAllBtn.textContent =
        allSelected
            ? "Clear all"
            : "Select all";


    updateDistribution();
}


// ==========================================================
// SELECT ALL
// ==========================================================

function toggleSelectAll() {

    const checkboxes =
        getPrinterCheckboxes();


    if (
        checkboxes.length ===
        0
    ) {

        return;
    }


    const allSelected =
        checkboxes.every(
            checkbox =>
                checkbox.checked
        );


    checkboxes.forEach(
        checkbox => {

            checkbox.checked =
                !allSelected;


            const card =
                checkbox.closest(
                    ".printer-card"
                );


            card
                ?.classList
                .toggle(
                    "selected",
                    checkbox.checked
                );
        }
    );


    updatePrinterSelection();
}


// ==========================================================
// COPY DISTRIBUTION
// v4.6.0: dynamic scheduling
// ==========================================================

function calculateDistribution(
    totalCopies,
    printerNames
) {
    if (
        !Array.isArray(printerNames) ||
        printerNames.length === 0 ||
        totalCopies < 1
    ) {
        return [];
    }

    // IMPORTANT: this is display-only. Copies are NOT
    // pre-assigned. Every printer gets one copy at a time,
    // and whichever finishes first gets the next remaining copy.
    return printerNames.map(
        printerName => ({
            printerName,
            copies: "Dynamic"
        })
    );
}


// ==========================================================
// UPDATE DISTRIBUTION PREVIEW
// ==========================================================

function updateDistribution() {

    const totalCopies =
        Number(
            totalCopiesInput.value
        );


    const selectedPrinters =
        getSelectedPrinterNames();


    const distribution =
        calculateDistribution(
            totalCopies,
            selectedPrinters
        );


    distributionPreview.innerHTML =
        "";


    if (
        distribution.length ===
        0
    ) {

        distributionPreview.innerHTML =
            `
                <div class="empty-message">
                    Select printers to see the distribution.
                </div>
            `;


        updateSummary();


        return;
    }


    distribution.forEach(
        item => {

            const row =
                document.createElement(
                    "div"
                );


            row.className =
                "distribution-row";


            row.innerHTML =
                `
                    <strong>
                        ${escapeHtml(
                    item.printerName
                )}
                    </strong>

                    <span>
                        ${item.copies === "Dynamic"
                    ? "1 at a time · dynamic"
                    : `${item.copies} ${item.copies === 1
                        ? "copy"
                        : "copies"
                    }`
                }
                    </span>
                `;


            distributionPreview.appendChild(
                row
            );
        }
    );


    updateSummary();
}


// ==========================================================
// REVIEW SUMMARY
// ==========================================================

function updateSummary() {

    const copies =
        Number(
            totalCopiesInput.value
        ) || 0;


    const selectedPrinters =
        getSelectedPrinterNames();


    summaryCopies.textContent =
        copies;


    summaryPrinters.textContent =
        selectedPrinters.length;
}


// ==========================================================
// LIVE MONITOR
// ==========================================================

function startLiveMonitoring() {

    if (
        liveMonitorTimer
    ) {

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


// ==========================================================
// REFRESH LIVE STATES
// ==========================================================

async function refreshLivePrinterStates() {

    if (
        printers.length ===
        0
    ) {

        return;
    }


    try {

        const result =
            await window
                .printFarm
                .getLivePrinterStates();


        if (
            !result ||
            !result.success
        ) {

            console.warn(
                "[LIVE MONITOR]",
                result?.error
            );


            return;
        }


        const livePrinters =
            result.printers ||
            [];


        livePrinters.forEach(
            updatePrinterLiveUI
        );


    } catch (error) {

        console.error(
            "[LIVE MONITOR]",
            error
        );
    }
}


// ==========================================================
// UPDATE ONE PRINTER STATUS
// ==========================================================

function updatePrinterLiveUI(
    printer
) {

    const statusElement =
        Array.from(
            document.querySelectorAll(
                "[data-printer-status]"
            )
        )
            .find(
                element =>
                    element.dataset
                        .printerStatus ===
                    printer.name
            );


    const queueElement =
        Array.from(
            document.querySelectorAll(
                "[data-printer-queue]"
            )
        )
            .find(
                element =>
                    element.dataset
                        .printerQueue ===
                    printer.name
            );


    if (!statusElement) {

        return;
    }


    statusElement.textContent =
        `● ${printer.stateLabel ||
        "Unknown"
        }`;


    statusElement.className =
        "printer-status";


    switch (
    printer.state
    ) {

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


    if (
        queueElement
    ) {

        queueElement.textContent =
            `Queue: ${Number(
                printer.jobCount
            ) || 0
            }`;
    }
}


// ==========================================================
// START PRINT BATCH
// ==========================================================

async function startBatch() {

    if (
        batchRunning
    ) {

        return;
    }


    const totalCopies =
        Number(
            totalCopiesInput.value
        );


    const selectedPrinters =
        getSelectedPrinterNames();


    // ------------------------------------------------------
    // PDF check
    // ------------------------------------------------------

    if (
        !selectedFilePath
    ) {

        goToStep(1);

        return;
    }


    // ------------------------------------------------------
    // Settings check
    // ------------------------------------------------------

    if (
        !validateSettings()
    ) {

        goToStep(2);

        return;
    }


    // ------------------------------------------------------
    // Printer check
    // ------------------------------------------------------

    if (
        selectedPrinters.length ===
        0
    ) {

        goToStep(3);

        return;
    }


    // ------------------------------------------------------
    // Effective profile settings
    // ------------------------------------------------------

    const settings =
        getPrintSettings();


    // ------------------------------------------------------
    // Translate duplex into pdf-to-printer format
    // ------------------------------------------------------

    let duplex =
        "simplex";


    if (
        settings.duplex
            ?.enabled
    ) {

        duplex =
            settings.duplex
                .binding ===
                "short-edge"
                ? "duplexshort"
                : "duplexlong";
    }


    // ------------------------------------------------------
    // Color
    // ------------------------------------------------------

    const monochrome =
        settings.printQuality
            .colorMode ===
        "grayscale";


    // ------------------------------------------------------
    // UI state
    // ------------------------------------------------------

    batchRunning =
        true;


    startBtn.disabled =
        true;


    batchStatusCard.classList.remove(
        "hidden"
    );


    statusListElement.innerHTML =
        `
            <div class="status-row">

                <strong>
                    Creating batch...
                </strong>

                <span>
                    Sending jobs to printers
                </span>

            </div>
        `;


    systemStatus.textContent =
        "Printing";


    try {

        const result =
            await window
                .printFarm
                .startBatch({

                    filePath:
                        selectedFilePath,

                    totalCopies,

                    pageSelection:
                        pageSelectionSelect.value,

                    customPages:
                        pageSelectionSelect.value === "custom"
                            ? customPagesInput.value.trim()
                            : null,

                    printers:
                        selectedPrinters,

                    profileId:
                        printProfileSelect.value ||
                        null,

                    settings,

                    paperSize:
                        settings
                            .paperSize
                            .type,

                    duplex,

                    monochrome
                });


        if (
            !result ||
            !result.success
        ) {

            throw new Error(
                result?.error ||
                "Print batch failed."
            );
        }


        // ==========================================================
        // GUARANTEED REDIRECT
        // ==========================================================

        let redirectSeconds = 3;

        startBtn.disabled = true;

        startBtn.classList.add(
            "redirecting-button"
        );

        startBtn.textContent =
            `Returning in ${redirectSeconds}...`;


        // Countdown text only
        const redirectCountdown =
            setInterval(
                () => {

                    redirectSeconds--;

                    if (
                        redirectSeconds >
                        0
                    ) {

                        startBtn.textContent =
                            `Returning in ${redirectSeconds}...`;

                    } else {

                        clearInterval(
                            redirectCountdown
                        );
                    }

                },
                1000
            );


        // Actual redirect is independent from everything below
        setTimeout(
            () => {

                window.location.href =
                    "index.html";

            },
            3000
        );


        const batch =
            result.batch;


        const failedJobs =
            batch.jobs.filter(
                job =>
                    job.status ===
                    "FAILED"
            );


        const successfulJobs =
            batch.jobs.length -
            failedJobs.length;


        window
            .printFarm
            .notify({

                title:
                    failedJobs.length ===
                        0
                        ? "Print batch submitted"
                        : "Print batch finished with errors",

                body:
                    `${batch.id}: ` +
                    `${successfulJobs} successful, ` +
                    `${failedJobs.length} failed.`
            });


        systemStatus.textContent =
            failedJobs.length ===
                0
                ? "Batch submitted"
                : "Batch has errors";


        // Refresh printer status in background.
        // Do NOT wait before redirecting.
        refreshLivePrinterStates()
            .catch(
                error => {

                    console.warn(
                        "[LIVE MONITOR]",
                        error
                    );
                }
            );


    } catch (error) {

        console.error(
            "[BATCH]",
            error
        );


        statusListElement.innerHTML =
            `
                <div class="status-row">

                    <strong>
                        Batch failed
                    </strong>

                    <span class="status-error">
                        ${escapeHtml(
                error.message
            )}
                    </span>

                </div>
            `;


        systemStatus.textContent =
            "Error";


    } finally {

        batchRunning =
            false;

        // Only re-enable the button if we're NOT
        // currently doing the countdown redirect
        if (
            !startBtn.classList.contains(
                "redirecting-button"
            )
        ) {
            startBtn.disabled =
                false;
        }
    }
}


// ==========================================================
// RENDER BATCH STATUS
// ==========================================================

function renderBatchStatus(
    batch
) {

    if (
        !statusListElement
    ) {
        return;
    }

    statusListElement.innerHTML =
        "";


    // ------------------------------------------------------
    // Heading
    // ------------------------------------------------------

    const heading =
        document.createElement(
            "div"
        );


    heading.className =
        "batch-heading";


    heading.innerHTML =
        `
            <strong>
                ${escapeHtml(
            batch.id
        )}
            </strong>

            <span>
                ${escapeHtml(
            batch.status
        )}
            </span>
        `;


    statusListElement.appendChild(
        heading
    );


    // ------------------------------------------------------
    // Jobs
    // ------------------------------------------------------

    batch.jobs.forEach(
        job => {

            const row =
                document.createElement(
                    "div"
                );


            row.className =
                "status-row";


            const statusClass =
                job.status ===
                    "FAILED"
                    ? "status-error"
                    : "status-success";


            row.innerHTML =
                `
                    <strong>
                        ${escapeHtml(
                    job.printerName
                )}
                    </strong>

                    <span>

                        ${job.copies}
                        ${job.copies ===
                    1
                    ? "copy"
                    : "copies"
                }

                        —

                        <span class="${statusClass}">
                            ${escapeHtml(
                    job.status
                )}
                        </span>

                    </span>
                `;


            statusListElement.appendChild(
                row
            );
        }
    );
}


// ==========================================================
// ESCAPE HTML
// ==========================================================

function escapeHtml(
    value
) {

    return String(
        value
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


// ==========================================================
// CUSTOM PROFILE CONTROLLED ELEMENTS
// ==========================================================
//
// Manual changes only apply while Custom Settings is shown.
//
// Copies are NOT part of the print profile.
// ==========================================================

const profileControlledElements = [

    paperSizeSelect,

    mediaTypeSelect,

    orientationSelect,

    pageOrderSelect,

    pagesPerSheetSelect,

    paperSourceSelect,

    printQualitySelect,

    colorModeSelect
];


// ==========================================================
// EVENTS - PDF
// ==========================================================

choosePdfBtn.addEventListener(
    "click",
    choosePdf
);


changePdfBtn.addEventListener(
    "click",
    choosePdf
);


// ==========================================================
// EVENTS - STEP 1
// ==========================================================

documentNextBtn.addEventListener(
    "click",
    () => {

        if (
            selectedFilePath
        ) {

            goToStep(2);
        }
    }
);


// ==========================================================
// EVENTS - STEP 2
// ==========================================================

settingsNextBtn.addEventListener(
    "click",
    () => {

        if (
            validateSettings()
        ) {

            goToStep(3);
        }
    }
);
function updateCustomPagesVisibility() {

    const pageSelection =
        document.getElementById(
            "pageSelection"
        );

    const customPagesField =
        document.getElementById(
            "customPagesField"
        );

    const customPagesInput =
        document.getElementById(
            "customPages"
        );


    if (
        pageSelection.value ===
        "custom"
    ) {

        document
            .getElementById(
                "customPagesField"
            )
            .classList.remove(
                "hidden"
            );

        customPagesInput.disabled =
            false;

    } else {

        document
            .getElementById(
                "customPagesField"
            )
            .classList.add(
                "hidden"
            );

        customPagesInput.disabled =
            true;
    }
}
// ==========================================================
// EVENTS - STEP 3
// ==========================================================

printersNextBtn.addEventListener(
    "click",
    () => {

        if (
            getSelectedPrinterNames()
                .length >
            0
        ) {

            goToStep(4);
        }
    }
);


// ==========================================================
// EVENTS - BACK BUTTONS
// ==========================================================

document
    .querySelectorAll(
        "[data-back]"
    )
    .forEach(
        button => {

            button.addEventListener(
                "click",
                () => {

                    const targetStep =
                        Number(
                            button.dataset
                                .back
                        );


                    goToStep(
                        targetStep
                    );
                }
            );
        }
    );


// ==========================================================
// EVENTS - PROFILE
// ==========================================================

printProfileSelect.addEventListener(
    "change",
    () => {

        applyPrintProfile(
            printProfileSelect.value
        );
    }
);


// ==========================================================
// EVENTS - CUSTOM PROFILE CONTROLS
// ==========================================================

profileControlledElements.forEach(
    element => {

        if (!element) {

            return;
        }


        element.addEventListener(
            "change",
            () => {

                // ------------------------------------------
                // If the user somehow modifies a field while
                // a saved profile is active, switch to Custom.
                // ------------------------------------------

                markProfileCustom();
            }
        );
    }
);


// ==========================================================
// EVENTS - COPIES
// ==========================================================

totalCopiesInput.addEventListener(
    "input",
    () => {

        updateDistribution();

        updateSummary();
    }
);


// ==========================================================
// EVENTS - PRINTERS
// ==========================================================

refreshPrintersBtn.addEventListener(
    "click",
    loadPrinters
);


selectAllBtn.addEventListener(
    "click",
    toggleSelectAll
);


// ==========================================================
// EVENTS - START PRINT
// ==========================================================

startBtn.addEventListener(
    "click",
    startBatch
);


// ==========================================================
// CLEANUP
// ==========================================================

window.addEventListener(
    "beforeunload",
    () => {

        if (
            liveMonitorTimer
        ) {

            clearInterval(
                liveMonitorTimer
            );
        }
    }
);

// ==========================================================
// V4.4.0
// APPLY PROFILE PRINTER SELECTION
// ==========================================================

function applyProfilePrinterSelection() {

    const profile =
        getSelectedProfile();


    // ------------------------------------------------------
    // Custom Settings:
    // do NOT automatically select anything
    // ------------------------------------------------------

    if (!profile) {

        pendingProfilePrinterSelection =
            null;

        return;
    }


    const profilePrinters =
        Array.isArray(
            profile.printers
        )
            ? profile.printers
            : [];


    pendingProfilePrinterSelection =
        profilePrinters;


    // ------------------------------------------------------
    // Printers aren't loaded yet.
    //
    // That's fine. We'll apply this after Windows printer
    // discovery finishes.
    // ------------------------------------------------------

    if (
        printers.length === 0
    ) {

        return;
    }


    selectProfilePrinters(
        profilePrinters
    );
}

// ==========================================================
// SELECT PRINTERS FROM PROFILE
// ==========================================================

function selectProfilePrinters(
    profilePrinterNames
) {

    const requestedNames =
        Array.isArray(
            profilePrinterNames
        )
            ? profilePrinterNames
            : [];


    const normalizedRequested =
        requestedNames.map(
            name =>
                String(name)
                    .trim()
                    .toLowerCase()
        );


    const checkboxes =
        getPrinterCheckboxes();


    let selectedCount = 0;

    let missingPrinters =
        [...requestedNames];


    checkboxes.forEach(
        checkbox => {

            const printerName =
                String(
                    checkbox.value
                );


            const normalizedName =
                printerName
                    .trim()
                    .toLowerCase();


            const shouldSelect =
                normalizedRequested.includes(
                    normalizedName
                );


            checkbox.checked =
                shouldSelect;


            const card =
                checkbox.closest(
                    ".printer-card"
                );


            card?.classList.toggle(
                "selected",
                shouldSelect
            );


            if (shouldSelect) {

                selectedCount++;


                missingPrinters =
                    missingPrinters.filter(
                        requestedName =>
                            String(
                                requestedName
                            )
                                .trim()
                                .toLowerCase()
                            !==
                            normalizedName
                    );
            }
        }
    );


    updatePrinterSelection();


    // ------------------------------------------------------
    // STATUS MESSAGE
    // ------------------------------------------------------

    if (
        requestedNames.length === 0
    ) {

        printerSummaryElement.textContent =
            "This profile has no automatic printers assigned.";


        return;
    }


    if (
        missingPrinters.length === 0
    ) {

        printerSummaryElement.textContent =
            `${selectedCount} profile printer${selectedCount === 1
                ? ""
                : "s"
            } automatically selected`;


    } else {

        printerSummaryElement.textContent =
            `${selectedCount} selected · ` +
            `${missingPrinters.length} profile printer${missingPrinters.length === 1
                ? ""
                : "s"
            } unavailable`;


        console.warn(
            "[PROFILE PRINTERS] Not found:",
            missingPrinters
        );
    }
}


// ==========================================================
// START APPLICATION
// ==========================================================

async function initializeApp() {
    await Promise.all([
        loadPrintProfiles(),
        loadPrinterModels()
    ]);

    goToStep(1);
}

initializeApp();