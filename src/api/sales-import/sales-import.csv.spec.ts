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
                    soldAt: null,
                    recipient: null,
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

    describe('when a row is GIFTED', () => {
        it('parses the status', () => {
            const csv = Buffer.from(
                'date,opponent,listedPrice,nbTickets,status\n2026-03-01,Lyon,120,1,GIFTED\n',
            );

            const result = parseImportCsv(csv);

            expect(result).toMatchObject({
                kind: 'ok',
                rows: [expect.objectContaining({ status: 'GIFTED' })],
            });
        });
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

    describe('recipient column', () => {
        it('parses a recipient value onto the row', () => {
            const csv =
                'date,opponent,listedPrice,nbTickets,status,recipient\n2025-09-14,Marseille,120,1,GIFTED,Marc\n';
            const result = parseImportCsv(Buffer.from(csv));

            expect(result.kind).toBe('ok');

            if (result.kind === 'ok') {
                expect(result.rows[0]!.recipient).toBe('Marc');
            }
        });

        describe('when the recipient cell is blank', () => {
            it('yields null', () => {
                const csv =
                    'date,opponent,listedPrice,nbTickets,status,recipient\n2025-09-14,Marseille,120,1,GIFTED,\n';
                const result = parseImportCsv(Buffer.from(csv));

                expect(result.kind).toBe('ok');

                if (result.kind === 'ok') {
                    expect(result.rows[0]!.recipient).toBeNull();
                }
            });
        });

        describe('when the header is absent', () => {
            it('yields null for every row', () => {
                const csv =
                    'date,opponent,listedPrice,nbTickets,status\n2025-09-14,Marseille,120,1,SOLD\n';
                const result = parseImportCsv(Buffer.from(csv));

                expect(result.kind).toBe('ok');

                if (result.kind === 'ok') {
                    expect(result.rows[0]!.recipient).toBeNull();
                }
            });
        });

        it('does not report recipient as an unknown column', () => {
            const csv =
                'date,opponent,listedPrice,nbTickets,status,recipient\n2025-09-14,Marseille,120,1,GIFTED,Marc\n';
            const result = parseImportCsv(Buffer.from(csv));

            expect(result.kind).toBe('ok');
        });
    });
});
