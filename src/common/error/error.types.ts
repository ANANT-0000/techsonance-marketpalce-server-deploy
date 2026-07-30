import { HttpStatus } from "@nestjs/common";

export enum InternalErrorCode {
  DATABASE_CONNECTION_FAILURE = "DATABASE_CONNECTION_FAILURE",
  UNIQUE_CONSTRAINT_VIOLATION = "UNIQUE_CONSTRAINT_VIOLATION",
  FOREIGN_KEY_VIOLATION = "FOREIGN_KEY_VIOLATION",
  RECORD_NOT_FOUND = "RECORD_NOT_FOUND",
  TRANSACTION_TIMEOUT = "TRANSACTION_TIMEOUT",
  PAYMENT_GATEWAY_FAILURE = "PAYMENT_GATEWAY_FAILURE",
  UNAUTHORIZED = "UNAUTHORIZED",
  FORBIDDEN = "FORBIDDEN",
  UNKNOWN_SYSTEM_ERROR = "UNKNOWN_SYSTEM_ERROR",
  PAYLOAD_TOO_LARGE = "PAYLOAD_TOO_LARGE",
}

export enum ClientActionCode {
  RETRY = "RETRY",
  CONTACT_SUPPORT = "CONTACT_SUPPORT",
  UPDATE_INPUT = "UPDATE_INPUT",
  NAVIGATE_HOME = "NAVIGATE_HOME",
}

export interface SanitizedErrorResponse {
  statusCode: HttpStatus;
  errorCode: string;
  message: string;
  action: ClientActionCode;
}

export interface ErrorMappingConfig {
  statusCode: HttpStatus;
  message: string;
  action: ClientActionCode;
}
