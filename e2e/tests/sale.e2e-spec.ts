import { expect, test, type Locator, type Page } from '@playwright/test';
import { E2E_OPPONENT_NAME } from '../fixtures';

// Distinct per scenario so a row can be found unambiguously even though both
// sales share the same seeded opponent/match — see spec D4. Playwright's
// `fullyParallel` config can run these two tests concurrently, so neither
// scenario may assume it is "the only" sale for this opponent.
const SOLD_PRICE = '501';
const GIFT_PRICE = '502';
const RECIPIENT_NAME = 'E2E Recipient';

async function createSale(page: Page, listedPrice: string): Promise<void> {
    await page.goto('/sales/new');

    // Exactly one upcoming match exists in the e2e seed data
    // (scripts/seed-e2e.ts seeds a single match, always 30 days out), so the
    // second <option> (index 1, after the "Select a match…" placeholder) is
    // always the seeded E2E match.
    await page.getByLabel('Match').selectOption({ index: 1 });

    await page
        .getByRole('group', { name: 'Tickets per pass' })
        .getByRole('spinbutton')
        .fill('1');

    await page.getByLabel('Listed price (€)').fill(listedPrice);

    await page.getByRole('button', { name: 'Create sale' }).click();
    await page.waitForURL('**/sales');
}

function saleRow(page: Page, listedPrice: string): Locator {
    return page.getByRole('row', {
        name: new RegExp(`${E2E_OPPONENT_NAME}.*${listedPrice}`),
    });
}

test.describe('sale lifecycle', () => {
    test('create, mark SOLD, then delete a sale', async ({ page }) => {
        await createSale(page, SOLD_PRICE);

        const row = saleRow(page, SOLD_PRICE);

        await expect(row).toBeVisible();
        await expect(row).toContainText('PENDING');

        await row.getByRole('link', { name: 'Edit' }).click();

        const drawer = page.getByRole('region', {
            name: new RegExp(`Edit sale vs ${E2E_OPPONENT_NAME}`),
        });

        await expect(drawer).toBeVisible();
        await drawer.getByRole('button', { name: /^Mark sold/ }).click();
        await page.waitForURL('**/sales');

        const soldRow = saleRow(page, SOLD_PRICE);

        await expect(soldRow).toContainText('SOLD');

        await soldRow.getByRole('link', { name: 'Edit' }).click();

        const soldDrawer = page.getByRole('region', {
            name: new RegExp(`Edit sale vs ${E2E_OPPONENT_NAME}`),
        });

        page.once('dialog', (dialog) => dialog.accept());
        await soldDrawer.getByRole('button', { name: 'Delete sale' }).click();
        await page.waitForURL('**/sales');

        await expect(saleRow(page, SOLD_PRICE)).toHaveCount(0);
    });

    test('create, mark GIFTED with a recipient, then delete a sale', async ({ page }) => {
        await createSale(page, GIFT_PRICE);

        const row = saleRow(page, GIFT_PRICE);

        await expect(row).toBeVisible();
        await expect(row).toContainText('PENDING');

        await row.getByRole('link', { name: 'Edit' }).click();

        const drawer = page.getByRole('region', {
            name: new RegExp(`Edit sale vs ${E2E_OPPONENT_NAME}`),
        });

        await expect(drawer).toBeVisible();
        await drawer.getByLabel('Given to').fill(RECIPIENT_NAME);
        await drawer.getByRole('button', { name: 'Mark gifted' }).click();
        await page.waitForURL('**/sales');

        const giftedRow = saleRow(page, GIFT_PRICE);

        await expect(giftedRow).toContainText('GIFTED');

        await giftedRow.getByRole('link', { name: 'Edit' }).click();

        const giftedDrawer = page.getByRole('region', {
            name: new RegExp(`Edit sale vs ${E2E_OPPONENT_NAME}`),
        });

        await expect(giftedDrawer).toContainText(RECIPIENT_NAME);

        page.once('dialog', (dialog) => dialog.accept());
        await giftedDrawer.getByRole('button', { name: 'Delete sale' }).click();
        await page.waitForURL('**/sales');

        await expect(saleRow(page, GIFT_PRICE)).toHaveCount(0);
    });
});
