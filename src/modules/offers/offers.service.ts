import { eq } from 'drizzle-orm';
import { CompanyService } from './../company/company.service';
import { Inject, Injectable, NotImplementedException } from '@nestjs/common';
import { domainExtractor } from '../../common/filters/domainExtractor.filter';
import { DRIZZLE, type DrizzleService } from '../../drizzle/drizzle.module';
import { offers } from '../../drizzle/schema/shop.schema';

@Injectable()
export class OffersService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleService,
    private readonly companyService: CompanyService,
  ) {}

  private async resolveCompanyId(domain: string): Promise<string> {
    console.log(
      `[FinancesService.resolveCompanyId] Resolving company for domain: ${domain}`,
    );
    const filteredDomain = domainExtractor(domain);
    console.log(
      `[FinancesService.resolveCompanyId] Extracted filter domain: ${filteredDomain}`,
    );
    console.log(
      '[FinancesService.resolveCompanyId] Querying CompanyService.find(...)',
    );
    return this.companyService.find(filteredDomain);
  }
  async getOffersAll(domain: string) {
    try {
      const companyId = await this.resolveCompanyId(domain);
      console.log(
        `[OffersService.getOffersAll] Resolved company ID: ${companyId}`,
      );
      const offerRecords = await this.db.query.offers.findMany({
        where: eq(offers.company_id, companyId),
      });
      console.log(
        `[OffersService.getOffersAll] Retrieved offers: ${JSON.stringify(offerRecords)}`,
      );
      return offerRecords;
    } catch (error) {
      console.error(`[OffersService.getOffersAll] Error occurred: ${error}`);
      throw error;
    }
  }

  // New stubs to support company-scoped controller endpoints
  async createOffer(domain: string, payload: any) {
    throw new NotImplementedException('createOffer not implemented');
  }

  async listOffers(domain: string) {
    return this.getOffersAll(domain);
  }

  async getOfferDetail(domain: string, id: string) {
    throw new NotImplementedException('getOfferDetail not implemented');
  }

  async updateOffer(domain: string, id: string, payload: any) {
    throw new NotImplementedException('updateOffer not implemented');
  }

  async deleteOffer(domain: string, id: string) {
    throw new NotImplementedException('deleteOffer not implemented');
  }

  async addScope(domain: string, id: string, payload: any) {
    throw new NotImplementedException('addScope not implemented');
  }

  async removeScope(domain: string, id: string, scopeId: string) {
    throw new NotImplementedException('removeScope not implemented');
  }

  async updateDisplay(domain: string, id: string, payload: any) {
    throw new NotImplementedException('updateDisplay not implemented');
  }

  async overlapCheck(domain: string, id: string) {
    throw new NotImplementedException('overlapCheck not implemented');
  }
}
