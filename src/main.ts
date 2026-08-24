import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DEFAULT_PORT } from './shared/constants';
import { ObserveInstrument } from './observe';

async function bootstrap(): Promise<void> {
    const app = await NestFactory.create(AppModule, {
        bufferLogs: true,
        ...(ObserveInstrument ? { instrument: ObserveInstrument } : {}),
    });
    app.useLogger(app.get(Logger));

    // Deliberately bypassed via the raw Express instance rather than
    // app.use(helmet()): with ObserveInstrument active, NestApplication's own
    // (wrapped) `.use()` makes Express's router.use() throw "argument
    // handler must be a function" — @nestjs/observe's instanceDecorator
    // wraps the DI-managed app/httpAdapter internals in a way that breaks
    // there. Going straight to the underlying Express app sidesteps that
    // wrapping entirely; the resulting middleware registration is identical.
    app.getHttpAdapter().getInstance().use(helmet());

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
