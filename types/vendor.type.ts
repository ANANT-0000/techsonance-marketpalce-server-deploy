export interface VendorObject {
  business_name: string;
  business_number: string;
  business_owner_full_name: string;
  category: string;
  country_code: string;
  phone_number: string;
  vendor_admin_email: string;
  vendor_admin_full_name: string;
  password: string;
  hashed_password?: string | undefined;
}