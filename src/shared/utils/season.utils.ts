export function getCurrentSeasonDate(): { start: Date; end: Date } {
    const currentDate = new Date();

    if (currentDate.getMonth() < 7) {
        return {
            start: new Date(currentDate.getFullYear() - 1, 7, 1),
            end: new Date(currentDate.getFullYear(), 6, 31),
        };
    }

    return {
        start: new Date(currentDate.getFullYear(), 7, 1),
        end: new Date(currentDate.getFullYear() + 1, 6, 31),
    };
}
