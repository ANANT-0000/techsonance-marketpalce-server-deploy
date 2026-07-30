import { HttpStatus } from "@nestjs/common";
import { InternalErrorCode, ClientActionCode, ErrorMappingConfig } from './error.types.js';

export const ERROR_MAPPING: Record<InternalErrorCode, ErrorMappingConfig> = {
  [InternalErrorCode.DATABASE_CONNECTION_FAILURE]: {
    statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
    message: "We are currently experiencing a brief disruption in our services. Please try again in a few moments.",
    action: ClientActionCode.RETRY,
  },
  [InternalErrorCode.UNIQUE_CONSTRAINT_VIOLATION]: {
    statusCode: HttpStatus.CONFLICT,
    message: "This information has already been registered. Please check your entries and try again.",
    action: ClientActionCode.UPDATE_INPUT,
  },
  [InternalErrorCode.FOREIGN_KEY_VIOLATION]: {
    statusCode: HttpStatus.BAD_REQUEST,
    message: "The requested item reference is invalid or no longer available. Please select a different item.",
    action: ClientActionCode.UPDATE_INPUT,
  },
  [InternalErrorCode.RECORD_NOT_FOUND]: {
    statusCode: HttpStatus.NOT_FOUND,
    message: "We could not find the requested information. It may have been relocated or removed.",
    action: ClientActionCode.NAVIGATE_HOME,
  },
  [InternalErrorCode.TRANSACTION_TIMEOUT]: {
    statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
    message: "Your request took longer than expected to complete. Please try submitting again.",
    action: ClientActionCode.RETRY,
  },
  [InternalErrorCode.PAYMENT_GATEWAY_FAILURE]: {
    statusCode: HttpStatus.BAD_GATEWAY,
    message: "We are temporarily unable to process checkout via the payment gateway. Please try again or choose a different payment method.",
    action: ClientActionCode.RETRY,
  },
  [InternalErrorCode.UNKNOWN_SYSTEM_ERROR]: {
    statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
    message: "An unexpected event has occurred on our end. Our technical team has been notified. Please contact support if the issue persists.",
    action: ClientActionCode.CONTACT_SUPPORT,
  },
  [InternalErrorCode.UNAUTHORIZED]: {
    statusCode: HttpStatus.UNAUTHORIZED,
    message: "You must be logged in to perform this action.",
    action: ClientActionCode.UPDATE_INPUT,
  },
  [InternalErrorCode.FORBIDDEN]: {
    statusCode: HttpStatus.FORBIDDEN,
    message: "You do not have permission to perform this action.",
    action: ClientActionCode.UPDATE_INPUT,
  },
  [InternalErrorCode.PAYLOAD_TOO_LARGE]: {
    statusCode: HttpStatus.PAYLOAD_TOO_LARGE,
    message: "The uploaded files or data exceed the maximum allowed size of 50MB. Please reduce the size and try again.",
    action: ClientActionCode.UPDATE_INPUT,
  },
};
