import {
    BadRequestException,
    HttpException,
    InternalServerErrorException,
    NotFoundException,
} from '@nestjs/common';

import { DomainException } from './domain.exception';
import { ErrorCode } from './error-codes.enum';

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
};

export function toHttpException(e: unknown): HttpException {
    if (e instanceof DomainException) {
        return map[e.code]?.() ?? new InternalServerErrorException(e.code);
    }

    return new InternalServerErrorException(ErrorCode.INTERNAL_ERROR);
}
