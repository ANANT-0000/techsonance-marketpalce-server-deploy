import { HttpException } from "@nestjs/common";
import { SanitizedErrorResponse, InternalErrorCode } from './error.types.js';
import { ERROR_MAPPING } from './error.constants.js';

export class SecureErrorHandler {
  /**
   * Safe entry point to ingest any raw server exception or database error payload and
   * return a sanitized, client-safe error response.
   *
   * @param rawError The raw error caught in the application/middleware.
   */
  public static handle(rawError: any): SanitizedErrorResponse {
    // 1. Determine Internal Code based on raw payload markers
    const internalCode = this.classifyError(rawError);

    // 2. Fetch the corresponding safe configuration mapping
    const mapping = ERROR_MAPPING[internalCode] || ERROR_MAPPING[InternalErrorCode.UNKNOWN_SYSTEM_ERROR];

    // If it's already an instance of HttpException, we can preserve its HTTP status if it's not a server crash
    let statusCode = mapping.statusCode;
    if (rawError instanceof HttpException) {
      statusCode = rawError.getStatus();
    }

    // 3. Construct and return the safe response payload
    let message = mapping.message;
    
    // Only trust and override messages for client-side errors (4xx).
    // Server-side errors (5xx) must NEVER leak raw exception messages.
    if (statusCode < 500 && rawError instanceof HttpException) {
      const responseObj = rawError.getResponse();
      if (typeof responseObj === "string") {
        message = responseObj;
      } else if (responseObj && typeof responseObj === "object") {
        const obj = responseObj as { message?: string | string[] };
        if (obj.message) {
          message = Array.isArray(obj.message) ? obj.message[0] : obj.message;
        }
      }
    }

    return {
      statusCode,
      errorCode: internalCode,
      message,
      action: mapping.action,
    };
  }

  /**
   * Helper to analyze raw payloads safely without exposing structural details.
   */
  private static classifyError(rawError: any): InternalErrorCode {
    if (!rawError) {
      return InternalErrorCode.UNKNOWN_SYSTEM_ERROR;
    }

    // Preserve classification of NestJS built-in HTTP exceptions (like NotFoundException, BadRequestException)
    if (rawError instanceof HttpException) {
      const status = rawError.getStatus();
      if (status === 404) {
        return InternalErrorCode.RECORD_NOT_FOUND;
      }
      if (status === 400) {
        return InternalErrorCode.FOREIGN_KEY_VIOLATION; // Default to update input / validation action
      }
      if (status === 401) {
        return InternalErrorCode.UNAUTHORIZED;
      }
      if (status === 403) {
        return InternalErrorCode.FORBIDDEN;
      }
    }

    const messageString = String(rawError.message || "").toLowerCase();
    const codeString = String(rawError.code || "");

    // Payment Gateway / Razorpay Failures
    if (
      messageString.includes("payment gateway") ||
      messageString.includes("razorpay") ||
      messageString.includes("gateway credentials")
    ) {
      return InternalErrorCode.PAYMENT_GATEWAY_FAILURE;
    }

    // Connection failures
    if (
      codeString === "ECONNREFUSED" ||
      messageString.includes("connection failed") ||
      messageString.includes("cannot connect")
    ) {
      return InternalErrorCode.DATABASE_CONNECTION_FAILURE;
    }

    // Unique Constraint
    if (
      codeString === "23505" ||
      messageString.includes("unique constraint") ||
      messageString.includes("already exists")
    ) {
      return InternalErrorCode.UNIQUE_CONSTRAINT_VIOLATION;
    }

    // Foreign Key Constraint
    if (
      codeString === "23503" ||
      messageString.includes("foreign key constraint") ||
      messageString.includes("violates key")
    ) {
      return InternalErrorCode.FOREIGN_KEY_VIOLATION;
    }

    // Record Not Found
    if (
      codeString === "P2025" ||
      messageString.includes("not found") ||
      messageString.includes("no record found")
    ) {
      return InternalErrorCode.RECORD_NOT_FOUND;
    }

    // Timeout
    if (messageString.includes("timeout") || messageString.includes("deadline")) {
      return InternalErrorCode.TRANSACTION_TIMEOUT;
    }

    return InternalErrorCode.UNKNOWN_SYSTEM_ERROR;
  }
}
