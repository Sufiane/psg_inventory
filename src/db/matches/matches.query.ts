// Prisma query shape used by matches.db.ts and referenced by
// match.type.ts to derive `Match = Prisma.MatchesGetPayload<...>`.
// Lives in its own file so the type doesn't have to import the service
// (which would close a service ↔ type cycle).

type MatchQueryArgs = { include: { Opponent: true; MatchResults: boolean } };

export function matchQuery(withResult: boolean = false): MatchQueryArgs {
    return {
        include: {
            Opponent: true,
            MatchResults: withResult,
        },
    } as const;
}
