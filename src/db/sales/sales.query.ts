// Prisma query shape used by sales.service.ts and referenced by
// sale.type.ts to derive `Sale = Prisma.SalesGetPayload<typeof saleQuery>`.
// Lives in its own file so the type doesn't have to import the service
// (which would close a service ↔ type cycle).
// `Gift` is the sale's giftedness in full: its existence means gifted, its
// `giftedAt` is when, its `Recipient` is to whom. The api layer flattens it
// back onto the sale before it goes out on the wire (spec D17).
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
        Gift: {
            select: {
                giftedAt: true,
                recipientId: true,
                Recipient: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
            },
        },
    },
} as const;
