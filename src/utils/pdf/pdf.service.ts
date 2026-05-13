// import { Injectable } from '@nestjs/common';
// import PDFDocument from 'pdfkit';

// // ================================================================
// // DATA CONTRACTS
// // Typed inputs derived from the DB schema:
// //   company_branding, company_legal_profile, company_compliance,
// //   company_document_config  (identity.schema.ts)
// // ================================================================

// export interface BrandingData {
//   logoUrl?: string; // company_branding.logo_url
//   logoBuffer?: Buffer; // pre-fetched logo bytes (preferred)
//   watermarkUrl?: string; // company_branding.watermark_url
//   primaryColor?: string; // company_branding.primary_color   e.g. "#1A73E8"
//   secondaryColor?: string; // company_branding.secondary_color
//   accentColor?: string; // company_branding.accent_color
//   fontFamily?: string; // company_branding.font_family  (must be registered in PDFKit)
// }

// export interface LegalProfileData {
//   legalName: string; // company_legal_profile.legal_name
//   tradeName?: string; // company_legal_profile.trade_name
//   countryCode: string; // company_legal_profile.country_code  e.g. "IN"
//   supportEmail?: string; // company_legal_profile.support_email
//   supportPhone?: string; // company_legal_profile.support_phone
//   websiteUrl?: string; // company_legal_profile.website_url
//   registeredAddress?: AddressData; // joined from address table
// }

// export interface ComplianceField {
//   fieldKey: string; // company_compliance.field_key   e.g. "gst_number"
//   fieldValue: string; // company_compliance.field_value
// }

// export interface DocumentConfigData {
//   invoiceNumberPrefix?: string; // company_document_config.invoice_number_prefix
//   invoiceNumberFormat?: string; // company_document_config.invoice_number_format
//   signatoryName?: string; // company_document_config.signatory_name
//   signatoryDesignation?: string; // company_document_config.signatory_designation
//   signatorySignatureBuffer?: Buffer; // pre-fetched from signatory_signature_url
//   invoiceFooterText?: string; // company_document_config.invoice_footer_text
//   invoiceTermsAndConditions?: string; // company_document_config.invoice_terms_and_conditions
//   defaultCurrency?: string; // company_document_config.default_currency  e.g. "INR"
//   dateFormat?: string; // company_document_config.date_format  e.g. "DD/MM/YYYY"
// }

// export interface AddressData {
//   addressLine1: string;
//   addressLine2?: string;
//   city: string;
//   state: string;
//   pincode: string;
//   countryCode?: string;
// }

// export interface VendorData {
//   companyName: string;
//   gstNumber?: string;
//   mobileNumber?: string;
//   email?: string;
// }

// export interface WarehouseData {
//   addressLine1: string;
//   city: string;
//   state: string;
//   pincode: string;
// }

// export interface OrderData {
//   id: string;
//   customerName: string;
//   customerPhone?: string;
//   placeOfSupply?: string; // e.g. "09-UTTARPRADESH"
//   shippingAddress: AddressData;
//   billingAddress?: AddressData; // falls back to shippingAddress
//   invoiceDate?: Date;
//   dueDate?: Date;
// }

// export interface InvoiceItem {
//   productName: string;
//   hsnCode?: string;
//   description?: string; // variant / color / storage etc.
//   sku?: string;
//   price: number; // unit price (excl. tax)
//   quantity: number;
//   taxRate?: number; // e.g. 18 (for 18%)
//   taxAmount?: number; // pre-computed, or derived from price * qty * taxRate/100
// }

// export interface BankDetails {
//   bankName: string;
//   accountNumber: string;
//   ifscCode: string;
//   branchName: string;
//   upiId?: string;
//   qrCodeBuffer?: Buffer; // pre-rendered UPI QR PNG
// }

// /** Master payload passed to generateInvoice() */
// export interface InvoicePayload {
//   invoiceNumber: string;
//   templateName: InvoiceTemplateName;

//   // Company identity (from identity.schema.ts)
//   branding: BrandingData;
//   legalProfile: LegalProfileData;
//   compliance: ComplianceField[]; // all active compliance rows for this company+country
//   documentConfig: DocumentConfigData;

//   // Transaction data
//   order: OrderData;
//   vendor: VendorData;
//   warehouse: WarehouseData;
//   items: InvoiceItem[];
//   bankDetails?: BankDetails;

//   // Optional overrides
//   notes?: string;
// }

// // ================================================================
// // TEMPLATE REGISTRY
// // Add new template names here and implement a renderer below.
// // ================================================================
// export type InvoiceTemplateName =
//   | 'standard-gst' // Indian GST invoice (like the Amazon sample)
//   | 'minimal' // Clean, brand-colour-free minimal
//   | 'branded' // Full brand colours, logo watermark
//   | 'export' // For international orders (no GST block)
//   | 'proforma'; // Proforma / quote variant

// // ================================================================
// // HELPERS
// // ================================================================

// const DEFAULT_PRIMARY = '#2563EB';
// const PAGE_WIDTH = 595.28; // A4 pts
// const MARGIN = 50;
// const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

// function formatDate(date?: Date, fmt = 'DD/MM/YYYY'): string {
//   const d = date ?? new Date();
//   const dd = String(d.getDate()).padStart(2, '0');
//   const mm = String(d.getMonth() + 1).padStart(2, '0');
//   const yyyy = d.getFullYear();
//   return fmt.replace('DD', dd).replace('MM', mm).replace('YYYY', yyyy);
// }

