export default {
    accounting: (userId: string, start: Date, end?: Date) =>
        `accounting:user:id:${userId}:start:${start.toISOString()}:end:${end?.toISOString()}`,
    amortization: (userId: string, seasonStartYear: number) =>
        `accounting:user:id:${userId}:amortization:${seasonStartYear}`,
    invalidateAccounting: (userId: string) => `accounting:user:id:${userId}:*`,
    invalidateMatches: (from?: Date) =>
        from ? `matches:start:${from.toISOString()}:*` : 'matches:*',
    match: (matchId: string) => `match:id:${matchId}`,
    matches: (from: Date, to?: Date, withResult: boolean = false) =>
        `matches:start:${from.toISOString()}:end:${to?.toISOString()}:withResult:${withResult}`,
    sale: (saleId: string) => `sale:id:${saleId}`,
    sales: (userId: string) => `user:id:${userId}:sales`,
    salesByRange: (userId: string, from: Date, to: Date) =>
        `user:id:${userId}:sales:start:${from.toISOString()}:end:${to.toISOString()}`,
    invalidateSales: (userId: string) => `user:id:${userId}:sales*`,
    userByEmail: (email: string) => `user:email:${email}`,
    seasonPass: (id: string) => `season-pass:id:${id}`,
    seasonPassesBySeason: (userId: string, seasonStartYear: number) =>
        `user:id:${userId}:season-passes:season:${seasonStartYear}`,
    seasonPasses: (userId: string) => `user:id:${userId}:season-passes`,
    invalidateSeasonPasses: (userId: string) => `user:id:${userId}:season-pass*`,
    invalidateSeasonPassById: (id: string) => `season-pass:id:${id}*`,
};
