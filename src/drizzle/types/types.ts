export enum UserRole {
  ADMIN = 'admin',
  VENDOR = 'vendor',
  CUSTOMER = 'customer',
}
export enum UserStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  SUSPENDED = 'suspended',
  PENDING = 'pending',
  REJECTED = 'rejected',
}
export enum SupportTicketStatus {
  OPEN = 'open',
  IN_PROGRESS = 'in_progress',
  RESOLVED = 'resolved',
  CLOSED = 'closed',
}
export enum SupportTicketPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  URGENT = 'urgent',
}
export enum ProductStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  DISCONTINUED = 'discontinued',
}
export enum OrderStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  SHIPPED = 'shipped',
  DELIVERED = 'delivered',
  CANCELLED = 'cancelled',
}
export enum PaymentStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  FAILED = 'failed',
  REFUNDED = 'refunded',
}
export enum ShippingStatus {
  PENDING = 'pending',
  SHIPPED = 'shipped',
  DELIVERED = 'delivered',
  RETURNED = 'returned',
  CANCELLED = 'cancelled',
}
export type KeyValuePair = {
  key: string;
  value: string | number | boolean | null;
};

export enum productImageType {
  MAIN = 'main',
  GALLERY = 'gallery',
  THUMBNAIL = 'thumbnail',
}
export enum VendorDocumentType {
  BusinessRegistration = 'business_registration',
  FinancialStatements = 'financial_statements',
  InsuranceCoverage = 'insurance_coverage',
  ComplianceCertifications = 'compliance_certifications',
  SecurityDocumentation = 'security_documentation',
  ContractAgreements = 'contract_agreements',
  VendorInformation = 'vendor_information',
  BusinessContinuityPlan = 'business_continuity_plan',
}
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
