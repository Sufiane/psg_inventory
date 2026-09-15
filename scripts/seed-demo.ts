/* eslint-disable no-console -- CLI script, console output is the UI */
import { Competition, PrismaClient, SaleStatus } from '@prisma/client';
import bcrypt from 'bcrypt';
import {
    getSeasonWindow,
    seasonStartYearFromDate,
} from '../src/shared/utils/season.utils';
import type { SeasonYear } from '@psg/shared/time';

const prisma = new PrismaClient();

const PSG_COMMISSION = 0.12;
const profitOf = (listed: number): number =>
    Math.round(listed * (1 - PSG_COMMISSION) * 100) / 100;

const SALT_ROUNDS = 10;

// Derived rather than hardcoded: a fixed year silently stops matching the app's
// notion of "current season" the first August after it was written.
const CURRENT_SEASON = seasonStartYearFromDate(new Date());
const PREVIOUS_SEASON = (CURRENT_SEASON - 1) as SeasonYear;

const KICKOFF_HOUR_UTC = 19;
const FIRST_FIXTURE_DAY = 16;
const DAYS_BETWEEN_FIXTURES = 14;
const HOME_FIXTURES_PER_SEASON = 19;
const AWAY_FIXTURES_PER_SEASON = 8;

const LIGUE_1_OPPONENTS = [
    'Olympique de Marseille',
    'Olympique Lyonnais',
    'AS Monaco',
    'LOSC Lille',
    'OGC Nice',
    'RC Lens',
    'Stade Rennais',
    'FC Nantes',
    'RC Strasbourg',
    'Stade Brestois',
    'Toulouse FC',
    'Stade de Reims',
    'Montpellier HSC',
    'AJ Auxerre',
    'Angers SCO',
    'AS Saint-Etienne',
    'Le Havre AC',
    'Real Madrid CF',
    'Manchester City FC',
];

const CUP_OPPONENTS = ['FC Lorient', 'Stade Malherbe Caen', 'Amiens SC'];

type FixturePlan = {
    opponent: string;
    competition: Competition;
    atHome: boolean;
    date: Date;
};

function competitionForIndex(index: number): Competition {
    if (index === 5) {
        return Competition.FRENCH_CUP;
    }

    if (index === 11) {
        return Competition.LEAGUE_CUP;
    }

    if (index % 4 === 3) {
        return Competition.CHAMPIONS_LEAGUE;
    }

    return Competition.CHAMPIONSHIP;
}

function kickoffDate(
    seasonStartYear: SeasonYear,
    index: number,
    dayOffset: number,
): Date {
    const { start } = getSeasonWindow(seasonStartYear, 'exclusive');
    const kickoff = new Date(start);

    kickoff.setUTCDate(
        kickoff.getUTCDate() +
            FIRST_FIXTURE_DAY +
            index * DAYS_BETWEEN_FIXTURES +
            dayOffset,
    );
    kickoff.setUTCHours(KICKOFF_HOUR_UTC, 0, 0, 0);

    return kickoff;
}

function opponentForIndex(index: number, competition: Competition): string {
    if (
        competition === Competition.FRENCH_CUP ||
        competition === Competition.LEAGUE_CUP
    ) {
        return CUP_OPPONENTS[index % CUP_OPPONENTS.length] as string;
    }

    return LIGUE_1_OPPONENTS[index % LIGUE_1_OPPONENTS.length] as string;
}

function seasonFixtures(seasonStartYear: SeasonYear): FixturePlan[] {
    const fixtures: FixturePlan[] = [];

    for (let index = 0; index < HOME_FIXTURES_PER_SEASON; index++) {
        const competition = competitionForIndex(index);

        fixtures.push({
            opponent: opponentForIndex(index, competition),
            competition,
            atHome: true,
            date: kickoffDate(seasonStartYear, index, 0),
        });
    }

    for (let index = 0; index < AWAY_FIXTURES_PER_SEASON; index++) {
        const competition = competitionForIndex(index);

        fixtures.push({
            opponent: opponentForIndex(index + 3, competition),
            competition,
            atHome: false,
            date: kickoffDate(seasonStartYear, index, 7),
        });
    }

    return fixtures;
}

