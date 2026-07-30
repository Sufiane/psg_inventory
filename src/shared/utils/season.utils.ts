export function getSeasonBucket(referenceDate: Date): { start: Date; end: Date } {
    if (referenceDate.getMonth() < 7) {
        return {
            start: new Date(referenceDate.getFullYear() - 1, 7, 1),
            end: new Date(referenceDate.getFullYear(), 6, 31),
        };
    }

    return {
        start: new Date(referenceDate.getFullYear(), 7, 1),
        end: new Date(referenceDate.getFullYear() + 1, 6, 31),
    };
}

export function getCurrentSeasonDate(): { start: Date; end: Date } {
    return getSeasonBucket(new Date());
}
