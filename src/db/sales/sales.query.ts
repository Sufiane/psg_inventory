// Prisma query shape used by sales.service.ts and referenced by
// sale.type.ts to derive `Sale = Prisma.SalesGetPayload<typeof saleQuery>`.
// Lives in its own file so the type doesn't have to import the service
// (which would close a service ↔ type cycle).
export const saleQuery = {
    include: {
        Match: {
            select: {
                date: true,
                Opponent: true,
            },
        },
        Allocations: {
            select: {
                id: true,
                seasonPassId: true,
                nbTickets: true,
            },
        },
    },
} as const;