// Deterministic so re-running the seed keeps the same scorelines instead of
// rewriting history on every run.
function resultForFixture(
    fixture: FixturePlan,
    index: number,
): { score: string; isWin: boolean } {
    const psgGoals = (index * 3) % 4;
    const opponentGoals = (index * 5) % 3;
    const isWin = psgGoals > opponentGoals;
    const score = fixture.atHome
        ? `${psgGoals} - ${opponentGoals}`
        : `${opponentGoals} - ${psgGoals}`;

    return { score, isWin };
}

async function opponentId(name: string): Promise<string> {
    const opponent = await prisma.opponents.upsert({
        where: { name },
        update: {},
        create: { name },
    });

    return opponent.id;
}

async function seedMatchesForSeason(seasonStartYear: SeasonYear): Promise<number> {
    const { start, end } = getSeasonWindow(seasonStartYear, 'exclusive');
    const existing = await prisma.matches.count({
        where: { date: { gte: start, lt: end } },
    });

    // Never mix synthetic fixtures into a season that already holds real data
    // pulled from the Football Data API.
    if (existing > 0) {
        console.log(
            `season ${seasonStartYear}: ${existing} matches already present, skipping`,
        );

        return existing;
    }

    const fixtures = seasonFixtures(seasonStartYear);
    const now = new Date();
    let created = 0;

    for (let index = 0; index < fixtures.length; index++) {
        const fixture = fixtures[index];

        if (!fixture) {
            continue;
        }

        const match = await prisma.matches.upsert({
            where: {
                date_opponentId: {
                    date: fixture.date,
                    opponentId: await opponentId(fixture.opponent),
                },
            },
            update: {},
            create: {
                opponentId: await opponentId(fixture.opponent),
                atHome: fixture.atHome,
                date: fixture.date,
                competition: fixture.competition,
            },
        });

        created++;

        if (fixture.date >= now) {
            continue;
        }

        const result = resultForFixture(fixture, index);

        await prisma.matchResults.upsert({
            where: { matchId: match.id },
            update: {},
            create: { matchId: match.id, score: result.score, isWin: result.isWin },
        });
    }

    console.log(`season ${seasonStartYear}: seeded ${created} synthetic matches`);

    return created;
}

type DemoSeed = {
    email: string;
    firstName: string;
    lastName: string;
    password: string;
};

async function upsertUser(seed: DemoSeed): Promise<string> {
    const hashed = await bcrypt.hash(seed.password, SALT_ROUNDS);
    const existing = await prisma.users.findUnique({ where: { email: seed.email } });

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
            data: {
                password: hashed,
                firstName: seed.firstName,
                lastName: seed.lastName,
            },
        });

        return existing.id;
    }

    const created = await prisma.users.create({
        data: {
            email: seed.email,
            password: hashed,
            firstName: seed.firstName,
            lastName: seed.lastName,
        },
    });

    return created.id;
}

async function matchesInSeason(
    seasonStartYear: SeasonYear,
    limit: number,
): Promise<{ id: string }[]> {
    const { start, end } = getSeasonWindow(seasonStartYear, 'exclusive');

    return prisma.matches.findMany({
        where: { date: { gte: start, lt: end }, atHome: true },
        orderBy: { date: 'asc' },
        take: limit,
        select: { id: true },
    });
}

async function addSale(params: {
    userId: string;
    matchId: string;
    listedPrice: number;
    invest: number;
    status: SaleStatus;
    soldAt: Date | null;
    gift: { recipientId: string; giftedAt: Date } | null;
    allocations: { seasonPassId: string; nbTickets: number }[];
}): Promise<void> {
    const nbTickets = params.allocations.reduce(
        (sum, allocation) => sum + allocation.nbTickets,
        0,
    );

    const created = await prisma.sales.create({
        data: {
            userId: params.userId,
            matchId: params.matchId,
            listedPrice: params.listedPrice,
            invest: params.invest,
            profit: profitOf(params.listedPrice),
            nbTickets,
            status: params.status,
            soldAt: params.soldAt,
            Allocations: {
                create: params.allocations.map((allocation) => ({
                    seasonPassId: allocation.seasonPassId,
                    nbTickets: allocation.nbTickets,
                })),
            },
        },
        select: { id: true },
    });

    if (params.gift != null) {
        await prisma.gifts.create({
            data: {
                saleId: created.id,
                saleStatus: SaleStatus.GIFTED,
                recipientId: params.gift.recipientId,
                giftedAt: params.gift.giftedAt,
            },
        });
    }
}

