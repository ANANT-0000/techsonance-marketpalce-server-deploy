export const AUDIENCE_VALIDATION_MESSAGES = {
  FIELD_INVALID:
    'field must be one of: total_orders, total_spent, registered_days_ago, last_order_days_ago, average_order_value',
  OPERATOR_INVALID: 'operator must be one of: gte, lte, eq',
  VALUE_NUMBER: 'value must be a number',
  VALUE_MIN: 'value must be greater than or equal to 0',
  NAME_STRING: 'name must be a string',
  NAME_MIN: 'name must be at least 3 characters',
  NAME_MAX: 'name must not exceed 100 characters',
  DESCRIPTION_STRING: 'description must be a string',
  DESCRIPTION_MAX: 'description must not exceed 500 characters',
  CRITERIA_ARRAY: 'criteria must be an array',
  CRITERIA_OPERATOR_INVALID: 'criteria_operator must be either AND or OR',
} as const;

export const AUDIENCE_MESSAGES = {
  SEGMENT_NOT_FOUND: 'Segment not found',
  SEGMENT_UPDATE_NOT_FOUND: 'Segment not found or no changes made',
  SEGMENT_CREATED: 'Segment created',
  SEGMENT_UPDATED: 'Segment updated',
  SEGMENT_DEACTIVATED: 'Segment deactivated',
  SEGMENT_CREATE_FAILED: 'Failed to create segment',
  SEGMENT_UPDATE_FAILED: 'Failed to update segment',
  SEGMENT_DEACTIVATE_FAILED: 'Failed to deactivate segment',
} as const;
