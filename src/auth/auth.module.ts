import { DbModule } from '../db/db.module';
import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { IAuthService } from './interfaces/auth.service.interface';
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy } from './strategies/jwt.strategy';
import { LocalStrategy } from './strategies/local.strategy';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { RedisModule } from '../redis/redis.module';

@Module({
    imports: [
        DbModule,
        PassportModule,
        RedisModule,
        JwtModule.registerAsync({
            imports: [ConfigModule],
            inject: [ConfigService],
            useFactory: (
                configService: ConfigService<
                    { JWT_SECRET: string; JWT_EXPIRES: string },
                    true
                >,
            ) => ({
                secret: configService.get('JWT_SECRET'),
                signOptions: {
                    expiresIn: configService.get('JWT_EXPIRES'),
                },
            }),
        }),
    ],
    controllers: [AuthController],
    providers: [
        { provide: IAuthService, useClass: AuthService },
        LocalStrategy,
        JwtStrategy,
    ],
    exports: [IAuthService],
})
export class AuthModule {}
