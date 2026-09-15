/* eslint-disable no-console -- CLI script, console output is the UI */
import { NestFactory } from '@nestjs/core';

import type { SaleId, UserId } from '@psg/shared/ids';
import { AppModule } from '../src/app.module';
import {
    ISalesService,
    SaleResponse,
} from '../src/api/sales/interfaces/sales.service.interface';
import { DomainException } from '../src/common/exceptions/domain.exception';
import { ErrorCode } from '../src/common/exceptions/error-codes.enum';

const USAGE = 'usage: npm run ungift -- <userId> <saleId> --yes';

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

// The sanctioned repair for a sale gifted by mistake. GIFTED is terminal in the
// app (spec D5), and since the gift row pins the sale's status at the database
// level (spec D15), `UPDATE sales SET status = 'PENDING'` typed into psql now
// fails outright. This is the supported way to do it: one command, one
// transaction, caches invalidated.
//
//   npm run ungift -- <userId> <saleId> --yes
async function main(): Promise<void> {
    const rawArgs = process.argv.slice(2);
    const confirmed = rawArgs.includes('--yes') || rawArgs.includes('-y');
    const [userId, saleId] = rawArgs.filter((arg) => arg !== '--yes' && arg !== '-y');

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
        const sale: SaleResponse = await salesService
            .getSale(userId as UserId, saleId as SaleId)
            .catch((error: unknown) => {
                if (
                    error instanceof DomainException &&
                    error.code === ErrorCode.SALE_NOT_FOUND
                ) {
                    console.error(
                        `error: no sale ${saleId} found for user ${userId}. ` +
                            `Double-check both ids, and that the argument order is <userId> <saleId>.`,
                    );
                    process.exit(1);
                }

                throw error;
            });

        console.log(`about to un-gift sale ${saleId}:`);
        console.log(
            `  match: ${sale.Match.Opponent.name} on ${sale.Match.date.toISOString().slice(0, 10)}`,
        );
        console.log(`  recipient: ${sale.Recipient?.name ?? '(none)'}`);
        console.log(
            `  giftedAt: ${sale.giftedAt != null ? sale.giftedAt.toISOString() : '(none)'}`,
        );

        if (!confirmed) {
            console.error(
                'refusing to un-gift without confirmation. Re-run with --yes (or -y) once the details above look right.',
            );
            process.exitCode = 1;

            return;
        }

        try {
            await salesService.ungiftSale(userId as UserId, saleId as SaleId);
        } catch (error) {
            if (
                error instanceof DomainException &&
                error.code === ErrorCode.SALE_INVALID_STATUS_TRANSITION
            ) {
                console.error(
                    `error: sale ${saleId} exists but is not currently GIFTED, so there is nothing to un-gift. ` +
                        'This is the single most likely real mistake here — double-check this is the sale you meant.',
                );
                process.exitCode = 1;

                return;
            }

            throw error;
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
