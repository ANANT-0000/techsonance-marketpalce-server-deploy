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
    let resolved: string | string[];

    if (exception instanceof HttpException) {
      const res = exception.getResponse();
      if (typeof res === 'string') {
        resolved = res;
      } else {
        const obj = res as { message?: string | string[] };
        resolved = obj.message ?? exception.message;
      }
    } else if (process.env.NODE_ENV !== 'production' && exception instanceof Error) {
      resolved = exception.message;
    } else {
      resolved = 'Internal server error';
    }

    if (Array.isArray(resolved)) {
      return resolved.map((msg) => this.sanitizeMessage(msg));
    }
    return this.sanitizeMessage(resolved);
  }

  private sanitizeMessage(message: string): string {
    const sensitivePatterns = [
      /\bselect\b/i,
      /\binsert\b/i,
      /\bupdate\b/i,
      /\bdelete\b/i,
      /\bfrom\b/i,
      /\bwhere\b/i,
      /\btruncate\b/i,
      /\bdrop\b/i,
      /\bcreate\s+table\b/i,
      /\balter\s+table\b/i,
      /relation\s+"[^"]+"/i,
      /column\s+"[^"]+"/i,
      /table\s+"[^"]+"/i,
      /violates\s+unique\s+constraint/i,
      /violates\s+foreign\s+key\s+constraint/i,
      /syntax\s+error\s+at\s+or\s+near/i,
      /query\s+failed/i,
      /drizzle/i,
    ];

    const isSensitive = sensitivePatterns.some((pattern) => pattern.test(message));
    if (isSensitive) {
      return 'An internal database error occurred.';
    }
    return message;
  }
}
