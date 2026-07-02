import { parseImportCsv } from './sales-import.csv';

describe('parseImportCsv', () => {
    it('parses a minimal valid CSV', () => {
        const csv =
            'date,opponent,listedPrice,nbTickets,status,invest\n2025-09-14,Marseille,120,1,SOLD,80\n';
        const result = parseImportCsv(Buffer.from(csv));

        expect(result.kind).toBe('ok');

        if (result.kind === 'ok') {
            expect(result.rows).toEqual([
                {
                    rowIndex: 0,
                    date: '2025-09-14',
                    opponent: 'Marseille',
                    listedPrice: 120,
                    nbTickets: 1,
                    status: 'SOLD',
                    invest: 80,
                },
            ]);
        }
    });

    it('defaults invest to 0 when column omitted', () => {
        const csv =
            'date,opponent,listedPrice,nbTickets,status\n2025-09-14,Marseille,120,1,SOLD\n';
        const result = parseImportCsv(Buffer.from(csv));

        expect(result.kind).toBe('ok');

        if (result.kind === 'ok') {
            expect(result.rows[0]!.invest).toBe(0);
        }
    });

    it('strips a BOM prefix', () => {
        const csv =
            '\uFEFFdate,opponent,listedPrice,nbTickets,status\n2025-09-14,Marseille,120,1,SOLD\n';
        const result = parseImportCsv(Buffer.from(csv));

        expect(result.kind).toBe('ok');
    });

    it('skips blank rows', () => {
        const csv =
            'date,opponent,listedPrice,nbTickets,status\n\n2025-09-14,Marseille,120,1,SOLD\n\n';
        const result = parseImportCsv(Buffer.from(csv));

        expect(result.kind).toBe('ok');

        if (result.kind === 'ok') {
            expect(result.rows).toHaveLength(1);
        }
    });

    it('accepts case-insensitive status', () => {
        const csv =
            'date,opponent,listedPrice,nbTickets,status\n2025-09-14,Marseille,120,1,sold\n';
        const result = parseImportCsv(Buffer.from(csv));

        expect(result.kind).toBe('ok');

        if (result.kind === 'ok') {
            expect(result.rows[0]!.status).toBe('SOLD');
        }
    });

    it('reports a missing required column', () => {
        const csv = 'date,opponent,listedPrice,status\n2025-09-14,Marseille,120,SOLD\n';
        const result = parseImportCsv(Buffer.from(csv));

        expect(result.kind).toBe('error');

        if (result.kind === 'error') {
            expect(result.error).toBe('missing-column');

            if (result.error === 'missing-column') {
                expect(result.column).toBe('nbTickets');
            }
        }
    });

    it('reports an unknown column', () => {
        const csv =
            'date,opponent,listedPrice,nbTickets,status,foo\n2025-09-14,Marseille,120,1,SOLD,x\n';
        const result = parseImportCsv(Buffer.from(csv));

        expect(result.kind).toBe('error');

        if (result.kind === 'error') {
            expect(result.error).toBe('unknown-column');

            if (result.error === 'unknown-column') {
                expect(result.column).toBe('foo');
            }
        }
    });

    it('reports an empty file', () => {
        const result = parseImportCsv(Buffer.from(''));

        expect(result.kind).toBe('error');

        if (result.kind === 'error') {
            expect(result.error).toBe('empty');
        }
    });
});
