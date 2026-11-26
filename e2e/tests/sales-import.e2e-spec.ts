import { expect, test, type Locator, type Page } from '@playwright/test';
import { E2E_OPPONENT_NAME, E2E_SEASON_PASS_LABEL } from '../fixtures';
import {
    buildImportCsv,
    e2eMatchDate,
    type ImportCsvFile,
    type ImportCsvRow,
} from '../import-csv';

const PENDING_PRICE = '611';
const GIFTED_PRICE = '612';
const UNNAMED_GIFT_PRICE = '613';
const RECIPIENT_NAME = 'E2E Import Recipient';
const SEASON_START_MONTH = 7;

// Same Aug 1 UTC boundary as seasonStartYearFromDate in web/src/lib/season.ts.
function seasonStartYear(date: Date): number {
    return date.getUTCMonth() < SEASON_START_MONTH
        ? date.getUTCFullYear() - 1
        : date.getUTCFullYear();
}

function csvRow(
    listedPrice: string,
    status: ImportCsvRow['status'],
    recipient?: string,
): ImportCsvRow {
    return {
        date: e2eMatchDate(),
        opponent: E2E_OPPONENT_NAME,
        listedPrice,
        nbTickets: '1',
        status,
        recipient,
    };
}

function importDialog(page: Page): Locator {
    return page.getByRole('dialog', { name: 'Import sales' });
}

async function uploadCsv(page: Page, csv: ImportCsvFile): Promise<void> {
    await importDialog(page).locator('input[type="file"]').setInputFiles(csv);
}

async function pickSeededPass(page: Page): Promise<void> {
    const dialog = importDialog(page);
    const passCheckbox = dialog.getByRole('checkbox', { name: E2E_SEASON_PASS_LABEL });
    const matchSeason = seasonStartYear(new Date(e2eMatchDate()));

    if (matchSeason !== seasonStartYear(new Date())) {
        await dialog.getByText('Previous seasons').click();
    }

    await passCheckbox.check();
}

async function previewCsv(page: Page, csv: ImportCsvFile): Promise<void> {
    const dialog = importDialog(page);

    await pickSeededPass(page);
    await uploadCsv(page, csv);
    await dialog.getByRole('button', { name: 'Preview' }).click();
    await expect(dialog.getByRole('table')).toBeVisible();
}

function importedRow(page: Page, listedPrice: string): Locator {
    return page
        .getByRole('row')
        .filter({ hasText: E2E_OPPONENT_NAME })
        .filter({
            has: page.getByRole('cell', { name: new RegExp(`^${listedPrice}\\b`) }),
        });
}

async function openAllSeasonsSales(page: Page): Promise<Page> {
    const salesPage = await page.context().newPage();

    await salesPage.goto('/sales?year=all');

    return salesPage;
}

function giftedRow(page: Page, recipient: string): Locator {
    return page.getByRole('row', {
        name: new RegExp(`${E2E_OPPONENT_NAME}.*Gifted to ${recipient}`),
    });
}

test.describe('sales CSV import', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/sales');
        await page.getByRole('button', { name: 'Import CSV' }).click();
        await expect(importDialog(page)).toBeVisible();
    });

    test.describe('when no pass is picked', () => {
        test('keeps Preview disabled', async ({ page }) => {
            await uploadCsv(page, buildImportCsv([csvRow(PENDING_PRICE, 'PENDING')]));

            await expect(
                importDialog(page).getByRole('button', { name: 'Preview' }),
            ).toBeDisabled();
        });
    });

    test.describe('when a gifted row has no recipient', () => {
        test.beforeEach(async ({ page }) => {
            await previewCsv(
                page,
                buildImportCsv([
                    csvRow(PENDING_PRICE, 'PENDING'),
                    csvRow(UNNAMED_GIFT_PRICE, 'GIFTED'),
                ]),
            );
        });

        test('blocks the import until a recipient is set', async ({ page }) => {
            const dialog = importDialog(page);
            const recipientInput = dialog.getByRole('textbox', {
                name: 'Recipient',
                disabled: false,
            });
            const importButton = dialog.getByRole('button', {
                name: 'Import 2 sales',
                exact: true,
            });

            await expect(recipientInput).toHaveAttribute(
                'placeholder',
                'Recipient required',
            );
            await expect(importButton).toBeDisabled();

            await recipientInput.fill(RECIPIENT_NAME);
            await recipientInput.press('Tab');

            await expect(importButton).toBeEnabled();

            await dialog.getByRole('button', { name: 'Cancel' }).click();

            await expect(dialog).toBeHidden();
        });
    });

    test.describe('when the CSV is valid', () => {
        let unrevertedBatchId: string | null = null;

        test.beforeEach(async ({ page }) => {
            unrevertedBatchId = null;

            await previewCsv(
                page,
                buildImportCsv([
                    csvRow(PENDING_PRICE, 'PENDING'),
                    csvRow(GIFTED_PRICE, 'GIFTED', RECIPIENT_NAME),
                ]),
            );
        });

        test.afterEach(async ({ page }) => {
            if (unrevertedBatchId == null) {
                return;
            }

            const revert = await page.request.delete(
                `/api/sales-import/${unrevertedBatchId}`,
            );

            expect(revert.ok()).toBe(true);
        });

        test('imports the rows, then undo removes them', async ({ page }) => {
            const dialog = importDialog(page);
            const commitResponse = page.waitForResponse('**/api/sales-import/commit');

            await dialog
                .getByRole('button', { name: 'Import 2 sales', exact: true })
                .click();

            const commitBody = (await (await commitResponse).json()) as {
                batchId: string;
            };

            unrevertedBatchId = commitBody.batchId;

            await expect(dialog.getByRole('status')).toHaveText('2 sales imported.');

            const salesPage = await openAllSeasonsSales(page);

            await expect(importedRow(salesPage, PENDING_PRICE)).toBeVisible();
            await expect(giftedRow(salesPage, RECIPIENT_NAME)).toBeVisible();

            await dialog.getByRole('button', { name: 'Undo import' }).click();

            await expect(dialog.getByRole('alert')).toHaveText(
                'Import reverted. You can re-import.',
            );

            unrevertedBatchId = null;

            await salesPage.reload();

            await expect(
                salesPage.getByRole('heading', { name: 'Sales', level: 1 }),
            ).toBeVisible();

            await expect(importedRow(salesPage, PENDING_PRICE)).toHaveCount(0);
            await expect(giftedRow(salesPage, RECIPIENT_NAME)).toHaveCount(0);

            await salesPage.close();
        });
    });
});
