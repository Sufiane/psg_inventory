import { ErrorCode } from '../../../common/exceptions/error-codes.enum';
import { assertNotAfterKickoff } from './sale-kickoff.guard';

describe('assertNotAfterKickoff', () => {
    const now = new Date('2026-03-10T12:00:00Z');
    const past = new Date('2026-03-09T12:00:00Z');
    const future = new Date('2026-03-11T12:00:00Z');
    const kickoffError = expect.objectContaining({
        code: ErrorCode.SALE_AFTER_KICKOFF,
    });

    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(now);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe('when the match has kicked off', () => {
        it('throws for SOLD from PENDING', () => {
            expect(() => assertNotAfterKickoff(past, 'PENDING', 'SOLD')).toThrowError(
                kickoffError,
            );
        });

        it('throws for GIFTED from PENDING', () => {
            expect(() => assertNotAfterKickoff(past, 'PENDING', 'GIFTED')).toThrowError(
                kickoffError,
            );
        });

        it('throws for GIFTED from no current status', () => {
            expect(() => assertNotAfterKickoff(past, null, 'GIFTED')).toThrowError(
                kickoffError,
            );
        });

        it('does not throw for a PENDING target', () => {
            expect(() => assertNotAfterKickoff(past, 'SOLD', 'PENDING')).not.toThrow();
        });

        it('does not throw for GIFTED to GIFTED', () => {
            expect(() => assertNotAfterKickoff(past, 'GIFTED', 'GIFTED')).not.toThrow();
        });

        it('does not throw for an undefined target', () => {
            expect(() => assertNotAfterKickoff(past, 'PENDING', undefined)).not.toThrow();
        });
    });

    describe('when the match is in the future', () => {
        it('does not throw for SOLD', () => {
            expect(() => assertNotAfterKickoff(future, 'PENDING', 'SOLD')).not.toThrow();
        });

        it('does not throw for GIFTED', () => {
            expect(() =>
                assertNotAfterKickoff(future, 'PENDING', 'GIFTED'),
            ).not.toThrow();
        });
    });
});