// function formatCurrency(amount: number, currency = 'INR'): string {
//   const symbol =
//     currency === 'INR' ? '₹' : currency === 'USD' ? '$' : currency + ' ';
//   return `${symbol}${amount.toFixed(2)}`;
// }

// function numberToWords(num: number): string {
//   // Simplified — replace with a proper library (e.g. `number-to-words`) in production
//   const ones = [
//     '',
//     'One',
//     'Two',
//     'Three',
//     'Four',
//     'Five',
//     'Six',
//     'Seven',
//     'Eight',
//     'Nine',
//     'Ten',
//     'Eleven',
//     'Twelve',
//     'Thirteen',
//     'Fourteen',
//     'Fifteen',
//     'Sixteen',
//     'Seventeen',
//     'Eighteen',
//     'Nineteen',
//   ];
//   const tens = [
//     '',
//     '',
//     'Twenty',
//     'Thirty',
//     'Forty',
//     'Fifty',
//     'Sixty',
//     'Seventy',
//     'Eighty',
//     'Ninety',
//   ];
//   if (num === 0) return 'Zero';
//   const convert = (n: number): string => {
//     if (n < 20) return ones[n];
//     if (n < 100)
//       return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
//     if (n < 1000)
//       return (
//         ones[Math.floor(n / 100)] +
//         ' Hundred' +
//         (n % 100 ? ' ' + convert(n % 100) : '')
//       );
//     if (n < 100000)
//       return (
//         convert(Math.floor(n / 1000)) +
//         ' Thousand' +
//         (n % 1000 ? ' ' + convert(n % 1000) : '')
//       );
//     if (n < 10000000)
//       return (
//         convert(Math.floor(n / 100000)) +
//         ' Lakh' +
//         (n % 100000 ? ' ' + convert(n % 100000) : '')
//       );
//     return (
//       convert(Math.floor(n / 10000000)) +
//       ' Crore' +
//       (n % 10000000 ? ' ' + convert(n % 10000000) : '')
//     );
//   };
//   const [intPart, decPart] = num.toFixed(2).split('.');
//   const words = convert(parseInt(intPart));
//   const paise = parseInt(decPart);
//   return `${words}${paise ? ' And ' + convert(paise) + ' Paise' : ''} Only`;
// }

// // ================================================================
// // SERVICE
// // ================================================================

// @Injectable()
// export class PdfService {
//   // ── Public entry point ──────────────────────────────────────────
//   async generateInvoice(payload: InvoicePayload): Promise<Buffer> {
//     const renderer = this.resolveTemplate(payload.templateName);
//     return renderer(payload);
//   }

//   // ── Template resolver ───────────────────────────────────────────
//   private resolveTemplate(
//     name: InvoiceTemplateName,
//   ): (p: InvoicePayload) => Promise<Buffer> {
//     const map: Record<
//       InvoiceTemplateName,
//       (p: InvoicePayload) => Promise<Buffer>
//     > = {
//       'standard-gst': (p) => this.renderStandardGst(p),
//       minimal: (p) => this.renderMinimal(p),
//       branded: (p) => this.renderBranded(p),
//       export: (p) => this.renderExport(p),
//       proforma: (p) => this.renderProforma(p),
//     };
//     const fn = map[name];
//     if (!fn) throw new Error(`Unknown invoice template: "${name}"`);
//     return fn;
//   }

//   // ================================================================
//   // TEMPLATE: standard-gst
//   // Indian GST tax invoice — matches the Amazon sample in the design
//   // ================================================================
//   private renderStandardGst(payload: InvoicePayload): Promise<Buffer> {
//     return this.buildPdf(payload, (doc, p) => {
//       // ── Compute totals ──
//       const { totals } = this.computeTotals(
//         p.items,
//         p.documentConfig.defaultCurrency,
//       );

//       // ── Sections ──
//       this.sectionHeader(doc, p);
//       this.sectionSoldByAndBillTo(doc, p);
//       this.sectionInvoiceMeta(doc, p);
//       this.sectionPlaceOfSupply(doc, p);
//       this.sectionItemsTableGst(doc, p, totals);
//       this.sectionTotalsGst(doc, totals, p.documentConfig.defaultCurrency);
//       this.sectionAmountInWords(
//         doc,
//         totals.grandTotal,
//         p.documentConfig.defaultCurrency,
//       );
//       if (p.bankDetails) this.sectionBankAndSignature(doc, p);
//       if (p.notes) this.sectionNotes(doc, p.notes);
//       this.sectionTermsAndConditions(
//         doc,
//         p.documentConfig.invoiceTermsAndConditions,
//       );
//       this.sectionFooter(doc, p);
//     });
//   }

//   // ================================================================
//   // TEMPLATE: minimal
//   // No colours, clean layout — good for B2B plain invoices
//   // ================================================================
//   private renderMinimal(payload: InvoicePayload): Promise<Buffer> {
//     return this.buildPdf(payload, (doc, p) => {
//       const { totals } = this.computeTotals(
//         p.items,
//         p.documentConfig.defaultCurrency,
//       );
//       this.sectionHeader(doc, p, { skipLogo: true });
//       this.sectionSoldByAndBillTo(doc, p);
//       this.sectionInvoiceMeta(doc, p);
//       this.sectionItemsTableSimple(doc, p, totals);
//       this.sectionTotalsSimple(doc, totals, p.documentConfig.defaultCurrency);
//       this.sectionFooter(doc, p, { minimal: true });
//     });
//   }

