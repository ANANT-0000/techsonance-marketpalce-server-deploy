export enum ProductReviewErrorKeyEnum {
  DATABASE_QUERY_FAILED_WHILE_CREATING_PRODUCT_REVIEW = 'Database query failed while creating product review',
  DATABASE_QUERY_FAILED_WHILE_CHECKING_FOR_EXISTING_REVIEW = 'Database query failed while checking for existing review',
  ERROR_CHECKING_FOR_EXISTING_REVIEW = 'Error checking for existing review',
  REVIEW_NOT_FOUND = 'Review not found',
  YOU_CAN_ONLY_UPDATE_YOUR_OWN_REVIEWS_OR_THE_REVIEW_DOES_NOT_EXIST = 'You can only update your own reviews, or the review does not exist.',
  YOU_CAN_ONLY_DELETE_YOUR_OWN_REVIEWS = 'You can only delete your own reviews.',
}
