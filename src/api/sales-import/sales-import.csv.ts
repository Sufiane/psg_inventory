import Papa from 'papaparse';
import type { Invest, ListedPrice } from '@psg/shared/money';
import type { TicketCount } from '@psg/shared/counts';
import type { IsoDateString } from '@psg/shared/time';

export type RawImportRow = {
    rowIndex: number;
    date: string;
    opponent: string;
    listedPrice: ListedPrice;
    nbTickets: TicketCount;
    status: 'PENDING' | 'SOLD' | 'CANCELLED';
    invest: Invest;
    soldAt: IsoDateString | null;
};

export type CsvParseResult =
    | { kind: 'ok'; rows: RawImportRow[] }
    | { kind: 'error'; error: 'missing-column'; column: string }
    | { kind: 'error'; error: 'unknown-column'; column: string }
    | { kind: 'error'; error: 'empty' };

const REQUIRED_COLUMNS = [
    'date',
    'opponent',
    'listedPrice',
    'nbTickets',
    'status',
] as const;
const OPTIONAL_COLUMNS = ['invest', 'soldAt'] as const;
const ALL_KNOWN_COLUMNS = new Set<string>([...REQUIRED_COLUMNS, ...OPTIONAL_COLUMNS]);

// `cast` does real conversion, not just a type-level assertion — e.g. `Number(trimmed)`
// for a numeric brand. A bare `trimmed as T` would leave the runtime value a string,
// which is wrong for anything but string-based brands, so every cell (required or
// optional) goes through one of these two so trimming + conversion stays in one place.
function parseCell<T>(raw: string | undefined, cast: (trimmed: string) => T): T {
    return cast((raw ?? '').trim());
}

// Same as parseCell, but a blank cell means "not provided" (null) rather than an
// empty-string sentinel or a call to `cast` with an empty string.
function parseOptionalCell<T>(
    raw: string | undefined,
    cast: (trimmed: string) => T,
): T | null {
    const trimmed = (raw ?? '').trim();

    return trimmed.length > 0 ? cast(trimmed) : null;
}

export function parseImportCsv(buffer: Buffer): CsvParseResult {
    const text = buffer.toString('utf8').replace(/^\uFEFF/, '');

    if (text.trim().length === 0) {
        return { kind: 'error', error: 'empty' };
    }

    const parsed = Papa.parse<Record<string, string>>(text, {
        header: true,
        skipEmptyLines: 'greedy',
        transformHeader: (header) => header.trim(),
    });

    const headers = parsed.meta.fields ?? [];

    for (const required of REQUIRED_COLUMNS) {
        if (!headers.includes(required)) {
            return { kind: 'error', error: 'missing-column', column: required };
        }
    }

    for (const header of headers) {
        if (!ALL_KNOWN_COLUMNS.has(header)) {
            return { kind: 'error', error: 'unknown-column', column: header };
        }
    }

    const rows: RawImportRow[] = [];

    for (let index = 0; index < parsed.data.length; index++) {
        const raw = parsed.data[index];

        if (raw == null) {
            continue;
        }

        const nonEmpty = Object.values(raw).some(
            (value) => (value ?? '').trim().length > 0,
        );

        if (!nonEmpty) {
            continue;
        }

        rows.push({
            rowIndex: index,
            date: parseCell(raw.date, (value) => value),
            opponent: parseCell(raw.opponent, (value) => value),
            listedPrice: parseCell(
                raw.listedPrice,
                (value) => Number(value) as ListedPrice,
            ),
            nbTickets: parseCell(raw.nbTickets, (value) => Number(value) as TicketCount),
            status: parseCell(
                raw.status,
                (value) => value.toUpperCase() as RawImportRow['status'],
            ),
            invest:
                parseOptionalCell(raw.invest, (value) => Number(value) as Invest) ??
                (0 as Invest),
            soldAt: parseOptionalCell(raw.soldAt, (value) => value as IsoDateString),
        });
    }

    return { kind: 'ok', rows };
}
