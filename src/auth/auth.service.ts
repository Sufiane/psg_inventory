import { Injectable } from '@nestjs/common';
import { UsersService } from '../db/users.service';
import { omit } from 'radash';
import { JwtService } from '@nestjs/jwt';
import { Users } from '@prisma/client';
import bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
    constructor(private readonly usersDbService: UsersService, private readonly jwtService: JwtService) {
    }

    async hashPassword(passwordToHash: string): Promise<string> {
        const salt = await bcrypt.genSalt(10);

        return bcrypt.hash(passwordToHash, salt);
    }


    async validateUser(email: string, password: string): Promise<Omit<Users, 'password'> | null> {
        const user = await this.usersDbService.findOneByEmail(email);

        if (!user || !(await bcrypt.compare(password, user.password))) {
            return null;
        }

        return omit(user, ['password']);
    }

    async login(user: Omit<Users, 'password'>) {
        const payload = { email: user.email, sub: user.id };

        return {
            token: this.jwtService.sign(payload),
        };
    }
}
