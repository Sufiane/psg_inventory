import { expect, test, type Locator } from '@playwright/test';

test.describe('season pass', () => {
    test('create, update, and delete a season pass', async ({ page }) => {
        const label = `Test Pass ${Date.now()}`;
        const updatedPrice = '750';

        await page.goto('/season');

        // Open the create disclosure.
        await page.getByText('+ Add another pass').click();

        const createForm = page.locator('details form');
        await createForm.getByLabel('Label').fill(label);
        await createForm.getByLabel('Price (€)').fill('500');
        await createForm.getByLabel('Category').fill('A');
        await createForm.getByLabel('Row').fill('1');
        await createForm.getByLabel('Seat').fill('1');
        await createForm.getByRole('button', { name: 'Add pass' }).click();

        // Scope to the success banner specifically: the in-button <Spinner>
        // also renders role="status" while a submission is in flight, so
        // getByRole('status') could resolve to two elements (strict violation).
        const status = page.locator('p[role="status"]');
        await expect(status).toHaveText(/Pass added to season/);

        // Season-list cards are the <li>s that own an update form. The label
        // lives only in <input name="label"> — an input's value is not text
        // content (hasText can't see it) and Svelte 5 stores it as a `value`
        // *property*, so the value attribute is absent too (an attribute
        // selector can't see it either). Worse, SvelteKit's enhance resets the
        // form after every successful action, and Svelte skips re-applying
        // values whose data didn't change — so after Save the card's
        // label/category/row/seat inputs render EMPTY. Therefore:
        //   1. discover the card once, right after create (the create form's
        //      reset doesn't touch the update forms, so the label input still
        //      holds the label), reading its label input's *value*; and
        //   2. anchor every later step on the card's hidden passId input, whose
        //      value attribute is stable across re-renders and form resets.
        // TODO: the blank-after-save behavior above is a product bug (the
        // required inputs empty after Save until retyped); candidate fix is
        // `update({ reset: false })` in +page.svelte. File a follow-up
        // ticket, then simplify this workaround.
        const seasonCards = page.locator('li', {
            has: page.locator('form[action="?/update"]'),
        });

        const discoverPassId = async (): Promise<string | null> => {
            const count = await seasonCards.count();

            for (let i = 0; i < count; i++) {
                try {
                    const candidate = seasonCards.nth(i);
                    const value = await candidate
                        .locator('input[name="label"]')
                        .inputValue();

                    if (value === label) {
                        const passId = await candidate
                            .locator('input[name="passId"]')
                            .getAttribute('value');

                        if (passId) {
                            return passId;
                        }
                    }
                } catch {
                    // Card re-rendered mid-check; expect.poll retries.
                }
            }

            return null;
        };

        let passId: string | null = null;
        await expect
            .poll(async () => (passId = await discoverPassId()), {
                message: `season card with label "${label}" should appear`,
            })
            .not.toBeNull();

        if (!passId) {
            throw new Error(`Could not read the passId of the pass labelled "${label}".`);
        }

        // The UUID uniquely identifies this pass: exactly one season-list card
        // matches, never the right-hand "All recorded passes" <li> (no form,
        // no passId) and never any other pass's card.
        const card: Locator = seasonCards.filter({
            has: page.locator(`input[name="passId"][value="${passId}"]`),
        });
        await expect(card).toBeVisible();

        // The right column lists the same label as *text* in a plain <li> with
        // no form. Establish that it exists now so the delete-time count of 0
        // below is a meaningful assertion rather than a vacuous one.
        await expect(page.locator('li', { hasText: label })).toHaveCount(1);

        // Update: change the price on this pass's own form.
        await card.getByLabel('Price (€)').fill(updatedPrice);
        await card.getByRole('button', { name: 'Save' }).click();

        await expect(status).toHaveText('Pass updated.');
        // The card re-renders from server data after the action (the price is
        // the one field whose data changed, so Svelte re-applies it), so this
        // fails if the new price did not persist server-side.
        await expect(card.getByLabel('Price (€)')).toHaveValue(updatedPrice);

        // Delete: accept the native confirm() dialog, then remove the pass.
        page.once('dialog', (dialog) => dialog.accept());
        await card.getByRole('button', { name: 'Delete' }).click();

        await expect(status).toHaveText('Pass removed.');

        // The pass's card is gone from the season list…
        await expect(card).toHaveCount(0);

        // …and so is its row in the right-hand "All recorded passes" list.
        await expect(page.locator('li', { hasText: label })).toHaveCount(0);
    });
});
