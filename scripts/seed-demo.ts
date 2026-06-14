import { PrismaClient, SaleStatus } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const PSG_COMMISSION = 0.12;
const profitOf = (listed: number): number => Math.round(listed * (1 - PSG_COMMISSION) * 100) / 100;

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
            data: { password: hashed, firstName: seed.firstName, lastName: seed.lastName },
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

async function matchesInSeason(seasonStartYear: number, limit: number): Promise<{ id: string }[]> {
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
    const nbTickets = params.allocations.reduce((sum, allocation) => sum + allocation.nbTickets, 0);

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

    const currentMatches = await matchesInSeason(2025, 4);
    const previousMatches = await matchesInSeason(2024, 4);

    if (currentMatches.length === 0 || previousMatches.length === 0) {
        console.warn('demo1: missing matches for one of the seasons', {
            current: currentMatches.length,
            previous: previousMatches.length,
        });
    }

    const currentPlans = [
        { listedPrice: 220, invest: 150, status: SaleStatus.SOLD as const, soldAgo: 20 },
        { listedPrice: 260, invest: 150, status: SaleStatus.SOLD as const, soldAgo: 8 },
        { listedPrice: 300, invest: 150, status: SaleStatus.PENDING as const, soldAgo: null },
        { listedPrice: 180, invest: 150, status: SaleStatus.CANCELLED as const, soldAgo: null },
    ];

    for (let i = 0; i < currentMatches.length && i < currentPlans.length; i++) {
        const plan = currentPlans[i];

        await addSale({
            userId,
            matchId: currentMatches[i].id,
            listedPrice: plan.listedPrice,
            invest: plan.invest,
            status: plan.status,
            soldAt: plan.soldAgo == null ? null : new Date(Date.now() - plan.soldAgo * 86_400_000),
            allocations: [{ seasonPassId: currentPass.id, nbTickets: 1 }],
        });
    }

    const previousPlans = [
        { listedPrice: 200, invest: 140 },
        { listedPrice: 240, invest: 140 },
        { listedPrice: 280, invest: 140 },
    ];

    for (let i = 0; i < previousMatches.length && i < previousPlans.length; i++) {
        const plan = previousPlans[i];

        await addSale({
            userId,
            matchId: previousMatches[i].id,
            listedPrice: plan.listedPrice,
            invest: plan.invest,
            status: SaleStatus.SOLD,
            soldAt: new Date(2025, 1, 10 + i),
            allocations: [{ seasonPassId: previousPass.id, nbTickets: 1 }],
        });
    }

    console.log('demo1 seeded:', { userId, currentPass: currentPass.id, previousPass: previousPass.id });
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

    const matches = await matchesInSeason(2025, 5);

    if (matches.length === 0) {
        console.warn('demo2: no matches for season 2025');

        return;
    }

    const plans = [
        { listedPrice: 480, invest: 300, status: SaleStatus.SOLD as const, soldAgo: 15 },
        { listedPrice: 520, invest: 300, status: SaleStatus.SOLD as const, soldAgo: 5 },
        { listedPrice: 600, invest: 300, status: SaleStatus.PENDING as const, soldAgo: null },
        { listedPrice: 440, invest: 300, status: SaleStatus.SOLD as const, soldAgo: 30 },
    ];

    for (let i = 0; i < matches.length && i < plans.length; i++) {
        const plan = plans[i];

        await addSale({
            userId,
            matchId: matches[i].id,
            listedPrice: plan.listedPrice,
            invest: plan.invest,
            status: plan.status,
            soldAt: plan.soldAgo == null ? null : new Date(Date.now() - plan.soldAgo * 86_400_000),
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
