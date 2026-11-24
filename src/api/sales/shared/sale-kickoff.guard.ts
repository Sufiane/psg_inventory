import { RawSaleStatus } from '../../accounting/types/accounting-status.type';
import { DomainException } from '../../../common/exceptions/domain.exception';
import { ErrorCode } from '../../../common/exceptions/error-codes.enum';
import { SaleStatusTarget } from '../dto/update-sale.dto';

export function assertNotAfterKickoff(
    matchDate: Date,
    current: RawSaleStatus | null,
    target: SaleStatusTarget | undefined,
): void {
    if (
        target !== undefined &&
        isKickoffGuarded(current, target) &&
        matchDate.getTime() <= Date.now()
    ) {
        throw new DomainException(ErrorCode.SALE_AFTER_KICKOFF);
    }
}

// Selling and giving a ticket away are both decisions taken before the match,
// so entering either state after kickoff is refused. GIFTED -> GIFTED is NOT
// entry: it moves no status, and correcting who received a gift is not a
// decision that has to precede the match, so it is deliberately exempt
// (spec D5/D10 — guarding on the target alone breaks that exemption).
function isKickoffGuarded(
    current: RawSaleStatus | null,
    target: SaleStatusTarget,
): boolean {
    if (target === 'SOLD') {
        return true;
    }

    return target === 'GIFTED' && current !== 'GIFTED';
}
