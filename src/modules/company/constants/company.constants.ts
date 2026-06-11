import {
  CompanyOperationEnum,
  CompanyOperationResultEnum,
} from './company.enums';

export const COMPANY_CONTROLLER_MESSAGES = {
  HEALTH_CHECK: 'Company controller is working',
} as const;

export const COMPANY_MESSAGES = {
  PROFILE_FIND_FAILED: (domain: string) =>
    `Failed to find company profile for domain ${domain}`,
  PROFILE_NOT_FOUND: (domain: string) =>
    `Company profile with domain ${domain} not found`,
  COMPANIES_FIND_FAILED: 'Failed to find companies',
  COMPANIES_NOT_FOUND: 'Companies not found',
  COMPANY_ID_NOT_FOUND: (companyId: string) =>
    `Company with ID ${companyId} not found`,
  COMPANY_DOMAIN_FIND_FAILED: (domain: string) =>
    `Failed to find company with domain ${domain}`,
  COMPANY_DOMAIN_NOT_FOUND: (domain: string) =>
    `Company with domain ${domain} not found`,
  COMPANY_ACTION_FAILED: (action: CompanyOperationEnum, companyId: string) =>
    `Failed to ${action} company ${companyId}`,
  USER_COMPANY_RECORD_FIND_FAILED: (companyId: string) =>
    `Failed to find user and company record with company ID ${companyId}`,
  USER_COMPANY_RECORD_NOT_FOUND: (companyId: string) =>
    `User and company record with company ID ${companyId} not found`,
  VENDOR_ACTION_FAILED: (action: CompanyOperationEnum, companyId: string) =>
    `Failed to ${action} vendor with company ID ${companyId}`,
  COMPANY_ACTION_FAILED_GENERIC: (action: CompanyOperationEnum) =>
    `Failed to ${action} company`,
  COMPANY_ACTION_SUCCESS: (result: CompanyOperationResultEnum) =>
    `Company ${result} successfully`,
} as const;
