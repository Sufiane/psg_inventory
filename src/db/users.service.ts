import { PrismaService } from './prisma.service';
import { Injectable } from '@nestjs/common';

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
}
