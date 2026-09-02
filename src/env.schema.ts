import { IsInt, IsOptional, IsPositive, IsString, validateSync } from 'class-validator';
import { plainToInstance, Type } from 'class-transformer';

class EnvironmentVariables {
    @IsString()
    JWT_SECRET!: string;

    @IsString()
    JWT_EXPIRES!: string;

    @IsString()
    FOOTBALL_DATA_API_KEY!: string;

    // /ask degrades gracefully without a key: the app boots and every other
    // route works, only POST /ask itself fails with ASK_LLM_UNAVAILABLE.
    @IsOptional()
    @IsString()
    GEMINI_API_KEY?: string;

    @IsString()
    REDIS_URL!: string;

    // seconds; refresh tokens live this long. Defaults to 7 days when unset.
    @IsOptional()
    @IsString()
    REFRESH_TOKEN_EXPIRES_SEC?: string;

    @IsOptional()
    @IsString()
    FRONTEND_ORIGIN?: string;

    // @nestjs/observe telemetry. Both unset -> instrumentation stays off
    // (local dev/CI don't need an observe.nestjs.com account to boot/test).
    @IsOptional()
    @IsString()
    OBSERVE_APP_KEY?: string;

    @IsOptional()
    @IsString()
    OBSERVE_APP_SECRET?: string;

    // Max /ask questions per user per hour. Defaults to 20 when unset.
    // Validated as a number, not left as a string parsed downstream: a
    // misconfigured value (empty, non-numeric, zero/negative) fails loudly
    // at boot instead of silently falling back — a bad value here should be
    // caught immediately, not linger unnoticed for however long.
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @IsPositive()
    ASK_RATE_LIMIT_PER_HOUR?: number;

    @IsOptional()
    @IsString()
    PORT?: string;
}

export function validate(env: Record<string, unknown>): EnvironmentVariables {
    const config = plainToInstance(EnvironmentVariables, env);

    const errors = validateSync(config, { skipMissingProperties: false });

    if (errors.length > 0) {
        throw new Error(`Problem with env variables. ${errors.toString()}`);
    }

    return config;
}
