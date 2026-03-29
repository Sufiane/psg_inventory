export default {
    accounting: (userId: string, start: Date, end?: Date) =>
        `accounting:user:id:${userId}:start:${start.toISOString()}:end:${end?.toISOString()}`,
    invalidateAccounting: (userId: string) => `accounting:user:id:${userId}:*`,
    invalidateMatches: () => 'matches:*',
    match: (matchId: string) => `match:id:${matchId}`,
    matches: (from: Date, to?: Date) =>
        `matches:start:${from.toISOString()}:end:${to?.toISOString()}`,
    sale: (saleId: string) => `sale:id:${saleId}`,
    sales: (userId: string) => `user:id:${userId}:sales`,
    userByEmail: (email: string) => `user:email:${email}`,
};