//   // ================================================================
//   // TEMPLATE: branded
//   // Full brand colours, watermark, signatory block
//   // ================================================================
//   private renderBranded(payload: InvoicePayload): Promise<Buffer> {
//     return this.buildPdf(payload, (doc, p) => {
//       const { totals } = this.computeTotals(
//         p.items,
//         p.documentConfig.defaultCurrency,
//       );
//       if (p.branding.watermarkUrl && p.branding.logoBuffer) {
//         this.applyWatermark(doc, p.branding.logoBuffer);
//       }
//       this.sectionBrandedHeader(doc, p);
//       this.sectionSoldByAndBillTo(doc, p);
//       this.sectionInvoiceMeta(doc, p);
//       this.sectionPlaceOfSupply(doc, p);
//       this.sectionItemsTableGst(doc, p, totals);
//       this.sectionTotalsGst(doc, totals, p.documentConfig.defaultCurrency);
//       this.sectionAmountInWords(
//         doc,
//         totals.grandTotal,
//         p.documentConfig.defaultCurrency,
//       );
//       if (p.bankDetails) this.sectionBankAndSignature(doc, p);
//       if (p.notes) this.sectionNotes(doc, p.notes);
//       this.sectionTermsAndConditions(
//         doc,
//         p.documentConfig.invoiceTermsAndConditions,
//       );
//       this.sectionFooter(doc, p);
//     });
//   }

//   // ================================================================
//   // TEMPLATE: export  (international — no GST breakdown)
//   // ================================================================
//   private renderExport(payload: InvoicePayload): Promise<Buffer> {
//     return this.buildPdf(payload, (doc, p) => {
//       const { totals } = this.computeTotals(
//         p.items,
//         p.documentConfig.defaultCurrency,
//       );
//       this.sectionHeader(doc, p);
//       this.sectionSoldByAndBillTo(doc, p);
//       this.sectionInvoiceMeta(doc, p);
//       this.sectionItemsTableSimple(doc, p, totals);
//       this.sectionTotalsSimple(doc, totals, p.documentConfig.defaultCurrency);
//       this.sectionFooter(doc, p, { label: 'EXPORT INVOICE' });
//     });
//   }

//   // ================================================================
//   // TEMPLATE: proforma
//   // ================================================================
//   private renderProforma(payload: InvoicePayload): Promise<Buffer> {
//     return this.buildPdf(payload, (doc, p) => {
//       const { totals } = this.computeTotals(
//         p.items,
//         p.documentConfig.defaultCurrency,
//       );
//       this.sectionHeader(doc, p, { label: 'PROFORMA INVOICE' });
//       this.sectionSoldByAndBillTo(doc, p);
//       this.sectionInvoiceMeta(doc, p);
//       this.sectionItemsTableGst(doc, p, totals);
//       this.sectionTotalsGst(doc, totals, p.documentConfig.defaultCurrency);
//       this.sectionAmountInWords(
//         doc,
//         totals.grandTotal,
//         p.documentConfig.defaultCurrency,
//       );
//       this.sectionFooter(doc, p, { label: 'PROFORMA — NOT A TAX INVOICE' });
//     });
//   }

//   // ================================================================
//   // SHARED PDF BUILDER
//   // ================================================================
//   private buildPdf(
//     payload: InvoicePayload,
//     render: (
//       doc: InstanceType<typeof PDFDocument>,
//       payload: InvoicePayload,
//     ) => void,
//   ): Promise<Buffer> {
//     return new Promise((resolve, reject) => {
//       const doc = new PDFDocument({ margin: MARGIN, size: 'A4' });
//       const buffers: Buffer[] = [];

//       doc.on('data', buffers.push.bind(buffers));
//       doc.on('end', () => resolve(Buffer.concat(buffers)));
//       doc.on('error', reject);

//       render(doc, payload);

//       doc.end();
//     });
//   }

//   // ================================================================
//   // SECTION RENDERERS
//   // ================================================================

//   /** Standard header: "TAX INVOICE" label, logo, "ORIGINAL FOR RECIPIENT" */
//   private sectionHeader(
//     doc: InstanceType<typeof PDFDocument>,
//     p: InvoicePayload,
//     opts: { label?: string; skipLogo?: boolean } = {},
//   ) {
//     const label = opts.label ?? 'TAX INVOICE';
//     const primary = p.branding.primaryColor ?? DEFAULT_PRIMARY;

//     // Left — label
//     doc
//       .fillColor(primary)
//       .fontSize(13)
//       .font('Helvetica-Bold')
//       .text(label, MARGIN, 45);

//     // Right — "ORIGINAL FOR RECIPIENT"
//     doc
//       .fillColor('#444444')
//       .fontSize(8)
//       .font('Helvetica')
//       .text('ORIGINAL FOR RECIPIENT', MARGIN, 45, {
//         align: 'right',
//         width: CONTENT_WIDTH,
//       });

//     // Logo (right side, vertically centred in header band)
//     if (!opts.skipLogo && p.branding.logoBuffer) {
//       try {
//         doc.image(p.branding.logoBuffer, PAGE_WIDTH - MARGIN - 120, 50, {
//           fit: [120, 50],
//         });
//       } catch (_) {
//         /* logo failed — skip silently */
//       }
//     }

