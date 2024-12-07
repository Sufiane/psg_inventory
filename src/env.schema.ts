import { IsString, validateSync } from 'class-validator';
import { plainToInstance } from 'class-transformer';

class EnvironmentVariables {
    @IsString()
    JWT_SECRET: string;

    @IsString()
    JWT_EXPIRES: string;
}

export function validate(env: Record<string, unknown>): EnvironmentVariables {
    const config = plainToInstance(EnvironmentVariables, env);

    const errors = validateSync(config, { skipMissingProperties: false });

    if (errors.length > 0) {
        throw new Error(`Problem with env variables. ${errors.toString()}`);
    }

    return config;
}
