export function buildInclusiveDateRangeFilter(
    from: Date,
    to?: Date,
): { gte: Date; lte?: Date } {
    return {
        gte: from,
        ...(to ? { lte: to } : {}),
    };
}
