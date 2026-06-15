import { IsString, MinLength } from 'class-validator';
import type { RefreshToken } from '@psg/shared/strings';

export class RefreshTokenDto {
    @IsString()
    @MinLength(1)
    refreshToken!: RefreshToken;
}
