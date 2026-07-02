import Papa from 'papaparse';

export type RawImportRow = {
    rowIndex: number;
    date: string;
    opponent: string;
    listedPrice: number;
    nbTickets: number;
    status: 'PENDING' | 'SOLD' | 'CANCELLED';
    invest: number;
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
const OPTIONAL_COLUMNS = ['invest'] as const;
const ALL_KNOWN_COLUMNS = new Set<string>([...REQUIRED_COLUMNS, ...OPTIONAL_COLUMNS]);

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

        const investRaw = raw.invest;

        rows.push({
            rowIndex: index,
            date: (raw.date ?? '').trim(),
            opponent: (raw.opponent ?? '').trim(),
            listedPrice: Number((raw.listedPrice ?? '').trim()),
            nbTickets: Number((raw.nbTickets ?? '').trim()),
            status: (raw.status ?? '').trim().toUpperCase() as RawImportRow['status'],
            invest:
                investRaw != null && investRaw.trim().length > 0
                    ? Number(investRaw.trim())
                    : 0,
        });
    }

    return { kind: 'ok', rows };
}
