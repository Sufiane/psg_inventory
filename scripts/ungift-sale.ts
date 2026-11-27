/* eslint-disable no-console -- CLI script, console output is the UI */
import { NestFactory } from '@nestjs/core';

import type { SaleId, UserId } from '@psg/shared/ids';
import type { ListedPrice } from '@psg/shared/money';
import { AppModule } from '../src/app.module';
import { ISalesService } from '../src/api/sales/interfaces/sales.service.interface';
import type { Sale } from '../src/db/sales/type/sale.type';
import { DomainException } from '../src/common/exceptions/domain.exception';
import { ErrorCode } from '../src/common/exceptions/error-codes.enum';

const USAGE = 'usage: npm run ungift -- <userId> <saleId> [--price <whole euros>] --yes';

const PRICE_FLAG = '--price';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuidShaped(value: string): boolean {
    return UUID_PATTERN.test(value);
}

// Cheap, no-app-needed guard against the single most likely real mistake: the
// two ids swapped under stress. A swapped pair is still two syntactically
// plausible-looking strings, so this only catches the case where one of them
// is not UUID-shaped at all — but that is also the common case, since userId
// and saleId rarely look alike by coincidence.
function assertUuidShaped(value: string, argName: 'userId' | 'saleId'): void {
    if (isUuidShaped(value)) {
        return;
    }

    console.error(
        `error: "${value}" is not a valid UUID for <${argName}>. ` +
            `Check the argument order — it's <userId> <saleId>, not the reverse.\n${USAGE}`,
    );
    process.exit(1);
}

function parsePriceArg(rawArgs: string[]): ListedPrice | undefined {
    const flagIndex = rawArgs.indexOf(PRICE_FLAG);

    if (flagIndex === -1) {
        return undefined;
    }

    const rawValue = rawArgs[flagIndex + 1] ?? '';
    const price = Number(rawValue);

    if (!/^\d+$/.test(rawValue) || !Number.isSafeInteger(price) || price < 1) {
        console.error(
            `error: --price must be a positive whole number of euros, got "${rawValue}".\n${USAGE}`,
        );
        process.exit(1);
    }

    return price as ListedPrice;
}

function assertNoUnknownFlags(positionalArgs: string[]): void {
    const unknown = positionalArgs.find(
        (arg) => arg.startsWith('-') && arg !== '--yes' && arg !== '-y',
    );

    if (unknown == null) {
        return;
    }

    console.error(
        `error: unknown or malformed flag "${unknown}" (use "--price <n>", not "--price=<n>").\n${USAGE}`,
    );
    process.exit(1);
}

function stripPriceArg(rawArgs: string[]): string[] {
    const flagIndex = rawArgs.indexOf(PRICE_FLAG);

    if (flagIndex === -1) {
        return rawArgs;
    }

    return rawArgs.filter(
        (_arg, index) => index !== flagIndex && index !== flagIndex + 1,
    );
}

function noPriceMessage(): string {
    return 'error: sale has no price; re-run with --price <whole euros>';
}

function alreadyPricedMessage(saleId: string): string {
    return `error: sale ${saleId} already has a price; drop --price so it is kept.`;
}

function priceArgMismatch(
    sale: Sale,
    price: ListedPrice | undefined,
    saleId: string,
): string | undefined {
    if (sale.listedPrice === 0 && price == null) {
        return noPriceMessage();
    }

    if (sale.listedPrice > 0 && price != null) {
        return alreadyPricedMessage(saleId);
    }

    return undefined;
}

function describeUngiftError(error: unknown, saleId: string): string | undefined {
    if (!(error instanceof DomainException)) {
        return undefined;
    }

    switch (error.code) {
        case ErrorCode.SALE_INVALID_STATUS_TRANSITION:
            return (
                `error: sale ${saleId} exists but is not currently GIFTED, so there is nothing to un-gift. ` +
                'This is the single most likely real mistake here — double-check this is the sale you meant.'
            );
        case ErrorCode.SALE_LISTED_PRICE_REQUIRED:
            return noPriceMessage();
        case ErrorCode.SALE_LISTED_PRICE_NOT_APPLICABLE:
            return alreadyPricedMessage(saleId);
        default:
            return undefined;
    }
}

