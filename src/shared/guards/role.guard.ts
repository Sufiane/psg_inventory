import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Roles } from '@prisma/client';

@Injectable()
export class RolesGuard implements CanActivate {
    constructor() {}

    canActivate(context: ExecutionContext): boolean {
        const request = context.switchToHttp().getRequest();

        const user = request.user;

        return user.role === Roles.ADMIN;
    }
}
