export enum CouponErrorKeyEnum {
  CUSTOMER_SEGMENT_RULE_REQUIRES_SEGMENT_ID = 'customer_segment rule requires segment_id',
  PRODUCT_IN_CART_RULE_REQUIRES_PRODUCT_ID = 'product_in_cart rule requires product_id',
  DATE_RANGE_RULE_REQUIRES_DAYS_OF_WEEK_NUMBER_0_6 = 'date_range rule requires days_of_week: number[] (0–6)',
  UNKNOWN_RULE_TYPE = 'Unknown rule_type',
  FAILED_TO_VALIDATE_USER = 'Failed to validate user',
  USER_NOT_FOUND = 'User not found.',
  FAILED_TO_VALIDATE_COUPON_CODE_UNIQUENESS = 'Failed to validate coupon code uniqueness',
  COUPON_CODE_DTO_CODE_ALREADY_EXISTS = 'Coupon code ${dto.code} already exists.',
}
