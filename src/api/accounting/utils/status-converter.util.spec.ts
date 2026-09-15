import { statusConverter } from './status-converter.util';

describe('statusConverter', () => {
    describe('when the bucket is realized', () => {
        it('returns SOLD only', () => {
            expect(statusConverter('realized')).toEqual(['SOLD']);
        });
    });

    describe('when the bucket is pending', () => {
        it('returns PENDING only', () => {
            expect(statusConverter('pending')).toEqual(['PENDING']);
        });
    });

    describe('when the bucket is unrealized', () => {
        it('spans CANCELLED and GIFTED', () => {
            expect(statusConverter('unrealized')).toEqual(['CANCELLED', 'GIFTED']);
        });
    });

    describe('when the bucket is gifted', () => {
        it('returns GIFTED only', () => {
            expect(statusConverter('gifted')).toEqual(['GIFTED']);
        });
    });
});
