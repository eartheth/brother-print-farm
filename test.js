const printerSelect =
    document.getElementById(
        "testPrinter"
    );

const testPrintBtn =
    document.getElementById(
        "testPrintBtn"
    );

const testStatus =
    document.getElementById(
        "testStatus"
    );


async function loadPrinters() {

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


        printerSelect.innerHTML =
            `<option value="">
                Select printer...
            </option>`;


        result.printers.forEach(
            printer => {

                const option =
                    document.createElement(
                        "option"
                    );

                option.value =
                    printer.name;

                option.textContent =
                    printer.name;

                printerSelect.appendChild(
                    option
                );
            }
        );


    } catch (
    error
    ) {

        printerSelect.innerHTML =
            `<option value="">
                Could not load printers
            </option>`;

        console.error(
            "[TEST PRINT]",
            error
        );
    }
}


printerSelect.addEventListener(
    "change",
    () => {

        testPrintBtn.disabled =
            !printerSelect.value;
    }
);


testPrintBtn.addEventListener(
    "click",
    async () => {

        const printerName =
            printerSelect.value;


        if (
            !printerName
        ) {

            return;
        }


        testPrintBtn.disabled =
            true;

        testStatus.textContent =
            "Printing test page...";


        try {

            const result =
                await window
                    .printFarm
                    .testPrint(
                        printerName
                    );


            if (
                !result ||
                !result.success
            ) {

                throw new Error(
                    result?.error ||
                    "Test print failed."
                );
            }


            testStatus.textContent =
                "Test page sent to printer.";
            testPrintBtn.textContent =
                "Submitted";

            testPrintBtn.disabled =
                true;

            testPrintBtn.classList.add(
                "submitted"
            );


        } catch (
        error
        ) {

            testStatus.textContent =
                `Test print failed: ${error.message}`;

            console.error(
                "[TEST PRINT]",
                error
            );

        } finally {

            if (
                !testPrintBtn.classList.contains(
                    "submitted"
                )
            ) {

                testPrintBtn.disabled =
                    !printerSelect.value;
            }
        }
    }
);


loadPrinters();