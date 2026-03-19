import { Competition } from '@prisma/client';

import { DomainException } from '../../common/exceptions/domain.exception';
import { ErrorCode } from '../../common/exceptions/error-codes.enum';

export function convertStringToCompetition(competition: string): Competition {
    switch (competition) {
        case 'Ligue 1':
            return Competition.CHAMPIONSHIP;
        case 'UEFA Champions League':
            return Competition.CHAMPIONS_LEAGUE;
        default:
            throw new DomainException(ErrorCode.UNKNOWN_COMPETITION);
    }
}
