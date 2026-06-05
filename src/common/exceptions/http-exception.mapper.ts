import {
    BadRequestException,
    ConflictException,
    HttpException,
    InternalServerErrorException,
    Logger,
    NotFoundException,
} from '@nestjs/common';

import { DomainException } from './domain.exception';
import { ErrorCode } from './error-codes.enum';

const logger = new Logger('HttpExceptionMapper');

const map: Record<ErrorCode, () => HttpException> = {
    [ErrorCode.MATCH_NOT_FOUND]: () => new NotFoundException(ErrorCode.MATCH_NOT_FOUND),
    [ErrorCode.SALE_NOT_FOUND]: () => new NotFoundException(ErrorCode.SALE_NOT_FOUND),
    [ErrorCode.UNKNOWN_COMPETITION]: () =>
        new BadRequestException(ErrorCode.UNKNOWN_COMPETITION),
    [ErrorCode.MATCH_CREATION_FAILED]: () =>
        new InternalServerErrorException(ErrorCode.MATCH_CREATION_FAILED),
    [ErrorCode.COULD_NOT_LOAD_MATCHES]: () =>
        new InternalServerErrorException(ErrorCode.COULD_NOT_LOAD_MATCHES),
    [ErrorCode.INTERNAL_ERROR]: () =>
        new InternalServerErrorException(ErrorCode.INTERNAL_ERROR),
    [ErrorCode.EMAIL_ALREADY_EXISTS]: () =>
        new ConflictException(ErrorCode.EMAIL_ALREADY_EXISTS),
    [ErrorCode.SALE_AFTER_KICKOFF]: () =>
        new BadRequestException(ErrorCode.SALE_AFTER_KICKOFF),
};

export function toHttpException(e: unknown): HttpException {
    if (e instanceof DomainException) {
        return map[e.code]?.() ?? new InternalServerErrorException(e.code);
    }

    // Unmapped errors collapse to a generic 500 on the wire; without this log
    // the original cause is lost and the response is undebuggable.
    if (e instanceof Error) {
        logger.error(`Unmapped error: ${e.message}`, e.stack);
    } else {
        logger.error('Unmapped non-error thrown', e);
    }

    return new InternalServerErrorException(ErrorCode.INTERNAL_ERROR);
}
