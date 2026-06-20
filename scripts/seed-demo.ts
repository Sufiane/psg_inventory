/* eslint-disable no-console -- CLI script, console output is the UI */
import { PrismaClient, SaleStatus } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const PSG_COMMISSION = 0.12;
const profitOf = (listed: number): number =>
    Math.round(listed * (1 - PSG_COMMISSION) * 100) / 100;

const SALT_ROUNDS = 10;

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
    seasonStartYear: number,
    limit: number,
): Promise<{ id: string }[]> {
    const from = new Date(seasonStartYear, 7, 1);
    const to = new Date(seasonStartYear + 1, 7, 1);

    return prisma.matches.findMany({
        where: { date: { gte: from, lt: to }, atHome: true },
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
    allocations: { seasonPassId: string; nbTickets: number }[];
}): Promise<void> {
    const nbTickets = params.allocations.reduce(
        (sum, allocation) => sum + allocation.nbTickets,
        0,
    );

    await prisma.sales.create({
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
    });
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
            seasonStartYear: 2025,
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
            seasonStartYear: 2024,
            price: 1700,
            label: 'Auteuil Bas',
            category: 'Auteuil',
            row: 'C',
            seat: '14',
        },
    });

    const currentMatches = await matchesInSeason(2025, 12);
    const previousMatches = await matchesInSeason(2024, 10);

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
            soldAt: new Date(2025, 1, 10 + i),
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
            seasonStartYear: 2025,
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
            seasonStartYear: 2025,
            price: 1800,
            label: 'Auteuil Bas',
            category: 'Auteuil',
            row: 'D',
            seat: '8',
        },
    });

    const matches = await matchesInSeason(2025, 9);

    if (matches.length === 0) {
        console.warn('demo2: no matches for season 2025');

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
            allocations: [
                { seasonPassId: passA.id, nbTickets: 1 },
                { seasonPassId: passB.id, nbTickets: 1 },
            ],
        });
    }

    console.log('demo2 seeded:', { userId, passA: passA.id, passB: passB.id });
}

async function main(): Promise<void> {
    await seedDemo1();
    await seedDemo2();
}

main()
    .catch((error) => {
        console.error(error);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