//     // Company legal / trade name
//     doc
//       .fillColor('#111111')
//       .fontSize(16)
//       .font('Helvetica-Bold')
//       .text(p.legalProfile.tradeName ?? p.legalProfile.legalName, MARGIN, 60);

//     // Compliance fields (GSTIN etc.)
//     let cy = 80;
//     for (const c of p.compliance) {
//       const label = c.fieldKey.toUpperCase().replace(/_/g, ' ');
//       doc
//         .fontSize(9)
//         .font('Helvetica-Bold')
//         .fillColor('#333')
//         .text(`${label} `, MARGIN, cy, { continued: true })
//         .font('Helvetica-Bold')
//         .text(c.fieldValue);
//       cy += 12;
//     }

//     // Registered address
//     const addr = p.legalProfile.registeredAddress;
//     if (addr) {
//       doc
//         .fontSize(9)
//         .font('Helvetica')
//         .fillColor('#444')
//         .text(
//           `${addr.addressLine1}${addr.addressLine2 ? ', ' + addr.addressLine2 : ''}`,
//           MARGIN,
//           cy,
//         );
//       cy += 12;
//       doc.text(`${addr.city}, ${addr.state}, ${addr.pincode}`, MARGIN, cy);
//       cy += 12;
//     }

//     // Phone / Email on same line
//     const contactParts: string[] = [];
//     if (p.legalProfile.supportPhone)
//       contactParts.push(`Mobile ${p.legalProfile.supportPhone}`);
//     if (p.legalProfile.supportEmail)
//       contactParts.push(`Email ${p.legalProfile.supportEmail}`);
//     if (contactParts.length) {
//       doc
//         .fontSize(9)
//         .font('Helvetica')
//         .fillColor('#444')
//         .text(contactParts.join('   '), MARGIN, cy);
//       cy += 12;
//     }

//     // Divider
//     this.hr(doc, cy + 6, p.branding.primaryColor);
//     doc.y = cy + 18;
//   }

//   /** Branded header variant — coloured top band */
//   private sectionBrandedHeader(
//     doc: InstanceType<typeof PDFDocument>,
//     p: InvoicePayload,
//   ) {
//     const primary = p.branding.primaryColor ?? DEFAULT_PRIMARY;

//     // Coloured band
//     doc.rect(0, 0, PAGE_WIDTH, 80).fill(primary);

//     // Logo on band
//     if (p.branding.logoBuffer) {
//       try {
//         doc.image(p.branding.logoBuffer, MARGIN, 15, { fit: [140, 50] });
//       } catch (_) {}
//     } else {
//       doc
//         .fillColor('#ffffff')
//         .fontSize(18)
//         .font('Helvetica-Bold')
//         .text(p.legalProfile.tradeName ?? p.legalProfile.legalName, MARGIN, 28);
//     }

//     // "TAX INVOICE" on band right
//     doc
//       .fillColor('#ffffff')
//       .fontSize(13)
//       .font('Helvetica-Bold')
//       .text('TAX INVOICE', MARGIN, 30, {
//         align: 'right',
//         width: CONTENT_WIDTH,
//       });
//     doc
//       .fillColor('#ffffff')
//       .fontSize(8)
//       .font('Helvetica')
//       .text('ORIGINAL FOR RECIPIENT', MARGIN, 48, {
//         align: 'right',
//         width: CONTENT_WIDTH,
//       });

//     doc.y = 90;

//     // Compliance fields below band
//     let cy = 95;
//     for (const c of p.compliance) {
//       const lbl = c.fieldKey.toUpperCase().replace(/_/g, ' ');
//       doc
//         .fontSize(9)
//         .font('Helvetica-Bold')
//         .fillColor('#333')
//         .text(`${lbl}: `, MARGIN, cy, { continued: true })
//         .font('Helvetica')
//         .text(c.fieldValue);
//       cy += 12;
//     }

//     const addr = p.legalProfile.registeredAddress;
//     if (addr) {
//       doc
//         .fontSize(9)
//         .font('Helvetica')
//         .fillColor('#444')
//         .text(
//           `${addr.addressLine1}, ${addr.city}, ${addr.state} - ${addr.pincode}`,
//           MARGIN,
//           cy,
//         );
//       cy += 12;
//     }
//     const contactParts: string[] = [];
//     if (p.legalProfile.supportPhone)
//       contactParts.push(`Mobile ${p.legalProfile.supportPhone}`);
//     if (p.legalProfile.supportEmail)
//       contactParts.push(`Email ${p.legalProfile.supportEmail}`);
//     if (contactParts.length) {
//       doc.text(contactParts.join('   '), MARGIN, cy);
//       cy += 12;
//     }

//     this.hr(doc, cy + 4, primary);
//     doc.y = cy + 16;
//   }

//   /**
//    * Invoice #, Invoice Date, Due Date row
//    */
//   private sectionInvoiceMeta(
//     doc: InstanceType<typeof PDFDocument>,
//     p: InvoicePayload,
//   ) {
//     const fmt = p.documentConfig.dateFormat ?? 'DD/MM/YYYY';
//     const y = doc.y + 4;
//     const colW = CONTENT_WIDTH / 3;

