const $ = id => document.getElementById(id);

const profileList = $("profileList");
const profileCount = $("profileCount");
const loadingState = $("loadingState");
const editorContent = $("editorContent");
const saveBtn = $("saveBtn");
const toast = $("toast");
const duplexBindingField = $("duplexBindingField");

const fields = {
    name: $("profileName"),
    id: $("profileId"),
    description: $("profileDescription"),
    defaultProfile: $("defaultProfile"),
    paperSize: $("paperSize"),
    orientation: $("orientation"),
    paperSource: $("paperSource"),
    mediaType: $("mediaType"),
    pagesPerSheet: $("pagesPerSheet"),
    pageOrder: $("pageOrder"),
    borderless: $("borderless"),
    duplex: $("duplex"),
    duplexBinding: $("duplexBinding"),
    printQuality: $("printQuality"),
    colorMode: $("colorMode")
};

const profilePrinterList = $("profilePrinterList");
const profilePrinterSummary = $("profilePrinterSummary");
const refreshProfilePrintersBtn = $("refreshProfilePrintersBtn");
const selectAllProfilePrintersBtn = $("selectAllProfilePrintersBtn");
const clearProfilePrintersBtn = $("clearProfilePrintersBtn");

let data = { defaultProfile: null, profiles: [] };
let selectedIndex = -1;
let toastTimer = null;

let availablePrinters = [];
let selectedProfilePrinters = new Set();

function toastMessage(message, error = false) {
    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.toggle("error", error);
    toast.classList.add("show");
    toastTimer = setTimeout(() => toast.classList.remove("show"), 2500);
}

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function slugify(value) {
    return String(value || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 48);
}

function normalize(profile = {}) {
    return {
        id: profile.id || "new-profile",
        name: profile.name || "New Profile",
        description: profile.description || "",
        printers: Array.isArray(profile.printers) ? profile.printers : [],
        paperLayout: {
            orientation: profile.paperLayout?.orientation || "portrait",
            pageOrder: profile.paperLayout?.pageOrder || "normal",
            pagesPerSheet: Number(profile.paperLayout?.pagesPerSheet || 1),
            borderless: Boolean(profile.paperLayout?.borderless)
        },
        mediaType: profile.mediaType || "plain",
        paperSize: {
            type: profile.paperSize?.type || "A4",
            widthMm: profile.paperSize?.widthMm ?? null,
            heightMm: profile.paperSize?.heightMm ?? null
        },
        paperSource: profile.paperSource || "tray1",
        printQuality: {
            quality: profile.printQuality?.quality || "medium",
            colorMode: profile.printQuality?.colorMode || "grayscale"
        },
        duplex: {
            enabled: Boolean(profile.duplex?.enabled),
            binding: profile.duplex?.binding || null
        }
    };
}

function current() {
    return selectedIndex >= 0 ? data.profiles[selectedIndex] : null;
}

function ensureOption(select, value) {
    const text = String(value);
    if (![...select.options].some(option => option.value === text)) {
        const option = document.createElement("option");
        option.value = text;
        option.textContent = `${text} (current)`;
        select.appendChild(option);
    }
    select.value = text;
}

function renderList() {
    profileList.innerHTML = "";
    profileCount.textContent = `${data.profiles.length} ${data.profiles.length === 1 ? "profile" : "profiles"}`;

    data.profiles.forEach((profile, index) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "profile-list-item" + (index === selectedIndex ? " active" : "");
        button.innerHTML = `
            <strong>${escapeHtml(profile.name)}</strong>
            <span>${escapeHtml(profile.id)}</span>
            ${data.defaultProfile === profile.id ? '<span class="default-badge">DEFAULT</span>' : ""}
        `;
        button.addEventListener("click", () => {
            syncCurrent();
            selectedIndex = index;
            renderList();
            loadForm();
        });
        profileList.appendChild(button);
    });
}

