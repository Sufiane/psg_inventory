import { IsEmail } from 'class-validator';
import type { Email } from '@psg/shared/strings';

export class FlushUserCacheDto {
    @IsEmail()
    email!: Email;
}
