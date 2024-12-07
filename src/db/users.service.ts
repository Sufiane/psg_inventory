import { PrismaService } from './prisma.service';
import { Injectable } from '@nestjs/common';
import { Users } from '@prisma/client';

@Injectable()
export class UsersService extends PrismaService {
    async create(payload: {
        email: string,
        firstName: string,
        lastName: string,
        password: string
    }): Promise<void> {
        await this.users.create({ data: payload });
    }

    async findOneByEmail(email: string): Promise<Users | null> {
        return this.users.findUnique({
            where: {
                email,
            },
        });
    }
}
