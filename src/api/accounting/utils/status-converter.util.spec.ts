import { statusConverter } from './status-converter.util';
import { SaleStatus } from '@prisma/client';

describe('statusConverter', () => {
    describe.each([
        {
            status: 'pending',
            expect: SaleStatus.PENDING,
        },
        {
            status: 'realized',
            expect: SaleStatus.SOLD,
        },
        {
            status: 'unrealized',
            expect: SaleStatus.CANCELLED,
        },
    ])(`when status is $status`, ({ status, expect: expectedResult }) => {
        it(`should return $expectedResult`, () => {
            expect(
                statusConverter(status as 'pending' | 'realized' | 'unrealized'),
            ).toEqual(expectedResult);
        });
    });
});