//     doc.fontSize(9).font('Helvetica-Bold').fillColor('#333');
//     doc.text(`Invoice #: ${p.invoiceNumber}`, MARGIN, y);
//     doc.text(
//       `Invoice Date: ${formatDate(p.order.invoiceDate, fmt)}`,
//       MARGIN + colW,
//       y,
//     );
//     doc.text(
//       `Due Date: ${formatDate(p.order.dueDate ?? p.order.invoiceDate, fmt)}`,
//       MARGIN + colW * 2,
//       y,
//     );

//     this.hr(doc, y + 16);
//     doc.y = y + 24;
//   }

//   /**
//    * Sold By (left) + Customer Details (right)
//    * Pulls from: legalProfile, vendor, warehouse, order
//    */
//   private sectionSoldByAndBillTo(
//     doc: InstanceType<typeof PDFDocument>,
//     p: InvoicePayload,
//   ) {
//     const y = doc.y;
//     const rightX = MARGIN + CONTENT_WIDTH / 2 + 10;

//     // ── Left: Sold By ──
//     doc
//       .fontSize(9)
//       .font('Helvetica-Bold')
//       .fillColor('#333')
//       .text('Customer Details:', MARGIN, y);
//     doc
//       .font('Helvetica')
//       .fillColor('#111')
//       .text(p.order.customerName, MARGIN, y + 14, { bold: true });
//     if (p.order.customerPhone)
//       doc.text(`Ph: ${p.order.customerPhone}`, MARGIN, y + 26);

//     // ── Middle: Billing ──
//     const billing = p.order.billingAddress ?? p.order.shippingAddress;
//     doc
//       .fontSize(9)
//       .font('Helvetica-Bold')
//       .fillColor('#333')
//       .text('Billing address:', rightX - 60, y);
//     doc
//       .font('Helvetica')
//       .fillColor('#444')
//       .text(billing.addressLine1, rightX - 60, y + 14)
//       .text(
//         `${billing.city}, ${billing.state}, ${billing.pincode}`,
//         rightX - 60,
//         y + 26,
//       );

//     // ── Right: Shipping ──
//     const shipping = p.order.shippingAddress;
//     doc
//       .fontSize(9)
//       .font('Helvetica-Bold')
//       .fillColor('#333')
//       .text('Shipping address:', rightX + 90, y);
//     doc
//       .font('Helvetica')
//       .fillColor('#444')
//       .text(shipping.addressLine1, rightX + 90, y + 14)
//       .text(
//         `${shipping.city}, ${shipping.state}, ${shipping.pincode}`,
//         rightX + 90,
//         y + 26,
//       );

//     doc.y = y + 50;
//   }

//   /** "Place of Supply: 09-UTTARPRADESH" line */
//   private sectionPlaceOfSupply(
//     doc: InstanceType<typeof PDFDocument>,
//     p: InvoicePayload,
//   ) {
//     if (!p.order.placeOfSupply) return;
//     doc
//       .fontSize(9)
//       .font('Helvetica-Bold')
//       .fillColor('#333')
//       .text(`Place of Supply: ${p.order.placeOfSupply}`, MARGIN, doc.y);
//     doc.y += 14;
//   }

//   // ────────────────────────────────────────────────────────────────
//   // ITEMS TABLE — GST variant  (#, Item, Rate/Item, Qty, Taxable, Tax, Amount)
//   // ────────────────────────────────────────────────────────────────
//   private sectionItemsTableGst(
//     doc: InstanceType<typeof PDFDocument>,
//     p: InvoicePayload,
//     totals: ReturnType<typeof this.computeTotals>['totals'],
//   ) {
//     const primary = p.branding.primaryColor ?? DEFAULT_PRIMARY;
//     const currency = p.documentConfig.defaultCurrency ?? 'INR';

//     const cols = {
//       num: { x: MARGIN, w: 20 },
//       item: { x: MARGIN + 20, w: 160 },
//       rate: { x: MARGIN + 180, w: 80 },
//       qty: { x: MARGIN + 260, w: 35 },
//       taxable: { x: MARGIN + 295, w: 75 },
//       tax: { x: MARGIN + 370, w: 80 },
//       amount: { x: MARGIN + 450, w: 45 },
//     };

//     let y = doc.y + 6;

//     // Header row background
//     doc.rect(MARGIN, y, CONTENT_WIDTH, 18).fill(primary);
//     doc.fillColor('#ffffff').fontSize(8).font('Helvetica-Bold');
//     doc.text('#', cols.num.x + 2, y + 4, { width: cols.num.w });
//     doc.text('Item', cols.item.x, y + 4, { width: cols.item.w });
//     doc.text('Rate/Item', cols.rate.x, y + 4, {
//       width: cols.rate.w,
//       align: 'right',
//     });
//     doc.text('Qty', cols.qty.x, y + 4, { width: cols.qty.w, align: 'center' });
//     doc.text('Taxable Value', cols.taxable.x, y + 4, {
//       width: cols.taxable.w,
//       align: 'right',
//     });
//     doc.text('Tax Amount', cols.tax.x, y + 4, {
//       width: cols.tax.w,
//       align: 'right',
//     });
//     doc.text('Amount', cols.amount.x, y + 4, {
//       width: cols.amount.w,
//       align: 'right',
//     });
//     y += 20;

