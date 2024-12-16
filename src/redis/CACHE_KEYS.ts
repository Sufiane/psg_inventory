export default {
    accounting: (userId: string, start: Date, end?: Date) =>
        `accounting:user:id:${userId}:start:${start.toString()}:end:${end?.toString()}`,
    invalidateAccounting: (userId: string) => `accounting:user:id:${userId}:*`,
    match: (matchId: string) => `match:id:${matchId}`,
    matches: (from: Date, to?: Date) =>
        `matches:start:${from.toString()}:end:${to?.toString()}`,
    sale: (saleId: string) => `sale:id:${saleId}`,
    sales: (userId: string) => `user:id:${userId}:sales`,
    userByEmail: (email: string) => `user:email:${email}`,
};
