import { parseImportCsv } from './sales-import.csv';

describe('parseImportCsv', () => {
    describe('when the CSV is valid', () => {
        it('returns the parsed row', () => {
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
    });

    describe('when the invest column is omitted', () => {
        it('defaults invest to 0', () => {
            const csv =
                'date,opponent,listedPrice,nbTickets,status\n2025-09-14,Marseille,120,1,SOLD\n';
            const result = parseImportCsv(Buffer.from(csv));

            expect(result.kind).toBe('ok');

            if (result.kind === 'ok') {
                expect(result.rows[0]!.invest).toBe(0);
            }
        });
    });

    describe('when the CSV starts with a BOM', () => {
        it('parses the header row', () => {
            const csv =
                '\uFEFFdate,opponent,listedPrice,nbTickets,status\n2025-09-14,Marseille,120,1,SOLD\n';
            const result = parseImportCsv(Buffer.from(csv));

            expect(result.kind).toBe('ok');
        });
    });

    describe('when there are blank rows', () => {
        it('returns only the non-blank rows', () => {
            const csv =
                'date,opponent,listedPrice,nbTickets,status\n\n2025-09-14,Marseille,120,1,SOLD\n\n';
            const result = parseImportCsv(Buffer.from(csv));

            expect(result.kind).toBe('ok');

            if (result.kind === 'ok') {
                expect(result.rows).toHaveLength(1);
            }
        });
    });

    describe('when the status differs in case', () => {
        it('stores the status in upper case', () => {
            const csv =
                'date,opponent,listedPrice,nbTickets,status\n2025-09-14,Marseille,120,1,sold\n';
            const result = parseImportCsv(Buffer.from(csv));

            expect(result.kind).toBe('ok');

            if (result.kind === 'ok') {
                expect(result.rows[0]!.status).toBe('SOLD');
            }
        });
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

    describe('when a required column is missing', () => {
        it('reports missing-column and the column name', () => {
            const csv =
                'date,opponent,listedPrice,status\n2025-09-14,Marseille,120,SOLD\n';
            const result = parseImportCsv(Buffer.from(csv));

            expect(result.kind).toBe('error');

            if (result.kind === 'error') {
                expect(result.error).toBe('missing-column');

                if (result.error === 'missing-column') {
                    expect(result.column).toBe('nbTickets');
                }
            }
        });
    });

    describe('when an unknown column is present', () => {
        it('reports unknown-column and the column name', () => {
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
    });

    describe('when the file is empty', () => {
        it('reports empty', () => {
            const result = parseImportCsv(Buffer.from(''));

            expect(result.kind).toBe('error');

            if (result.kind === 'error') {
                expect(result.error).toBe('empty');
            }
        });
    });

    describe('recipient column', () => {
        describe('when a recipient column is present', () => {
            it('parses the value onto the row', () => {
                const csv =
                    'date,opponent,listedPrice,nbTickets,status,recipient\n2025-09-14,Marseille,120,1,GIFTED,Marc\n';
                const result = parseImportCsv(Buffer.from(csv));

                expect(result.kind).toBe('ok');

                if (result.kind === 'ok') {
                    expect(result.rows[0]!.recipient).toBe('Marc');
                }
            });

            it('does not report it as an unknown column', () => {
                const csv =
                    'date,opponent,listedPrice,nbTickets,status,recipient\n2025-09-14,Marseille,120,1,GIFTED,Marc\n';
                const result = parseImportCsv(Buffer.from(csv));

                expect(result.kind).toBe('ok');
            });
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
    });
});