//     // Item rows
//     doc.font('Helvetica').fontSize(8).fillColor('#111');
//     for (let i = 0; i < p.items.length; i++) {
//       const item = p.items[i];
//       const taxable = item.price * item.quantity;
//       const tax = item.taxAmount ?? (taxable * (item.taxRate ?? 0)) / 100;
//       const rowTotal = taxable + tax;

//       // Zebra stripe
//       if (i % 2 === 1) doc.rect(MARGIN, y, CONTENT_WIDTH, 36).fill('#F9FAFB');
//       doc.fillColor('#111');

//       doc.text(String(i + 1), cols.num.x + 2, y + 4, { width: cols.num.w });
//       doc
//         .font('Helvetica-Bold')
//         .text(
//           item.productName.length > 35
//             ? item.productName.substring(0, 32) + '...'
//             : item.productName,
//           cols.item.x,
//           y + 4,
//           { width: cols.item.w },
//         );
//       if (item.hsnCode) {
//         doc
//           .font('Helvetica')
//           .fillColor('#666')
//           .text(`HSN: ${item.hsnCode}`, cols.item.x, y + 15, {
//             width: cols.item.w,
//           });
//       }
//       if (item.description) {
//         doc
//           .font('Helvetica')
//           .fillColor('#666')
//           .text(item.description, cols.item.x, y + (item.hsnCode ? 25 : 15), {
//             width: cols.item.w,
//           });
//       }

//       doc.font('Helvetica').fillColor('#111');
//       doc.text(formatCurrency(item.price, currency), cols.rate.x, y + 4, {
//         width: cols.rate.w,
//         align: 'right',
//       });
//       doc.text(String(item.quantity), cols.qty.x, y + 4, {
//         width: cols.qty.w,
//         align: 'center',
//       });
//       doc.text(formatCurrency(taxable, currency), cols.taxable.x, y + 4, {
//         width: cols.taxable.w,
//         align: 'right',
//       });
//       doc.text(
//         `${formatCurrency(tax, currency)}${item.taxRate ? ` (${item.taxRate}%)` : ''}`,
//         cols.tax.x,
//         y + 4,
//         { width: cols.tax.w, align: 'right' },
//       );
//       doc.text(formatCurrency(rowTotal, currency), cols.amount.x, y + 4, {
//         width: cols.amount.w,
//         align: 'right',
//       });

//       y += 38;
//       this.hr(doc, y - 2, '#E5E7EB');
//     }

//     doc.y = y + 4;
//   }

//   // ────────────────────────────────────────────────────────────────
//   // ITEMS TABLE — Simple (no tax breakdown columns)
//   // ────────────────────────────────────────────────────────────────
//   private sectionItemsTableSimple(
//     doc: InstanceType<typeof PDFDocument>,
//     p: InvoicePayload,
//     totals: ReturnType<typeof this.computeTotals>['totals'],
//   ) {
//     const primary = p.branding.primaryColor ?? DEFAULT_PRIMARY;
//     const currency = p.documentConfig.defaultCurrency ?? 'INR';

//     const cols = {
//       num: { x: MARGIN, w: 20 },
//       item: { x: MARGIN + 20, w: 220 },
//       qty: { x: MARGIN + 240, w: 40 },
//       price: { x: MARGIN + 280, w: 80 },
//       total: { x: MARGIN + 360, w: 135 },
//     };

//     let y = doc.y + 6;

//     doc.rect(MARGIN, y, CONTENT_WIDTH, 18).fill(primary);
//     doc.fillColor('#ffffff').fontSize(8).font('Helvetica-Bold');
//     doc.text('#', cols.num.x + 2, y + 4, { width: cols.num.w });
//     doc.text('Item', cols.item.x, y + 4, { width: cols.item.w });
//     doc.text('Qty', cols.qty.x, y + 4, { width: cols.qty.w, align: 'center' });
//     doc.text('Unit Price', cols.price.x, y + 4, {
//       width: cols.price.w,
//       align: 'right',
//     });
//     doc.text('Amount', cols.total.x, y + 4, {
//       width: cols.total.w,
//       align: 'right',
//     });
//     y += 20;

//     doc.font('Helvetica').fontSize(8).fillColor('#111');
//     for (let i = 0; i < p.items.length; i++) {
//       const item = p.items[i];
//       const taxable = item.price * item.quantity;
//       const tax = item.taxAmount ?? (taxable * (item.taxRate ?? 0)) / 100;
//       const rowTotal = taxable + tax;

//       if (i % 2 === 1) doc.rect(MARGIN, y, CONTENT_WIDTH, 24).fill('#F9FAFB');
//       doc.fillColor('#111');

//       doc.text(String(i + 1), cols.num.x + 2, y + 4, { width: cols.num.w });
//       doc
//         .font('Helvetica-Bold')
//         .text(
//           item.productName.length > 40
//             ? item.productName.substring(0, 37) + '...'
//             : item.productName,
//           cols.item.x,
//           y + 4,
//           { width: cols.item.w },
//         );
//       doc.font('Helvetica').fillColor('#111');
//       doc.text(String(item.quantity), cols.qty.x, y + 4, {
//         width: cols.qty.w,
//         align: 'center',
//       });
//       doc.text(formatCurrency(item.price, currency), cols.price.x, y + 4, {
//         width: cols.price.w,
//         align: 'right',
//       });
//       doc.text(formatCurrency(rowTotal, currency), cols.total.x, y + 4, {
//         width: cols.total.w,
//         align: 'right',
//       });

