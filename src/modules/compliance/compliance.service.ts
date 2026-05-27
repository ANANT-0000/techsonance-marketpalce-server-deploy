import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';

import { DRIZZLE, type DrizzleService } from '../../drizzle/drizzle.module';
import { CompanyService } from '../company/company.service';
import { UploadToCloudService } from '../../utils/upload-to-cloud/upload-to-cloud.service';
import { domainExtractor } from '../../common/filters/domainExtractor.filter';
import {
  company_compliance,
  company_document,
 
} from '../../drizzle/schema';
import { and, desc, eq } from 'drizzle-orm';
import {
 
  CreateComplianceDto,
} from './dto/compliance.dto';

@Injectable()
export class ComplianceService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleService,
    private readonly companyService: CompanyService,
    private readonly uploadToCloudService: UploadToCloudService,
  ) {}

  // ── helpers ──

  private async resolveCompanyId(domain: string): Promise<string> {
    const filtered = domainExtractor(domain);
    const id = await this.companyService.find(filtered);
    if (!id) throw new HttpException('Company not found', HttpStatus.NOT_FOUND);
    return id;
  }

  // ── READ: list all compliance fields for a company ────────────────────────

  // async listComplianceFields(domain: string) {
  //   const companyId = await this.resolveCompanyId(domain);

  //   const fields = await this.db
  //     .select()
  //     .from(company_compliance)
  //     .where(eq(company_compliance.company_id, companyId))
  //     .orderBy(
  //       company_compliance.country_code,
  //       desc(company_compliance.created_at),
  //     )
  //     .catch((err) => {
  //       throw new InternalServerErrorException(
  //         'Failed to list compliance fields',
  //         { cause: err },
  //       );
  //     });

  //   // NOTE: Once compliance_documents schema is migrated, join here
  //   // to attach document counts per field.
  //   return { success: true, data: fields };
  // }

  // ── READ: list compliance fields for a specific country ──────────────────

  // async listComplianceFieldsByCountry(domain: string, countryCode: string) {
  //   const companyId = await this.resolveCompanyId(domain);

  //   const fields = await this.db
  //     .select()
  //     .from(company_compliance)
  //     .where(
  //       and(
  //         eq(company_compliance.company_id, companyId),
  //         eq(company_compliance.country_code, countryCode),
  //         eq(company_compliance.is_active, true),
  //       ),
  //     )
  //     .orderBy(desc(company_compliance.created_at));

  //   return { success: true, data: fields };
  // }

  // ── READ: list proof documents for a compliance field ────────────────────
  //
  // TODO: once compliance_documents migration is run, replace this
  // stub with the real query:
  //
  //   await this.db
  //     .select()
  //     .from(compliance_documents)
  //     .where(eq(compliance_documents.compliance_field_id, fieldId))
  //     .orderBy(desc(compliance_documents.created_at));

  // async listDocumentsForField(domain: string, fieldId: string) {
  //   await this.resolveCompanyId(domain); // auth gate

  //   // Stub — replace with real query after migration
  //   console.warn(
  //     '[ComplianceRegistrationService.listDocumentsForField] ' +
  //       'compliance_documents table not yet migrated. Returning empty list.',
  //   );
  //   return { success: true, data: [] };
  // }

  // ── CREATE: register a new compliance field ───────────────────────────────
  //
  // Uses INSERT ... ON CONFLICT DO NOTHING so re-submission of the
  // same field_key + country for a company is idempotent for vendors.
  // (Vendors have create-only access; an existing record is not overwritten.)

  // async createCompliance(
  //   domain: string,
  //   dto: CreateComplianceDto,
  //   files: Express.Multer.File[],
  // ) {
  //   const companyId = await this.resolveCompanyId(domain);
  //   const docFiles = Array.isArray(files['documents'])
  //     ? files['documents']
  //     : [];
  //   console.log(
  //     `[ComplianceService.createCompliance] Processing ${docFiles.length} document(s)`,
  //   );
  //   const vendorDocuments: { secure_url: string; type: string }[] = [];
  //   const documentPromises = docFiles.map(async (file: Express.Multer.File) => {
  //     console.log(
  //       `[ComplianceService.createCompliance]  Uploading document: ${file.originalname}`,
  //     );
  //     return await this.uploadToCloudService
  //       .uploadDocument(file, file.originalname.split('__')[0])
  //       .catch((error) => {
  //         console.error(
  //           `Error uploading document ${file.originalname}:`,
  //           error,
  //         );
  //         throw new InternalServerErrorException(
  //           `Failed to upload document ${file.originalname}`,
  //           { cause: error },
  //         );
  //       });
  //   });
  //   const resolvedDocuments = await Promise.all(documentPromises);
  //   vendorDocuments.push(...resolvedDocuments);
  //   console.log(
  //     `[ComplianceService.createCompliance] All documents uploaded successfully`,
  //   );
  //   console.log(
  //     '  [ComplianceService.createCompliance]  Starting database transaction for vendor registration',
  //   );
  //   // Enforce vendor create-only: check if record already exists.
  //   const existing = await this.db
  //     .select({
  //       id: company_compliance.id,
  //       field_key: company_compliance.field_key,
  //     })
  //     .from(company_compliance)
  //     .where(eq(company_compliance.company_id, companyId));
  //   const existingFields = dto.company_compliance.map((c) => c.field_key);
  //   // if (existing && dto.company_compliance.some(c => c.field_key === existing.field_key)) {
  //   //   throw new HttpException(
  //   //     `Compliance field '${dto}' for country ${dto.country_code} already exists. Vendors cannot update existing records.`,
  //   //     HttpStatus.CONFLICT,
  //   //   );
  //   // }
  //   const insertedDocs: { id: string; document_type: string }[] = [];
  //   return this.db.transaction(async (tx) => {
  //     for (const doc of vendorDocuments) {
  //       const [insertedDoc] = await tx
  //         .insert(company_document)
  //         .values({
  //           document_url: doc.secure_url,
  //           document_type: doc.type,
  //           vendor_id: dto.vendor_id,
  //           company_id: companyId,
  //         })
  //         .returning({
  //           id: company_document.id,
  //           document_type: company_document.document_type,
  //         })
  //         .catch((error) => {
  //           console.error('Error inserting vendor document record:', error);
  //           throw new InternalServerErrorException(
  //             'Failed to insert vendor document',
  //             { cause: error },
  //           );
  //         });

  //       if (insertedDoc) insertedDocs.push(insertedDoc);
  //     }

  //     console.log(
  //       '  [ComplianceService.createCompliance]  Vendor documents inserted successfully',
  //     );

  //     // Build a lookup map: document_type -> document_id
  //     const docTypeToIdMap = new Map(
  //       insertedDocs.map((doc) => [doc.document_type, doc.id]),
  //     );

  //     // Map compliance entries, matching field_key to document type
  //     const compliancePayloads = dto.company_compliance.map((compliance) => {
  //       const matchedDocId = docTypeToIdMap.get(compliance.field_key) ?? null;

  //       return {
  //         company_id: companyId,
  //         country_code: dto.country_code,
  //         field_key: compliance.field_key,
  //         field_value: compliance.field_value,
  //         is_active: compliance.is_active ?? true,
  //         valid_until: compliance.valid_until ?? null,
  //         document_id: matchedDocId, // null if no matching doc
  //       };
  //     });

  //     // Bulk insert all compliance records at once, skip duplicates
  //     if (compliancePayloads.length > 0) {
  //       await tx
  //         .insert(company_compliance)
  //         .values(compliancePayloads)
  //         .onConflictDoNothing({
  //           target: [
  //             company_compliance.company_id,
  //             company_compliance.country_code,
  //             company_compliance.field_key,
  //           ],
  //         })
  //         .catch((error) => {
  //           console.error('Error inserting company compliance:', error);
  //           throw new InternalServerErrorException(
  //             'Failed to insert company compliance',
  //             { cause: error },
  //           );
  //         });
  //     }
  //     const [created] = await this.db
  //       .insert(company_compliance)
  //       .values({
  //         company_id: companyId,
  //         country_code: dto.country_code,
  //         field_key: dto.field_key,
  //         field_value: dto.field_value,
  //         is_active: dto.is_active ?? true,
  //         valid_until: dto.valid_until ?? null,
  //       })
  //       .returning()
  //       .catch((err) => {
  //         throw new InternalServerErrorException(
  //           'Failed to create compliance field',
  //           { cause: err },
  //         );
  //       });

  //     // return {
  //     //   success: true,
  //     //   message: 'Compliance field registered successfully',
  //     //   data: created,
  //     // };
  //   });
  // }
}
