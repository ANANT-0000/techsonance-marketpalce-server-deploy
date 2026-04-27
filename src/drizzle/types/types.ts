import { Role } from 'src/enums/role.enum';

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
  DRAFT = 'draft',
}
export enum OrderStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  SHIPPED = 'shipped',
  DELIVERED = 'delivered',
  CANCELLED = 'cancelled',
  RETURNED = 'returned',
  REFUNDED = 'refunded',
  REPLACED = 'replaced',
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
export enum ReturnType {
  RETURN = "return",
  REFUND = "refund",
  REPLACEMENT = "replacement"
}
export enum ReturnStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  IN_TRANSIT = 'in_transit',
  DELIVERED = 'delivered',
  QC_PASSED = 'qc_passed',
  QC_FAILED = 'qc_failed',
  COMPLETED = 'completed'
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
export enum CancelledByEnum {
  USER = 'customer',
  VENDOR = 'vendor',
  SYSTEM = 'system',
}
export enum refundStatusEnum {
  PENDING = 'pending',
  PROCESSED = 'processed',
  REJECTED = 'rejected',
}
export interface VendorType {
  user_role: Role;
  store_name: string;
  phone_number: string;
  store_owner_first_name: string;
  store_owner_last_name: string;
  company_structure: string;
  company_domain: string;
  store_description?: string;
  category: string;
  email: string;
  first_name: string;
  last_name: string;
  hash_password: string;
  country_code: string;
}
