export default {
    accounting: (userId: string, start: Date, end?: Date) =>
        `accounting:user:id:${userId}:start:${start.toISOString()}:end:${end?.toISOString()}`,
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
};
