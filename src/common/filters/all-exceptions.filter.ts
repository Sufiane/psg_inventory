import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from '@nestjs/common';
import type { Response } from 'express';

import { toHttpException } from '../exceptions/http-exception.mapper';

// Safety net for any throw that escapes a controller's try/catch. Domain
// exceptions get mapped to HTTP status codes via the shared mapper; built-in
// HttpExceptions are passed through unchanged.
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
    catch(exception: unknown, host: ArgumentsHost): void {
        const response = host.switchToHttp().getResponse<Response>();
        const httpException =
            exception instanceof HttpException ? exception : toHttpException(exception);

        response.status(httpException.getStatus()).json(httpException.getResponse());
    }
}
