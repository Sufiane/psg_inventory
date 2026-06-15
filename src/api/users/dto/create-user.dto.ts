import { IsEmail, IsString, MinLength } from 'class-validator';
import type { Email } from '@psg/shared/strings';

export class CreateUserDto {
    @IsEmail()
    email!: Email;

    @IsString()
    @MinLength(1)
    firstName!: string;

    @IsString()
    @MinLength(1)
    lastName!: string;

    @IsString()
    @MinLength(7)
    password!: string;
}
