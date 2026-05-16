// src/modules/product-policies/interfaces/policy-document.interface.ts

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
  };
}
