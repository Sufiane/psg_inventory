import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DEFAULT_PORT } from './shared/constants';

// NOTE: @nestjs/observe (0.1.3) exports an `ObserveInstrument` hook meant to
// be passed as NestFactory.create's `instrument` option for per-method span
// nesting. It is intentionally NOT wired in: passing it breaks
// `app.use(helmet())` outright (Express's router.use() throws "argument
// handler must be a function"), reproduced with and without real
// OBSERVE_APP_KEY/SECRET credentials — see PR discussion / plan notes.
// ObserveModule (registered below in app.module.ts) still works without it,
// so telemetry activates once credentials are set, just without the
// per-method nested spans that `instrument` would add.

async function bootstrap(): Promise<void> {
    const app = await NestFactory.create(AppModule, { bufferLogs: true });
    app.useLogger(app.get(Logger));
    app.use(helmet());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.enableShutdownHooks();

    const frontendOrigin = process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173';

    app.enableCors({
        origin: frontendOrigin.split(',').map((value) => value.trim()),
        credentials: true,
    });

    await app.listen(process.env.PORT ?? DEFAULT_PORT, '0.0.0.0');
}

bootstrap();