function getPrinterDisplayName(printer) {
    return String(
        printer?.name ||
        printer?.Name ||
        ""
    ).trim();
}

function getPrinterPort(printer) {
    return String(
        printer?.portName ||
        printer?.PortName ||
        ""
    ).trim();
}

function isLikelyNetworkPrinter(printer) {
    const port = getPrinterPort(printer).toUpperCase();

    return (
        port.startsWith("IP_") ||
        port.startsWith("WSD-") ||
        port.includes("TCP") ||
        /^\d{1,3}(\.\d{1,3}){3}$/.test(port)
    );
}

function syncPrinterSelectionToCurrentProfile() {
    const p = current();

    if (!p) {
        return;
    }

    p.printers = Array.from(selectedProfilePrinters);
}

function renderProfilePrinters() {
    if (!profilePrinterList) {
        return;
    }

    profilePrinterList.innerHTML = "";

    const currentSaved = new Set(
        current()?.printers || []
    );

    // Preserve a saved printer even if it is temporarily unavailable.
    const discoveredNames = new Set(
        availablePrinters
            .map(getPrinterDisplayName)
            .filter(Boolean)
    );

    const missingSaved = Array.from(currentSaved)
        .filter(name => !discoveredNames.has(name));

    if (
        availablePrinters.length === 0 &&
        missingSaved.length === 0
    ) {
        profilePrinterList.innerHTML = `
            <div class="profile-printer-empty">
                No Windows printers were found.
            </div>
        `;

        profilePrinterSummary.textContent =
            "0 printers found";

        return;
    }

    const items = [
        ...availablePrinters.map(printer => ({
            printer,
            name: getPrinterDisplayName(printer),
            missing: false
        })),
        ...missingSaved.map(name => ({
            printer: null,
            name,
            missing: true
        }))
    ].filter(item => item.name);

    items.forEach(item => {
        const label = document.createElement("label");
        label.className =
            "profile-printer-option" +
            (item.missing ? " unavailable" : "");

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.value = item.name;
        checkbox.checked =
            selectedProfilePrinters.has(item.name);

        checkbox.addEventListener("change", () => {
            if (checkbox.checked) {
                selectedProfilePrinters.add(item.name);
            } else {
                selectedProfilePrinters.delete(item.name);
            }

            syncPrinterSelectionToCurrentProfile();
            updateProfilePrinterSummary();
        });

        const info = document.createElement("div");
        info.className = "profile-printer-option-info";

        const title = document.createElement("strong");
        title.textContent = item.name;

        const detail = document.createElement("span");

        if (item.missing) {
            detail.textContent =
                "Saved in profile · currently unavailable";
        } else {
            const port = getPrinterPort(item.printer);

            const parts = [];

            if (isLikelyNetworkPrinter(item.printer)) {
                parts.push("Network");
            } else {
                parts.push("Windows printer");
            }

            if (port) {
                parts.push(port);
            }

            detail.textContent = parts.join(" · ");
        }

        info.appendChild(title);
        info.appendChild(detail);

        label.appendChild(checkbox);
        label.appendChild(info);

        profilePrinterList.appendChild(label);
    });

    updateProfilePrinterSummary();
}

function updateProfilePrinterSummary() {
    if (!profilePrinterSummary) {
        return;
    }

    const total = availablePrinters.length;
    const selected = selectedProfilePrinters.size;

    profilePrinterSummary.textContent =
        `${selected} selected · ${total} found`;
}

