export interface PolicyDocumentPayload {
  meta: {
    documentId: string;
    issueDate: Date;
    orderNumber: string;
  };
  customer: {
    name: string;
    email: string;
    phone?: string;
  };
  product: {
    name: string;
    sku?: string;
    quantity: number;
    price: string;
  };
  policy: {
    policyName: string;
    policyType: string;
    startDate: string | Date;
    endDate: string | Date | null;
    coverageDescription?: string;
    exclusions?: string;
    serviceProvider?: string;
    claimEmail?: string;
    claimPhone?: string;
    processDescription?: string;
  };
  branding: {
    companyName: string;
    logoUrl?: string;
    primaryColor?: string;
    secondaryColor?: string;
    accentColor?: string;
    fontFamily?: string;
  };
}

export interface PolicySnapshot {
  policy_name: string;
  policy_type: string;
  coverage_description?: string;
  exclusions?: string;
  service_provider?: string;
  claim_contact_email?: string;
  claim_contact_phone?: string;
  claim_process_description?: string;
  generates_document?: boolean;
  duration_value?: number;
  duration_unit?: string;
}
