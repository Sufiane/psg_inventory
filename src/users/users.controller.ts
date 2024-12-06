import { Body, Controller, Post } from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { Public } from '../shared/decorators/public.decorator';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {

  constructor(private readonly usersService: UsersService) {
  }

  @Public()
  @Post('/')
  async createUser(@Body() payload: CreateUserDto) {
    await this.usersService.create(payload);
  }
}
