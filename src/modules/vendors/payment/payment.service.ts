import { Injectable, Inject, HttpException, HttpStatus } from '@nestjs/common';
import { DRIZZLE, type DrizzleService } from '../../../drizzle/drizzle.module';
import {
  vendor,
  vendor_gateways,
  vendor_credentials,
  company,
} from '../../../drizzle/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { VendorCryptoService } from './vendor-crypto.service';
import { PaymentSplitterService } from './payment-splitter.service';
import {
  LogisticsMode,
  ShippingChargeStrategy,
  PaymentRoutingStatus,
} from '../../../drizzle/types/types';
import { domainExtractor } from '../../../common/filters/domainExtractor.filter';
import { CompanyService } from '../../company/company.service';

@Injectable()
export class PaymentService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleService,
    private readonly cryptoService: VendorCryptoService,
    private readonly splitterService: PaymentSplitterService,
    private readonly companyService: CompanyService,
  ) {}

  private async resolveCompanyId(domain: string): Promise<string> {
    const filteredDomain = domainExtractor(domain);
    return this.companyService.find(filteredDomain);
  }

  async getVendorIdByUserId(
    userId: string,
  ): Promise<{ id: string; company_id: string }> {
    const [vendorRecord] = await this.db
      .select({ id: vendor.id, company_id: vendor.company_id })
      .from(vendor)
      .where(eq(vendor.user_id, userId))
      .limit(1);

    if (!vendorRecord) {
      throw new HttpException(
        'Vendor record not found for this user.',
        HttpStatus.NOT_FOUND,
      );
    }
    return {
      id: vendorRecord.id,
      company_id: vendorRecord.company_id ?? '',
    };
  }

  private async upsertCredential(
    gatewayId: string,
    credentialType:
      | 'razorpay_key_id'
      | 'razorpay_key_secret'
      | 'razorpay_webhook_secret',
    value: string,
    isSecret: boolean,
    txContext?: any,
  ): Promise<void> {
    const db = txContext ?? this.db;

    const [existing] = await db
      .select()
      .from(vendor_credentials)
      .where(
        and(
          eq(vendor_credentials.vendor_gateway_id, gatewayId),
          eq(vendor_credentials.credential_type, credentialType),
        ),
      )
      .limit(1);

    let public_identifier: string | null = null;
    let encrypted_value: string | null = null;
    let iv: string | null = null;
    let tag: string | null = null;

    if (isSecret) {
      const encryptedData = this.cryptoService.encryptSecret(value);
      encrypted_value = encryptedData.encrypted;
      iv = encryptedData.iv;
      tag = encryptedData.tag;
    } else {
      public_identifier = value;
    }

    if (existing) {
      await db
        .update(vendor_credentials)
        .set({
          public_identifier,
          encrypted_value,
          iv,
          tag,
          encryption_key_version: 1,
          updated_at: new Date(),
        })
        .where(eq(vendor_credentials.id, existing.id));
    } else {
      await db.insert(vendor_credentials).values({
        vendor_gateway_id: gatewayId,
        credential_type: credentialType,
        public_identifier,
        encrypted_value,
        iv,
        tag,
        encryption_key_version: 1,
      });
    }
  }

  async getConfigForUser(user: any, domain: string): Promise<any> {
    const vendorRecord = await this.getVendorIdByUserId(user.id);
    const companyId = await this.resolveCompanyId(domain);

    if (vendorRecord.company_id !== companyId) {
      throw new HttpException(
        'Unauthorized storefront access.',
        HttpStatus.FORBIDDEN,
      );
    }

    const [config] = await this.db
      .select()
      .from(vendor_gateways)
      .where(
        and(
          eq(vendor_gateways.vendor_id, vendorRecord.id),
          eq(vendor_gateways.company_id, companyId),
        ),
      )
      .limit(1);

    const [compRecord] = await this.db
      .select({ logistics_mode: company.logistics_mode })
      .from(company)
      .where(eq(company.id, companyId))
      .limit(1);

    const logisticsMode =
      compRecord?.logistics_mode ?? LogisticsMode.STANDALONE;

    if (!config) {
      return {
        logistics_mode: logisticsMode,
        shipping_charge_strategy: ShippingChargeStrategy.STANDARD_FLAT_RATE,
        razorpay_key_id: '',
        razorpay_key_secret_masked: null,
        razorpay_webhook_secret_masked: null,
      };
    }

    const credentials = await this.db
      .select()
      .from(vendor_credentials)
      .where(eq(vendor_credentials.vendor_gateway_id, config.id));

    const keyIdCred = credentials.find(
      (c) => c.credential_type === 'razorpay_key_id',
    );
    const keySecretCred = credentials.find(
      (c) => c.credential_type === 'razorpay_key_secret',
    );
    const webhookSecretCred = credentials.find(
      (c) => c.credential_type === 'razorpay_webhook_secret',
    );

    return {
      id: config.id,
      company_id: config.company_id,
      razorpay_key_id: keyIdCred?.public_identifier ?? '',
      razorpay_key_secret_masked: keySecretCred?.encrypted_value
        ? '••••••••••••••••'
        : null,
      razorpay_webhook_secret_masked: webhookSecretCred?.encrypted_value
        ? '••••••••••••••••'
        : null,
      logistics_mode: logisticsMode,
      shipping_charge_strategy: config.shipping_charge_strategy,
      routing_status: config.routing_status,
      created_at: config.created_at,
      updated_at: config.updated_at,
    };
  }

  async saveConfigForUser(
    user: any,
    domain: string,
    data: {
      razorpay_key_id?: string;
      razorpay_key_secret?: string;
      razorpay_webhook_secret?: string;
      logistics_mode: LogisticsMode;
      shipping_charge_strategy: ShippingChargeStrategy;
    },
  ): Promise<any> {
    const vendorRecord = await this.getVendorIdByUserId(user.id);
    const companyId = await this.resolveCompanyId(domain);

    if (vendorRecord.company_id !== companyId) {
      throw new HttpException(
        'Unauthorized storefront access.',
        HttpStatus.FORBIDDEN,
      );
    }

    const isProxy = data.logistics_mode === LogisticsMode.PLATFORM_PROXY;

    // 1. Validation checks
    if (data.logistics_mode === LogisticsMode.STANDALONE) {
      if (!data.razorpay_key_id) {
        throw new HttpException(
          'Razorpay Key ID is required for Standalone mode.',
          HttpStatus.BAD_REQUEST,
        );
      }
      if (
        data.razorpay_key_secret &&
        data.razorpay_key_secret !== '••••••••••••••••'
      ) {
        const isValid = await this.splitterService.validateCredentials(
          data.razorpay_key_id,
          data.razorpay_key_secret,
        );
        if (!isValid) {
          throw new HttpException(
            'Invalid Razorpay credentials.',
            HttpStatus.BAD_REQUEST,
          );
        }
      }
    } else {
      if (!data.razorpay_key_id) {
        throw new HttpException(
          'Razorpay Account ID is required for Platform Proxy mode.',
          HttpStatus.BAD_REQUEST,
        );
      }
      if (!data.razorpay_key_id.startsWith('acc_')) {
        throw new HttpException(
          'Invalid Razorpay Account ID format. Must start with "acc_".',
          HttpStatus.BAD_REQUEST,
        );
      }
    }

    return await this.db.transaction(async (tx) => {
      // Update company's logistics mode
      await tx
        .update(company)
        .set({ logistics_mode: data.logistics_mode })
        .where(eq(company.id, companyId));

      // 2. Lookup existing config
      const [existing] = await tx
        .select()
        .from(vendor_gateways)
        .where(
          and(
            eq(vendor_gateways.vendor_id, vendorRecord.id),
            eq(vendor_gateways.company_id, companyId),
          ),
        )
        .limit(1);

      let gatewayId: string;

      if (existing) {
        gatewayId = existing.id;
        await tx
          .update(vendor_gateways)
          .set({
            shipping_charge_strategy: data.shipping_charge_strategy,
            routing_status: PaymentRoutingStatus.VAULTED,
            updated_at: new Date(),
          })
          .where(eq(vendor_gateways.id, existing.id));
      } else {
        const [newGateway] = await tx
          .insert(vendor_gateways)
          .values({
            vendor_id: vendorRecord.id,
            company_id: companyId,
            shipping_charge_strategy: data.shipping_charge_strategy,
            routing_status: PaymentRoutingStatus.VAULTED,
          })
          .returning({ id: vendor_gateways.id });
        gatewayId = newGateway.id;
      }

      // Upsert key ID
      if (data.razorpay_key_id) {
        await this.upsertCredential(
          gatewayId,
          'razorpay_key_id',
          data.razorpay_key_id,
          false,
          tx,
        );
      }

      if (isProxy) {
        // Clear secrets under proxy mode
        await tx
          .delete(vendor_credentials)
          .where(
            and(
              eq(vendor_credentials.vendor_gateway_id, gatewayId),
              inArray(vendor_credentials.credential_type, [
                'razorpay_key_secret',
                'razorpay_webhook_secret',
              ]),
            ),
          );
      } else {
        // standalone: key secret
        if (
          data.razorpay_key_secret &&
          data.razorpay_key_secret !== '••••••••••••••••'
        ) {
          await this.upsertCredential(
            gatewayId,
            'razorpay_key_secret',
            data.razorpay_key_secret,
            true,
            tx,
          );
        }

        // standalone: webhook secret
        if (
          data.razorpay_webhook_secret &&
          data.razorpay_webhook_secret !== '••••••••••••••••'
        ) {
          await this.upsertCredential(
            gatewayId,
            'razorpay_webhook_secret',
            data.razorpay_webhook_secret,
            true,
            tx,
          );
        }
      }

      return this.getConfigForUser(user, domain);
    });
  }

  async getDecryptedSecret(
    vendorId: string,
  ): Promise<{ keyId: string; keySecret: string } | null> {
    const [config] = await this.db
      .select()
      .from(vendor_gateways)
      .where(eq(vendor_gateways.vendor_id, vendorId))
      .limit(1);

    if (!config) {
      return null;
    }

    const credentials = await this.db
      .select()
      .from(vendor_credentials)
      .where(eq(vendor_credentials.vendor_gateway_id, config.id));

    const keyIdCred = credentials.find(
      (c) => c.credential_type === 'razorpay_key_id',
    );
    const keySecretCred = credentials.find(
      (c) => c.credential_type === 'razorpay_key_secret',
    );

    if (
      !keyIdCred ||
      !keyIdCred.public_identifier ||
      !keySecretCred ||
      !keySecretCred.encrypted_value ||
      !keySecretCred.iv ||
      !keySecretCred.tag
    ) {
      return null;
    }

    try {
      const keySecret = this.cryptoService.decryptSecret(
        keySecretCred.encrypted_value,
        keySecretCred.iv,
        keySecretCred.tag,
      );
      return {
        keyId: keyIdCred.public_identifier,
        keySecret,
      };
    } catch (e) {
      return null;
    }
  }

  async getDecryptedWebhookSecret(vendorId: string): Promise<string | null> {
    const [config] = await this.db
      .select()
      .from(vendor_gateways)
      .where(eq(vendor_gateways.vendor_id, vendorId))
      .limit(1);

    if (!config) {
      return null;
    }

    const [webhookSecretCred] = await this.db
      .select()
      .from(vendor_credentials)
      .where(
        and(
          eq(vendor_credentials.vendor_gateway_id, config.id),
          eq(vendor_credentials.credential_type, 'razorpay_webhook_secret'),
        ),
      )
      .limit(1);

    if (
      !webhookSecretCred ||
      !webhookSecretCred.encrypted_value ||
      !webhookSecretCred.iv ||
      !webhookSecretCred.tag
    ) {
      return null;
    }

    try {
      return this.cryptoService.decryptSecret(
        webhookSecretCred.encrypted_value,
        webhookSecretCred.iv,
        webhookSecretCred.tag,
      );
    } catch (e) {
      return null;
    }
  }
}
