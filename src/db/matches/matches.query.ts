// Prisma query shape used by matches.service.ts and referenced by
// match.type.ts to derive `Match = Prisma.MatchesGetPayload<...>`.
// Lives in its own file so the type doesn't have to import the service
// (which would close a service ↔ type cycle).
export function matchQuery(withResult: boolean = false) {
    return {
        include: {
            Opponent: true,
            MatchResults: withResult,
        },
    } as const;
}
