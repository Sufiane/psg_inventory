const IMPORT_CSV_HEADER =
    'date,opponent,listedPrice,nbTickets,status,invest,soldAt,recipient';
const SEED_MATCH_DAYS_FROM_NOW = 30;

export type ImportCsvRow = {
    date: string;
    opponent: string;
    listedPrice: string;
    nbTickets: string;
    status: 'PENDING' | 'SOLD' | 'CANCELLED' | 'GIFTED';
    recipient?: string;
};

export type ImportCsvFile = { name: string; mimeType: string; buffer: Buffer };

// Mirrors DAYS_FROM_NOW in scripts/seed-e2e.ts; keep in sync by hand.
export function e2eMatchDate(): string {
    const kickoff = new Date();

    kickoff.setUTCDate(kickoff.getUTCDate() + SEED_MATCH_DAYS_FROM_NOW);

    return kickoff.toISOString().slice(0, 10);
}

export function buildImportCsv(rows: ImportCsvRow[]): ImportCsvFile {
    const lines = rows.map((row) =>
        [
            row.date,
            row.opponent,
            row.listedPrice,
            row.nbTickets,
            row.status,
            '',
            '',
            row.recipient ?? '',
        ].join(','),
    );

    return {
        name: 'sales-import.csv',
        mimeType: 'text/csv',
        buffer: Buffer.from(`${[IMPORT_CSV_HEADER, ...lines].join('\n')}\n`, 'utf8'),
    };
}