const PREVIOUS_SEASON_SALE_DAY_OFFSET = 193;

function previousSeasonSoldAt(index: number): Date {
    const { start } = getSeasonWindow(PREVIOUS_SEASON, 'exclusive');
    const soldAt = new Date(start);

    soldAt.setUTCDate(soldAt.getUTCDate() + PREVIOUS_SEASON_SALE_DAY_OFFSET + index);

    return soldAt;
}

const PREVIOUS_SEASON_SALE_DAY_OFFSET = 193;

function previousSeasonSoldAt(index: number): Date {
    const { start } = getSeasonWindow(PREVIOUS_SEASON, 'exclusive');
    const soldAt = new Date(start);

    soldAt.setUTCDate(soldAt.getUTCDate() + PREVIOUS_SEASON_SALE_DAY_OFFSET + index);

    return soldAt;
}

async function seedDemo1(): Promise<void> {
    const userId = await upsertUser({
        email: 'demo1@psg.fr',
        firstName: 'Demo',
        lastName: 'One',
        password: 'demo1234',
    });

    const currentPass = await prisma.seasonPasses.create({
        data: {
            userId,
            seasonStartYear: CURRENT_SEASON,
            price: 1800,
            label: 'Auteuil Bas',
            category: 'Auteuil',
            row: 'C',
            seat: '14',
        },
    });

    const previousPass = await prisma.seasonPasses.create({
        data: {
            userId,
            seasonStartYear: PREVIOUS_SEASON,
            price: 1700,
            label: 'Auteuil Bas',
            category: 'Auteuil',
            row: 'C',
            seat: '14',
        },
    });

    const recipient = await prisma.recipients.create({
        data: { userId, name: 'Marc' },
    });

    const currentMatches = await matchesInSeason(CURRENT_SEASON, 14);
    const previousMatches = await matchesInSeason(PREVIOUS_SEASON, 10);

    if (currentMatches.length === 0 || previousMatches.length === 0) {
        console.warn('demo1: missing matches for one of the seasons', {
            current: currentMatches.length,
            previous: previousMatches.length,
        });
    }

    // Listed prices sized so realized proceeds (1 - PSG_COMMISSION) clear the
    // 1800 season pass with margin. invest = 0: the ticket cost is already
    // captured by the season pass, not a separate per-match buy.
    type CurrentPlan = {
        listedPrice: number;
        status: SaleStatus;
        soldAgo: number | null;
    };

    const currentPlans: CurrentPlan[] = [
        { listedPrice: 260, status: SaleStatus.SOLD, soldAgo: 60 },
        { listedPrice: 220, status: SaleStatus.SOLD, soldAgo: 50 },
        { listedPrice: 340, status: SaleStatus.SOLD, soldAgo: 45 },
        { listedPrice: 280, status: SaleStatus.SOLD, soldAgo: 35 },
        { listedPrice: 240, status: SaleStatus.SOLD, soldAgo: 30 },
        { listedPrice: 380, status: SaleStatus.SOLD, soldAgo: 22 },
        { listedPrice: 260, status: SaleStatus.SOLD, soldAgo: 18 },
        { listedPrice: 220, status: SaleStatus.SOLD, soldAgo: 12 },
        { listedPrice: 300, status: SaleStatus.SOLD, soldAgo: 7 },
        { listedPrice: 260, status: SaleStatus.SOLD, soldAgo: 3 },
        { listedPrice: 280, status: SaleStatus.PENDING, soldAgo: null },
        { listedPrice: 220, status: SaleStatus.CANCELLED, soldAgo: null },
        { listedPrice: 200, status: SaleStatus.GIFTED, soldAgo: null },
        { listedPrice: 180, status: SaleStatus.GIFTED, soldAgo: null },
    ];

    const currentLimit = Math.min(currentMatches.length, currentPlans.length);

    for (let i = 0; i < currentLimit; i++) {
        const plan = currentPlans[i];
        const match = currentMatches[i];

        if (!plan || !match) {
            continue;
        }

        await addSale({
            userId,
            matchId: match.id,
            listedPrice: plan.listedPrice,
            invest: 0,
            status: plan.status,
            soldAt:
                plan.soldAgo == null
                    ? null
                    : new Date(Date.now() - plan.soldAgo * 86_400_000),
            gift:
                plan.status === SaleStatus.GIFTED
                    ? { recipientId: recipient.id, giftedAt: new Date() }
                    : null,
            allocations: [{ seasonPassId: currentPass.id, nbTickets: 1 }],
        });
    }

    const previousPlans = [
        { listedPrice: 240 },
        { listedPrice: 300 },
        { listedPrice: 260 },
        { listedPrice: 220 },
        { listedPrice: 360 },
        { listedPrice: 280 },
        { listedPrice: 260 },
        { listedPrice: 240 },
        { listedPrice: 320 },
    ];

    const previousLimit = Math.min(previousMatches.length, previousPlans.length);

    for (let i = 0; i < previousLimit; i++) {
        const plan = previousPlans[i];
        const match = previousMatches[i];

        if (!plan || !match) {
            continue;
        }

        await addSale({
            userId,
            matchId: match.id,
            listedPrice: plan.listedPrice,
            invest: 0,
            status: SaleStatus.SOLD,
            soldAt: previousSeasonSoldAt(i),
            gift: null,
            allocations: [{ seasonPassId: previousPass.id, nbTickets: 1 }],
        });
    }

    console.log('demo1 seeded:', {
        userId,
        currentPass: currentPass.id,
        previousPass: previousPass.id,
    });
}