async function loadSale(
    salesService: ISalesService,
    userId: string,
    saleId: string,
): Promise<Sale> {
    try {
        return await salesService.getSale(userId as UserId, saleId as SaleId);
    } catch (error) {
        if (error instanceof DomainException && error.code === ErrorCode.SALE_NOT_FOUND) {
            console.error(
                `error: no sale ${saleId} found for user ${userId}. ` +
                    `Double-check both ids, and that the argument order is <userId> <saleId>.`,
            );
            process.exit(1);
        }

        throw error;
    }
}

function printSaleSummary(sale: Sale, saleId: string): void {
    console.log(`about to un-gift sale ${saleId}:`);
    console.log(
        `  match: ${sale.Match.Opponent.name} on ${sale.Match.date.toISOString().slice(0, 10)}`,
    );
    console.log(`  recipient: ${sale.Gift?.Recipient.name ?? '(none)'}`);
    console.log(`  giftedAt: ${sale.Gift?.giftedAt.toISOString() ?? '(none)'}`);
}

// The sanctioned repair for a sale gifted by mistake. GIFTED is terminal in the
// app (spec D5), and since the gift row pins the sale's status at the database
// level (spec D15), `UPDATE sales SET status = 'PENDING'` typed into psql now
// fails outright. This is the supported way to do it: one command, one
// transaction, caches invalidated.
//
//   npm run ungift -- <userId> <saleId> [--price <whole euros>] --yes
//
// A gift created without a price has price 0; --price is then required, and
// is rejected for a sale that already has a price.
async function main(): Promise<void> {
    const rawArgs = process.argv.slice(2);
    const price = parsePriceArg(rawArgs);
    const positionalArgs = stripPriceArg(rawArgs);

    assertNoUnknownFlags(positionalArgs);

    const confirmed = positionalArgs.includes('--yes') || positionalArgs.includes('-y');
    const [userId, saleId] = positionalArgs.filter(
        (arg) => arg !== '--yes' && arg !== '-y',
    );

    if (userId == null || saleId == null) {
        console.error(USAGE);
        process.exitCode = 1;

        return;
    }

    assertUuidShaped(userId, 'userId');
    assertUuidShaped(saleId, 'saleId');

    const app = await NestFactory.createApplicationContext(AppModule, {
        logger: ['error', 'warn'],
    });

    try {
        const salesService = app.get(ISalesService);

        // Loaded — and printed — before the delete, so the terminal scrollback
        // is the record even if nobody was watching. This is no longer the only
        // safety net: the --yes flag below is the actual gate on the decision.
        const sale = await loadSale(salesService, userId, saleId);

        printSaleSummary(sale, saleId);

        const mismatch = priceArgMismatch(sale, price, saleId);

        if (mismatch != null) {
            console.error(mismatch);
            process.exitCode = 1;

            return;
        }

        if (price != null) {
            console.log(`  price to apply: ${price}`);
        }

        if (!confirmed) {
            console.error(
                'refusing to un-gift without confirmation. Re-run with --yes (or -y) once the details above look right.',
            );
            process.exitCode = 1;

            return;
        }

        try {
            await salesService.ungiftSale(userId as UserId, saleId as SaleId, price);
        } catch (error) {
            const message = describeUngiftError(error, saleId);

            if (message == null) {
                throw error;
            }

            console.error(message);
            process.exitCode = 1;

            return;
        }

        console.log(`sale ${saleId} is no longer gifted — status is PENDING`);

        // The cancel-sales cron (src/crons/cancel-sales/cancel-sales.service.ts)
        // runs nightly and auto-cancels every past-kickoff PENDING sale. The
        // common ungift case IS a past match, so without this note the operator
        // would be surprised to see the sale flip to CANCELLED by morning.
        if (sale.Match.date.getTime() <= Date.now()) {
            console.log(
                'note: this sale will be auto-cancelled by the nightly cron since the match has already been played.',
            );
        }
    } finally {
        await app.close();
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
