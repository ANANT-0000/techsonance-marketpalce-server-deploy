import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class GoogleOAuthGuard extends AuthGuard('google') {
  // This method fires right before the user is sent to Google
  getAuthenticateOptions(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    // Grab the domain from the query and inject it into the OAuth state!
    return {
      state: req.query.domain || process.env.FRONTEND_URL || 'http://localhost:3000',
    };
  }
}