async function seedDemo2(): Promise<void> {
    const userId = await upsertUser({
        email: 'demo2@psg.fr',
        firstName: 'Demo',
        lastName: 'Two',
        password: 'demo1234',
    });

    const passA = await prisma.seasonPasses.create({
        data: {
            userId,
            seasonStartYear: CURRENT_SEASON,
            price: 1800,
            label: 'Auteuil Bas',
            category: 'Auteuil',
            row: 'D',
            seat: '7',
        },
    });

    const passB = await prisma.seasonPasses.create({
        data: {
            userId,
            seasonStartYear: CURRENT_SEASON,
            price: 1800,
            label: 'Auteuil Bas',
            category: 'Auteuil',
            row: 'D',
            seat: '8',
        },
    });

    const matches = await matchesInSeason(CURRENT_SEASON, 9);

    if (matches.length === 0) {
        console.warn(`demo2: no matches for season ${CURRENT_SEASON}`);

        return;
    }

    // Two seats per sale at double the per-ticket price band; total needs to
    // clear the 2 * 1800 = 3600 invest with margin. invest = 0 (season pass).
    type Demo2Plan = {
        listedPrice: number;
        status: SaleStatus;
        soldAgo: number | null;
    };

    const plans: Demo2Plan[] = [
        { listedPrice: 480, status: SaleStatus.SOLD, soldAgo: 55 },
        { listedPrice: 560, status: SaleStatus.SOLD, soldAgo: 48 },
        { listedPrice: 680, status: SaleStatus.SOLD, soldAgo: 38 },
        { listedPrice: 520, status: SaleStatus.SOLD, soldAgo: 28 },
        { listedPrice: 600, status: SaleStatus.SOLD, soldAgo: 22 },
        { listedPrice: 720, status: SaleStatus.SOLD, soldAgo: 15 },
        { listedPrice: 540, status: SaleStatus.SOLD, soldAgo: 8 },
        { listedPrice: 580, status: SaleStatus.SOLD, soldAgo: 3 },
        { listedPrice: 620, status: SaleStatus.PENDING, soldAgo: null },
    ];

    const limit = Math.min(matches.length, plans.length);

    for (let i = 0; i < limit; i++) {
        const plan = plans[i];
        const match = matches[i];

        if (!plan || !match) {
            continue;
        }

        await addSale({
            userId,
            matchId: match.id,
            listedPrice: plan.listedPrice,
            invest: 0,
            status: plan.status,
            soldAt:
                plan.soldAgo == null
                    ? null
                    : new Date(Date.now() - plan.soldAgo * 86_400_000),
            gift: null,
            allocations: [
                { seasonPassId: passA.id, nbTickets: 1 },
                { seasonPassId: passB.id, nbTickets: 1 },
            ],
        });
    }

    console.log('demo2 seeded:', { userId, passA: passA.id, passB: passB.id });
}

async function main(): Promise<void> {
    await seedMatchesForSeason(PREVIOUS_SEASON);
    await seedMatchesForSeason(CURRENT_SEASON);
    await seedDemo1();
    await seedDemo2();
}

main()
    .catch((error) => {
        console.error(error);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
