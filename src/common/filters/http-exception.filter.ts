import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { SecureErrorHandler } from '../error/error.handler';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest();

    // Log unexpected crashes (non-HTTP errors) with their full stack traces locally
    if (!(exception instanceof HttpException)) {
      this.logger.error(
        `Unhandled exception on ${request.method} ${request.url}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    // Process and sanitize the raw exception
    const sanitized = SecureErrorHandler.handle(exception);

    // Return the sanitized structure to the client securely
    response.status(sanitized.statusCode).json({
      success: false,
      statusCode: sanitized.statusCode,
      errorCode: sanitized.errorCode,
      message: sanitized.message,
      action: sanitized.action,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
