import { ErrorCode } from './error-codes.enum';

export class DomainException extends Error {
    constructor(public readonly code: ErrorCode) {
        super(code);
        this.name = 'DomainException';
    }
}
