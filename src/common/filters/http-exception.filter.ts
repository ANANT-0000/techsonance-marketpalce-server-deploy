import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
} from '@nestjs/common';
import { Response } from 'express';
interface ExceptionResponseObject {
  message?: string | string[];
  error?: string;
}
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const statusCode =
      exception instanceof HttpException ? exception.getStatus() : 500;
    const message = this.resolveMessage(exception);
    response.status(statusCode).json({
      success: false,
      status: statusCode,
      message: message,
      error: exception.message,
      timestamp: new Date().toISOString(),
    });
  }
  private resolveMessage(exception: unknown): string | string[] {
    if (!(exception instanceof HttpException)) {
      return 'Internal server error';
    }

    const exceptionResponse = exception.getResponse();

    if (typeof exceptionResponse === 'string') {
      return exceptionResponse;
    }

    // Now safely typed as object
    const res = exceptionResponse as ExceptionResponseObject;
    return res.message ?? exception.message ?? 'An error occurred';
  }
}
