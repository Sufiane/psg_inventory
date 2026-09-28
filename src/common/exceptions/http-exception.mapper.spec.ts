import { ConflictException, NotFoundException } from '@nestjs/common';

import { toHttpException } from './http-exception.mapper';
import { DomainException } from './domain.exception';
import { ErrorCode } from './error-codes.enum';

describe('toHttpException', () => {
    describe('when the error is SALE_NOT_FOUND', () => {
        it('maps to 404 — the wire contract of every sale not-found path', () => {
            const result = toHttpException(new DomainException(ErrorCode.SALE_NOT_FOUND));

            expect(result).toBeInstanceOf(NotFoundException);
            expect(result.getStatus()).toBe(404);
        });
    });

    describe('when the error is EMAIL_ALREADY_EXISTS', () => {
        it('maps to 409 — unchanged by Tasks 3 and 4', () => {
            const result = toHttpException(
                new DomainException(ErrorCode.EMAIL_ALREADY_EXISTS),
            );

            expect(result).toBeInstanceOf(ConflictException);
            expect(result.getStatus()).toBe(409);
        });
    });
});