//       y += 26;
//       this.hr(doc, y - 2, '#E5E7EB');
//     }

//     doc.y = y + 4;
//   }

//   // ────────────────────────────────────────────────────────────────
//   // TOTALS — GST (Taxable + IGST + Grand Total)
//   // ────────────────────────────────────────────────────────────────
//   private sectionTotalsGst(
//     doc: InstanceType<typeof PDFDocument>,
//     totals: {
//       taxableTotal: number;
//       taxTotal: number;
//       grandTotal: number;
//       taxRate?: number;
//     },
//     currency = 'INR',
//   ) {
//     const rightX = MARGIN + CONTENT_WIDTH - 200;
//     let y = doc.y + 4;

//     const row = (label: string, value: string, bold = false) => {
//       doc
//         .fontSize(9)
//         .font(bold ? 'Helvetica-Bold' : 'Helvetica')
//         .fillColor('#333')
//         .text(label, rightX, y, { width: 120, align: 'right' });
//       doc.text(value, rightX + 125, y, { width: 70, align: 'right' });
//       y += 14;
//     };

//     row('Taxable Amount', formatCurrency(totals.taxableTotal, currency));
//     if (totals.taxRate) {
//       row(
//         `IGST ${totals.taxRate.toFixed(1)}%`,
//         formatCurrency(totals.taxTotal, currency),
//       );
//     } else {
//       row('Tax Amount', formatCurrency(totals.taxTotal, currency));
//     }

//     this.hr(doc, y, '#333');
//     y += 6;
//     doc
//       .fontSize(12)
//       .font('Helvetica-Bold')
//       .fillColor('#111')
//       .text('Total', rightX, y, { width: 120, align: 'right' });
//     doc.text(formatCurrency(totals.grandTotal, currency), rightX + 125, y, {
//       width: 70,
//       align: 'right',
//     });
//     y += 20;

//     this.hr(doc, y);
//     doc.y = y + 8;
//   }

//   /** Simple totals block (no tax breakdown) */
//   private sectionTotalsSimple(
//     doc: InstanceType<typeof PDFDocument>,
//     totals: { taxableTotal: number; taxTotal: number; grandTotal: number },
//     currency = 'INR',
//   ) {
//     const rightX = MARGIN + CONTENT_WIDTH - 200;
//     let y = doc.y + 4;

//     doc
//       .fontSize(9)
//       .font('Helvetica')
//       .fillColor('#333')
//       .text('Sub Total', rightX, y, { width: 120, align: 'right' });
//     doc.text(formatCurrency(totals.taxableTotal, currency), rightX + 125, y, {
//       width: 70,
//       align: 'right',
//     });
//     y += 14;

//     if (totals.taxTotal > 0) {
//       doc.text('Tax', rightX, y, { width: 120, align: 'right' });
//       doc.text(formatCurrency(totals.taxTotal, currency), rightX + 125, y, {
//         width: 70,
//         align: 'right',
//       });
//       y += 14;
//     }

//     this.hr(doc, y);
//     y += 6;
//     doc
//       .fontSize(11)
//       .font('Helvetica-Bold')
//       .fillColor('#111')
//       .text('Grand Total', rightX, y, { width: 120, align: 'right' });
//     doc.text(formatCurrency(totals.grandTotal, currency), rightX + 125, y, {
//       width: 70,
//       align: 'right',
//     });
//     y += 18;

//     doc.y = y + 4;
//   }

//   /** "Total Items / Qty … Total amount in words …" row */
//   private sectionAmountInWords(
//     doc: InstanceType<typeof PDFDocument>,
//     grandTotal: number,
//     currency = 'INR',
//   ) {
//     const y = doc.y;
//     const totalItems = ''; // caller can pass if needed
//     const words = numberToWords(grandTotal);
//     const prefix = currency === 'INR' ? 'INR' : currency;

//     doc
//       .fontSize(8)
//       .font('Helvetica')
//       .fillColor('#444')
//       .text(`Total amount (in words): ${prefix} ${words}`, MARGIN, y, {
//         width: CONTENT_WIDTH,
//       });
//     this.hr(doc, y + 14);
//     doc.y = y + 22;
//   }

//   /** Bank details (left) + signatory block (right) */
//   private sectionBankAndSignature(
//     doc: InstanceType<typeof PDFDocument>,
//     p: InvoicePayload,
//   ) {
//     const bank = p.bankDetails!;
//     const cfg = p.documentConfig;
//     const y = doc.y + 4;
//     const rightX = MARGIN + CONTENT_WIDTH / 2 + 20;

//     // Left — Pay using UPI / Bank
//     doc
//       .fontSize(9)
//       .font('Helvetica-Bold')
//       .fillColor('#333')
//       .text('Pay using UPI:', MARGIN, y);
//     if (bank.qrCodeBuffer) {
//       try {
//         doc.image(bank.qrCodeBuffer, MARGIN, y + 12, { fit: [70, 70] });
//       } catch (_) {}
//     }

