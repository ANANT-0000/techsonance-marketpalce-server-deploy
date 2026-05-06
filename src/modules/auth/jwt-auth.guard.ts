import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

export const JWT_GUARD = 'jwt';

@Injectable()
export class JwtAuthGuard extends AuthGuard(JWT_GUARD) {
    async canActivate(context: ExecutionContext): Promise<boolean> {
        const result = await super.canActivate(context) as boolean;

        const request = context.switchToHttp().getRequest();
        console.log("user in JwtAuthGuard", request.user);
        return result;
    }
}