async function loadAvailablePrinters() {
    if (!window.printFarm?.getPrinters) {
        profilePrinterSummary.textContent =
            "Printer discovery is unavailable";

        return;
    }

    refreshProfilePrintersBtn.disabled = true;
    refreshProfilePrintersBtn.textContent = "Refreshing…";

    profilePrinterSummary.textContent =
        "Loading Windows printers…";

    try {
        const result =
            await window.printFarm.getPrinters();

        if (!result?.success) {
            throw new Error(
                result?.error ||
                "Could not load Windows printers."
            );
        }

        availablePrinters =
            Array.isArray(result.printers)
                ? result.printers
                : [];

        // Sort the names for a predictable non-coder-friendly list.
        availablePrinters.sort((a, b) =>
            getPrinterDisplayName(a).localeCompare(
                getPrinterDisplayName(b)
            )
        );

        renderProfilePrinters();

    } catch (error) {
        availablePrinters = [];

        profilePrinterList.innerHTML = `
            <div class="profile-printer-empty error">
                ${escapeHtml(error.message)}
            </div>
        `;

        profilePrinterSummary.textContent =
            "Could not load printers";

        toastMessage(
            error.message,
            true
        );

    } finally {
        refreshProfilePrintersBtn.disabled = false;
        refreshProfilePrintersBtn.textContent =
            "Refresh printers";
    }
}

function loadPrinterSelectionFromProfile() {
    selectedProfilePrinters = new Set(
        current()?.printers || []
    );

    renderProfilePrinters();
}

function updateDuplex() {
    duplexBindingField.classList.toggle("hidden", !fields.duplex.checked);
}

function loadForm() {
    const p = current();
    if (!p) {
        editorContent.classList.add("hidden");
        return;
    }

    editorContent.classList.remove("hidden");
    fields.name.value = p.name;
    fields.id.value = p.id;
    fields.description.value = p.description;
    fields.defaultProfile.checked = data.defaultProfile === p.id;

    ensureOption(fields.paperSize, p.paperSize.type);
    ensureOption(fields.orientation, p.paperLayout.orientation);
    ensureOption(fields.paperSource, p.paperSource);
    ensureOption(fields.mediaType, p.mediaType);
    ensureOption(fields.pagesPerSheet, p.paperLayout.pagesPerSheet);
    ensureOption(fields.pageOrder, p.paperLayout.pageOrder);
    ensureOption(fields.printQuality, p.printQuality.quality);
    ensureOption(fields.colorMode, p.printQuality.colorMode);
    ensureOption(fields.duplexBinding, p.duplex.binding || "long-edge");

    fields.borderless.checked = p.paperLayout.borderless;
    fields.duplex.checked = p.duplex.enabled;

    loadPrinterSelectionFromProfile();
    updateDuplex();
}

function syncCurrent() {
    const p = current();
    if (!p) return;

    const oldId = p.id;

    p.name = fields.name.value.trim() || "Unnamed Profile";
    p.id = fields.id.value.trim() || slugify(p.name) || "profile";
    p.description = fields.description.value.trim();
    p.paperSize.type = fields.paperSize.value;
    p.paperLayout.orientation = fields.orientation.value;
    p.paperLayout.pageOrder = fields.pageOrder.value;
    p.paperLayout.pagesPerSheet = Number(fields.pagesPerSheet.value) || 1;
    p.paperLayout.borderless = fields.borderless.checked;
    p.paperSource = fields.paperSource.value;
    p.mediaType = fields.mediaType.value;
    p.printQuality.quality = fields.printQuality.value;
    p.printQuality.colorMode = fields.colorMode.value;
    p.duplex.enabled = fields.duplex.checked;
    p.duplex.binding = fields.duplex.checked ? fields.duplexBinding.value : null;

    p.printers =
        Array.from(
            selectedProfilePrinters
        );

    if (fields.defaultProfile.checked) {
        data.defaultProfile = p.id;
    } else if (data.defaultProfile === oldId) {
        data.defaultProfile = null;
    }

    if (data.defaultProfile === oldId && oldId !== p.id) {
        data.defaultProfile = p.id;
    }
}

function validate() {
    syncCurrent();
    const ids = new Set();

    for (const p of data.profiles) {
        if (!p.name.trim()) return "Every profile needs a name.";
        if (!/^[a-z0-9][a-z0-9-_]*$/i.test(p.id)) {
            return `"${p.id}" is not a valid Profile ID.`;
        }
        if (ids.has(p.id)) return `Two profiles use the ID "${p.id}".`;
        ids.add(p.id);
    }

    return null;
}

