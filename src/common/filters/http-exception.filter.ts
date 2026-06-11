import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest();

    const statusCode =
      exception instanceof HttpException ? exception.getStatus() : 500;

    const message = this.resolveMessage(exception);

    // Log non-HTTP errors with full stack — these are unexpected crashes
    if (!(exception instanceof HttpException)) {
      this.logger.error(
        `Unhandled exception on ${request.method} ${request.url}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(statusCode).json({
      success: false,
      status: statusCode,
      message,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }

  private resolveMessage(exception: unknown): string | string[] {
    if (exception instanceof HttpException) {
      const res = exception.getResponse();
      if (typeof res === 'string') return res;
      const obj = res as { message?: string | string[] };
      return obj.message ?? exception.message;
    }
    // Never leak internal error details to clients in production
    if (process.env.NODE_ENV !== 'production' && exception instanceof Error) {
      return exception.message;
    }
    return 'Internal server error';
  }
}
