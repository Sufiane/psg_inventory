/**
 * Split a match list at `now`.
 *
 * `/matches/current-season` and `/matches/season/:year` both return a whole
 * season, ascending by date and including matches already played, so every
 * screen that wants "what's still to come" has to draw the line itself. This
 * is that line, in one place.
 *
 * `upcoming` preserves the input's ascending order. `past` comes back
 * most-recent-first, which is how it reads on every surface that shows it.
 * A match kicking off at exactly `now` counts as upcoming.
 *
 * Generic over `{ date: string }` rather than importing FormattedMatch, so
 * this stays a pure primitive module like `$lib/season` — and pure, so the
 * same call works in a `+page.server.ts` load and in a browser `$derived`.
 */
export function splitByKickoff<T extends { date: string }>(
    matches: readonly T[],
    now: Date,
): { upcoming: T[]; past: T[] } {
    const cutoff = now.getTime();
    const upcoming: T[] = [];
    const past: T[] = [];

    for (const match of matches) {
        const kickoff = new Date(match.date).getTime();

        if (kickoff >= cutoff) {
            upcoming.push(match);
        } else {
            past.push(match);
        }
    }

    past.sort(
        (left, right) => new Date(right.date).getTime() - new Date(left.date).getTime(),
    );

    return { upcoming, past };
}