function addProfile() {
    syncCurrent();

    let n = data.profiles.length + 1;
    let id = `new-profile-${n}`;
    const ids = new Set(data.profiles.map(p => p.id));

    while (ids.has(id)) {
        n++;
        id = `new-profile-${n}`;
    }

    data.profiles.push(normalize({
        id,
        name: "New Profile",
        description: "New print profile."
    }));

    selectedIndex = data.profiles.length - 1;
    renderList();
    loadForm();
    fields.name.focus();
}

function deleteProfile() {
    const p = current();
    if (!p) return;

    if (data.profiles.length <= 1) {
        toastMessage("You must keep at least one profile.", true);
        return;
    }

    if (!confirm(`Delete "${p.name}"?`)) return;

    const wasDefault = data.defaultProfile === p.id;
    data.profiles.splice(selectedIndex, 1);

    if (wasDefault) {
        data.defaultProfile = data.profiles[0]?.id || null;
    }

    selectedIndex = Math.min(selectedIndex, data.profiles.length - 1);
    renderList();
    loadForm();
}

async function saveProfiles() {
    const error = validate();

    if (error) {
        toastMessage(error, true);
        return;
    }

    saveBtn.disabled = true;
    saveBtn.textContent = "Saving…";

    try {
        const result = await window.printFarm.savePrintProfiles(data);

        if (!result?.success) {
            throw new Error(result?.error || "Could not save profiles.");
        }

        data = {
            defaultProfile: result.defaultProfile || null,
            profiles: result.profiles.map(normalize)
        };

        renderList();
        loadForm();
        toastMessage("Profiles saved.");
    } catch (error) {
        toastMessage(error.message, true);
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = "Save changes";
    }
}

async function loadProfiles() {
    try {
        const result = await window.printFarm.getPrintProfiles();

        if (!result?.success) {
            throw new Error(result?.error || "Could not load profiles.");
        }

        data = {
            defaultProfile: result.defaultProfile || null,
            profiles: result.profiles.map(normalize)
        };

        if (!data.profiles.length) {
            throw new Error("No profiles were found.");
        }

        selectedIndex = data.profiles.findIndex(p => p.id === data.defaultProfile);
        if (selectedIndex < 0) selectedIndex = 0;

        loadingState.classList.add("hidden");
        renderList();
        loadForm();
    } catch (error) {
        loadingState.textContent = error.message;
        toastMessage(error.message, true);
    }
}

$("homeBtn").addEventListener("click", () => window.location.href = "index.html");
$("addProfileBtn").addEventListener("click", addProfile);
$("deleteProfileBtn").addEventListener("click", deleteProfile);
saveBtn.addEventListener("click", saveProfiles);
fields.duplex.addEventListener("change", updateDuplex);

for (const field of Object.values(fields)) {
    field.addEventListener("change", () => {
        syncCurrent();
        renderList();
    });
}

fields.name.addEventListener("input", () => {
    const p = current();
    if (!p) return;

    if (p.id.startsWith("new-profile-")) {
        const id = slugify(fields.name.value);
        if (id) fields.id.value = id;
    }
});


refreshProfilePrintersBtn.addEventListener(
    "click",
    loadAvailablePrinters
);


selectAllProfilePrintersBtn.addEventListener(
    "click",
    () => {
        availablePrinters
            .map(getPrinterDisplayName)
            .filter(Boolean)
            .forEach(name =>
                selectedProfilePrinters.add(name)
            );

        syncPrinterSelectionToCurrentProfile();
        renderProfilePrinters();
    }
);


clearProfilePrintersBtn.addEventListener(
    "click",
    () => {
        selectedProfilePrinters.clear();

        syncPrinterSelectionToCurrentProfile();
        renderProfilePrinters();
    }
);


Promise.all([
    loadProfiles(),
    loadAvailablePrinters()
]);
