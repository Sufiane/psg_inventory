import { IsOptional, IsString, validateSync } from 'class-validator';
import { plainToInstance } from 'class-transformer';

class EnvironmentVariables {
    @IsString()
    JWT_SECRET!: string;

    @IsString()
    JWT_EXPIRES!: string;

    @IsString()
    FOOTBALL_DATA_API_KEY!: string;

    @IsString()
    REDIS_URL!: string;

    // seconds; refresh tokens live this long. Defaults to 7 days when unset.
    @IsOptional()
    @IsString()
    REFRESH_TOKEN_EXPIRES_SEC?: string;

    @IsOptional()
    @IsString()
    FRONTEND_ORIGIN?: string;

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