//     doc.text('Bank Details:', MARGIN + 85, y);
//     doc.font('Helvetica').fontSize(9).fillColor('#444');
//     const bx = MARGIN + 85;
//     doc.text(`Bank:`, bx, y + 14).text(bank.bankName, bx + 45, y + 14);
//     doc
//       .text(`Account #:`, bx, y + 26)
//       .text(bank.accountNumber, bx + 45, y + 26);
//     doc.text(`IFSC:`, bx, y + 38).text(bank.ifscCode, bx + 45, y + 38);
//     doc.text(`Branch:`, bx, y + 50).text(bank.branchName, bx + 45, y + 50);

//     // Right — signatory
//     const sigLabel = `For ${p.legalProfile.tradeName ?? p.legalProfile.legalName}`;
//     doc
//       .fontSize(9)
//       .font('Helvetica')
//       .fillColor('#333')
//       .text(sigLabel, rightX, y, {
//         align: 'right',
//         width: CONTENT_WIDTH / 2 - 20,
//       });

//     if (cfg.signatorySignatureBuffer) {
//       try {
//         doc.image(cfg.signatorySignatureBuffer, rightX + 60, y + 10, {
//           fit: [80, 40],
//         });
//       } catch (_) {}
//     } else {
//       // Placeholder stamp circle
//       doc.circle(rightX + 95, y + 30, 28).stroke('#aaa');
//       doc
//         .fontSize(7)
//         .fillColor('#aaa')
//         .text('SIGNATURE', rightX + 72, y + 26);
//     }

//     const nameY = y + 70;
//     if (cfg.signatoryName) {
//       doc
//         .fontSize(9)
//         .font('Helvetica-Bold')
//         .fillColor('#333')
//         .text(cfg.signatoryName, rightX, nameY, {
//           align: 'right',
//           width: CONTENT_WIDTH / 2 - 20,
//         });
//     }
//     doc
//       .fontSize(8)
//       .font('Helvetica')
//       .fillColor('#555')
//       .text(
//         cfg.signatoryDesignation ?? 'Authorized Signatory',
//         rightX,
//         nameY + 12,
//         { align: 'right', width: CONTENT_WIDTH / 2 - 20 },
//       );

//     doc.y = nameY + 40;
//   }

//   private sectionNotes(doc: InstanceType<typeof PDFDocument>, notes: string) {
//     doc
//       .fontSize(9)
//       .font('Helvetica-Bold')
//       .fillColor('#333')
//       .text('Notes:', MARGIN, doc.y);
//     doc
//       .font('Helvetica')
//       .fillColor('#444')
//       .text(notes, MARGIN, doc.y + 12);
//     doc.y += 30;
//   }

//   private sectionTermsAndConditions(
//     doc: InstanceType<typeof PDFDocument>,
//     terms?: string,
//   ) {
//     if (!terms) return;
//     const y = doc.y;
//     doc
//       .fontSize(9)
//       .font('Helvetica-Bold')
//       .fillColor('#333')
//       .text('Terms and Conditions:', MARGIN, y);
//     doc
//       .font('Helvetica')
//       .fontSize(8)
//       .fillColor('#444')
//       .text(terms, MARGIN, y + 14, { width: CONTENT_WIDTH });
//     doc.y += 14 + terms.split('\n').length * 12 + 8;
//   }

//   /** Footer: page number + footer text from documentConfig */
//   private sectionFooter(
//     doc: InstanceType<typeof PDFDocument>,
//     p: InvoicePayload,
//     opts: { minimal?: boolean; label?: string } = {},
//   ) {
//     const footerY = 750;
//     const text =
//       opts.label ??
//       p.documentConfig.invoiceFooterText ??
//       'This is a computer generated invoice and does not require a signature.';

//     this.hr(doc, footerY - 10);

//     doc
//       .fontSize(8)
//       .font('Helvetica')
//       .fillColor('#666')
//       .text('Page 1 / 1', MARGIN, footerY, { width: 80 });

//     doc.text(text, MARGIN + 90, footerY, {
//       width: CONTENT_WIDTH - 90,
//       align: 'center',
//     });
//   }

//   // ================================================================
//   // UTILITIES
//   // ================================================================

//   private hr(
//     doc: InstanceType<typeof PDFDocument>,
//     y: number,
//     color = '#CCCCCC',
//   ) {
//     doc
//       .strokeColor(color)
//       .lineWidth(0.5)
//       .moveTo(MARGIN, y)
//       .lineTo(MARGIN + CONTENT_WIDTH, y)
//       .stroke();
//   }

//   private applyWatermark(
//     doc: InstanceType<typeof PDFDocument>,
//     logoBuffer: Buffer,
//   ) {
//     try {
//       doc.save();
//       doc.opacity(0.06);
//       doc.image(logoBuffer, 100, 200, { fit: [400, 400] });
//       doc.restore();
//     } catch (_) {}
//   }

//   private computeTotals(items: InvoiceItem[], currency = 'INR') {
//     let taxableTotal = 0;
//     let taxTotal = 0;
//     let blendedRate: number | undefined;

//     for (const item of items) {
//       const taxable = item.price * item.quantity;
//       const tax = item.taxAmount ?? (taxable * (item.taxRate ?? 0)) / 100;
//       taxableTotal += taxable;
//       taxTotal += tax;
//       if (item.taxRate !== undefined) blendedRate = item.taxRate; // simplified
//     }

//     return {
//       totals: {
//         taxableTotal,
//         taxTotal,
//         grandTotal: taxableTotal + taxTotal,
//         taxRate: blendedRate,
//       },
//     };
//   }
// }
