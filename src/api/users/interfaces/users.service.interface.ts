import { CreateUserDto } from '../dto/create-user.dto';

export abstract class IUsersService {
    abstract create(payload: CreateUserDto): Promise<void>;
}
