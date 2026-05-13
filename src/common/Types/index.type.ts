export interface ProductFiles {
  product?: Express.Multer.File[];
  product_spec?: Express.Multer.File[];
}
export enum AddressType {
  BUSINESS = 'business',
  WAREHOUSE = 'warehouse',
  WORK = 'work',
  HOME = 'home',
  OTHER = 'other',
}