import { Injectable } from '@nestjs/common';
import { UsersService as UserDbService } from '../db/users.service';
import { omit } from 'radash';
import { CreateUserDto } from './dto/create-user.dto';
import { hashPassword } from './users.utils';

@Injectable()
export class UsersService {
  constructor(private readonly userDbService: UserDbService) {
  }

  async create(payload: CreateUserDto): Promise<void> {
    const createPayload = omit(payload, ['password']);
    const hashedPassword = await hashPassword(payload.password);

    await this.userDbService.create({ ...createPayload, password: hashedPassword });
  }
}
