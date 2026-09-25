/* eslint-disable no-console -- CLI script, console output is the UI */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import { seasonStartYearFromDate } from '../src/shared/utils/season.utils';

const prisma = new PrismaClient();

const SALT_ROUNDS = 10;
const KICKOFF_HOUR_UTC = 19;
const DAYS_FROM_NOW = 30;

// Duplicated from e2e/fixtures.ts on purpose — see docs/plans/
// 2026-09-24-e2e-critical-path-tests-implementation-plan.md "Placement
// decision". Keep both in sync by hand.
const E2E_USER_EMAIL = 'e2e@psg-inventory.test';
const E2E_USER_PASSWORD = 'e2e-password-change-me';
const E2E_OPPONENT_NAME = 'E2E Test FC';
const E2E_SEASON_PASS_LABEL = 'E2E Tribune';

async function seedUser(): Promise<string> {
    const hashed = await bcrypt.hash(E2E_USER_PASSWORD, SALT_ROUNDS);
    const existing = await prisma.users.findUnique({ where: { email: E2E_USER_EMAIL } });

    if (existing) {
        await prisma.salePassAllocations.deleteMany({
            where: { Sale: { userId: existing.id } },
        });
        await prisma.saleHistories.deleteMany({
            where: { Sale: { userId: existing.id } },
        });
        await prisma.sales.deleteMany({ where: { userId: existing.id } });
        await prisma.seasonPasses.deleteMany({ where: { userId: existing.id } });
        await prisma.recipients.deleteMany({ where: { userId: existing.id } });
        await prisma.users.update({
            where: { id: existing.id },
            data: { password: hashed },
        });

        return existing.id;
    }

    const created = await prisma.users.create({
        data: {
            email: E2E_USER_EMAIL,
            password: hashed,
            firstName: 'E2E',
            lastName: 'Tester',
        },
    });

    return created.id;
}

async function seedMatch(): Promise<{ matchId: string; seasonStartYear: number }> {
    const opponent = await prisma.opponents.upsert({
        where: { name: E2E_OPPONENT_NAME },
        update: {},
        create: { name: E2E_OPPONENT_NAME },
    });

    const kickoff = new Date();
    kickoff.setUTCDate(kickoff.getUTCDate() + DAYS_FROM_NOW);
    kickoff.setUTCHours(KICKOFF_HOUR_UTC, 0, 0, 0);

    // Looked up by opponentId, not the day-relative `date`, so reruns on a
    // different calendar day still find and reuse the same E2E match instead
    // of inserting a duplicate.
    const existing = await prisma.matches.findFirst({
        where: { opponentId: opponent.id },
    });

    if (existing) {
        await prisma.salePassAllocations.deleteMany({
            where: { Sale: { matchId: existing.id } },
        });
        await prisma.saleHistories.deleteMany({
            where: { Sale: { matchId: existing.id } },
        });
        await prisma.sales.deleteMany({ where: { matchId: existing.id } });
        await prisma.matchResults.deleteMany({ where: { matchId: existing.id } });

        const updated = await prisma.matches.update({
            where: { id: existing.id },
            data: { atHome: true, date: kickoff, competition: 'CHAMPIONSHIP' },
        });

        return {
            matchId: updated.id,
            seasonStartYear: seasonStartYearFromDate(kickoff),
        };
    }

    const created = await prisma.matches.create({
        data: {
            opponentId: opponent.id,
            atHome: true,
            date: kickoff,
            competition: 'CHAMPIONSHIP',
        },
    });

    return {
        matchId: created.id,
        seasonStartYear: seasonStartYearFromDate(kickoff),
    };
}

async function seedSeasonPass(userId: string, seasonStartYear: number): Promise<void> {
    const existing = await prisma.seasonPasses.findFirst({
        where: { userId, label: E2E_SEASON_PASS_LABEL, seasonStartYear },
    });

    if (existing) {
        return;
    }

    await prisma.seasonPasses.create({
        data: {
            userId,
            seasonStartYear,
            price: 800,
            label: E2E_SEASON_PASS_LABEL,
            category: 'A',
            row: '1',
            seat: '1',
        },
    });
}

async function main(): Promise<void> {
    const userId = await seedUser();
    const { matchId, seasonStartYear } = await seedMatch();
    await seedSeasonPass(userId, seasonStartYear);

    console.log('e2e seed complete:', { userId, matchId, seasonStartYear });
}

main()
    .catch((error) => {
        console.error(error);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
