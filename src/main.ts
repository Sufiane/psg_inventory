import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DEFAULT_PORT } from './shared/constants';

async function bootstrap(): Promise<void> {
    const app = await NestFactory.create(AppModule);
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

    const frontendOrigin = process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173';

    app.enableCors({
        origin: frontendOrigin.split(',').map((value) => value.trim()),
        credentials: true,
    });

    await app.listen(process.env.PORT ?? DEFAULT_PORT, '0.0.0.0');
}

bootstrap();
