import { describe, expect, it } from 'vitest';
import { dateTime, money, signedMoney } from './format';
import {
    deleteConfirmMessage,
    isStatusAllowed,
    passCostBasisHint,
    saveConfirmMessage,
} from './sale-edit';
import type { SaleAllocation, SeasonPass } from './types';

const MATCH_DATE = new Date('2026-03-14T20:00:00Z');

function pass(id: string, price: number): SeasonPass {
    return { id, price } as unknown as SeasonPass;
}

function allocation(seasonPassId: string, nbTickets: number): SaleAllocation {
    return { seasonPassId, nbTickets } as unknown as SaleAllocation;
}

describe('isStatusAllowed', () => {
    describe('when the target equals the current status', () => {
        describe('when the status is PENDING', () => {
            it('allows it', () => {
                expect(isStatusAllowed('PENDING', 'PENDING', true)).toBe(true);
            });
        });

        describe('when the status is SOLD', () => {
            it('allows it', () => {
                expect(isStatusAllowed('SOLD', 'SOLD', true)).toBe(true);
            });
        });

        describe('when the status is GIFTED', () => {
            it('allows it', () => {
                expect(isStatusAllowed('GIFTED', 'GIFTED', true)).toBe(true);
            });
        });

        describe('when the status is CANCELLED', () => {
            it('allows it', () => {
                expect(isStatusAllowed('CANCELLED', 'CANCELLED', true)).toBe(true);
            });
        });
    });

    describe('when the current status is GIFTED', () => {
        it('blocks SOLD', () => {
            expect(isStatusAllowed('GIFTED', 'SOLD', false)).toBe(false);
        });

        it('blocks PENDING', () => {
            expect(isStatusAllowed('GIFTED', 'PENDING', false)).toBe(false);
        });
    });

    describe('when the current status is SOLD', () => {
        it('allows PENDING', () => {
            expect(isStatusAllowed('SOLD', 'PENDING', false)).toBe(true);
        });

        it('blocks GIFTED', () => {
            expect(isStatusAllowed('SOLD', 'GIFTED', false)).toBe(false);
        });
    });

    describe('when the current status is PENDING', () => {
        describe('when the match is in the future', () => {
            it('allows GIFTED', () => {
                expect(isStatusAllowed('PENDING', 'GIFTED', false)).toBe(true);
            });
        });

        describe('when the match is in the past', () => {
            it('blocks GIFTED', () => {
                expect(isStatusAllowed('PENDING', 'GIFTED', true)).toBe(false);
            });
        });

        it('allows SOLD', () => {
            expect(isStatusAllowed('PENDING', 'SOLD', true)).toBe(true);
        });
    });

    describe('when the target is CANCELLED and the current status differs', () => {
        it('blocks it', () => {
            expect(isStatusAllowed('PENDING', 'CANCELLED', false)).toBe(false);
        });
    });
});

describe('passCostBasisHint', () => {
    const passes = [pass('a', 600), pass('b', 400)];

    describe('when home fixtures is null', () => {
        it('returns null', () => {
            expect(passCostBasisHint(passes, undefined, null)).toBeNull();
        });
    });

    describe('when home fixtures is 0', () => {
        it('returns null', () => {
            expect(passCostBasisHint(passes, undefined, 0)).toBeNull();
        });
    });

    describe('when there are no passes', () => {
        it('returns null', () => {
            expect(passCostBasisHint([], undefined, 19)).toBeNull();
        });
    });

    describe('when allocations name passes with tickets', () => {
        it('counts only those passes', () => {
            const allocations = [allocation('a', 2), allocation('b', 0)];

            expect(passCostBasisHint(passes, allocations, 19)).toBe(
                `Pass cost basis: ${money(600)} ÷ 19 home matches`,
            );
        });
    });

    describe('when no allocation has tickets', () => {
        it('counts every pass', () => {
            const allocations = [allocation('a', 0)];

            expect(passCostBasisHint(passes, allocations, 19)).toBe(
                `Pass cost basis: ${money(1000)} ÷ 19 home matches`,
            );
        });
    });

    describe('when allocations are undefined', () => {
        it('counts every pass', () => {
            expect(passCostBasisHint(passes, undefined, 19)).toBe(
                `Pass cost basis: ${money(1000)} ÷ 19 home matches`,
            );
        });
    });
});

describe('saveConfirmMessage', () => {
    function input(
        overrides: Partial<Parameters<typeof saveConfirmMessage>[0]> = {},
    ): Parameters<typeof saveConfirmMessage>[0] {
        return {
            current: 'PENDING',
            draft: 'PENDING',
            opponent: 'Lyon',
            isPastMatch: false,
            matchDate: MATCH_DATE,
            net: 120,
            ...overrides,
        };
    }

    describe('when the status is unchanged', () => {
        describe('when the match is in the future', () => {
            it('returns null', () => {
                expect(saveConfirmMessage(input())).toBeNull();
            });
        });

        describe('when the match is in the past', () => {
            it('returns the rewrite copy', () => {
                expect(saveConfirmMessage(input({ isPastMatch: true }))).toBe(
                    `Save changes to the Lyon sale? The match was on ${dateTime(MATCH_DATE)}; this rewrites historical numbers.`,
                );
            });
        });
    });

    describe('when the draft is SOLD from PENDING', () => {
        describe('when the match is in the future', () => {
            it('returns null', () => {
                expect(saveConfirmMessage(input({ draft: 'SOLD' }))).toBeNull();
            });
        });

        describe('when the match is in the past', () => {
            it('returns the historical sale copy', () => {
                expect(saveConfirmMessage(input({ draft: 'SOLD', isPastMatch: true }))).toBe(
                    `Mark the Lyon sale as sold? Match was on ${dateTime(MATCH_DATE)}; this writes a historical sale.`,
                );
            });
        });
    });

    describe('when the draft is PENDING from SOLD', () => {
        const revertCopy = `Revert the Lyon sale to pending? This removes ${signedMoney(120)} from realized net profit.`;

        describe('when the match is in the future', () => {
            it('returns the revert copy', () => {
                expect(saveConfirmMessage(input({ current: 'SOLD' }))).toBe(revertCopy);
            });
        });

        describe('when the match is in the past', () => {
            it('returns the revert copy', () => {
                expect(saveConfirmMessage(input({ current: 'SOLD', isPastMatch: true }))).toBe(
                    revertCopy,
                );
            });
        });
    });
});

describe('deleteConfirmMessage', () => {
    describe('when the match is in the future', () => {
        it('returns the short copy', () => {
            expect(
                deleteConfirmMessage({ opponent: 'Lyon', isPastMatch: false, matchDate: MATCH_DATE }),
            ).toBe('Delete the Lyon sale?');
        });
    });

    describe('when the match is in the past', () => {
        it('returns the rewrite copy', () => {
            expect(
                deleteConfirmMessage({ opponent: 'Lyon', isPastMatch: true, matchDate: MATCH_DATE }),
            ).toBe(
                `Delete the Lyon sale? The match was on ${dateTime(MATCH_DATE)}; this rewrites historical numbers.`,
            );
        });
    });
});
