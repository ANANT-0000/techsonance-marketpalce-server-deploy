import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { and, count, eq } from 'drizzle-orm';
import { DRIZZLE, type DrizzleService } from '../../drizzle/drizzle.module';
import { address, user, vendor } from '../../drizzle/schema';
import { CreateAddressDto } from './dto/createAddress.dto';
import { UpdateAddressDto } from './dto/updateAddress.dto';
import { domainExtractor } from '../../common/filters/domainExtractor.filter';
import { CompanyService } from '../company/company.service';
@Injectable()
export class AddressService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleService,
    private readonly companyService: CompanyService,
  ) {}
  private async resolveCompanyId(domain: string): Promise<string> {
    const filterDomain = domainExtractor(domain);
    return this.companyService.find(filterDomain);
  }
  async findAddressesByUserId(
    userId: string,
    filters?: { limit: number; offset: number },
  ) {
    if (!userId) {
      console.log('[AddressService.findAddressesByUserId] User ID is missing');
      return new HttpException('User ID is required', HttpStatus.BAD_REQUEST);
    }
    try {
      console.log('[AddressService.findAddressesByUserId] Request received', { userId });
      console.log('[AddressService.findAddressesByUserId] Querying addresses from database');
      const addressRecords = await this.db
        .select()
        .from(address)
        .where(eq(address.user_id, userId))
        .limit(filters?.limit ?? 20)
        .offset(filters?.offset ?? 0);
      console.log('[AddressService.findAddressesByUserId] Addresses found', { count: addressRecords.length });
      if (!addressRecords) {
        throw new HttpException(
          'No addresses found for this user',
          HttpStatus.NOT_FOUND,
        );
      }
      return addressRecords;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to find addresses', {
        cause: error,
      });
    }
  }
  async checkAddressByUserId(userId: string) {
    if (!userId) {
      console.log('[AddressService.checkAddressByUserId] User ID is missing');
      return new HttpException('User ID is required', HttpStatus.BAD_REQUEST);
    }
    try {
      console.log('[AddressService.checkAddressByUserId] Request received', { userId });
      console.log('[AddressService.checkAddressByUserId] Counting addresses from database');
      const [result] = await this.db
        .select({ value: count() })
        .from(address)
        .where(eq(address.user_id, userId));

      const addressCount = result.value;
      console.log('[AddressService.checkAddressByUserId] Address check completed', { addressCount, hasAddresses: addressCount > 0 });
      return { hasAddresses: addressCount > 0, count: addressCount };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to find addresses', {
        cause: error,
      });
    }
  }
  // find a address by address id
  async findAddressById(addressId: string) {
    if (!addressId) {
      console.log('[AddressService.findAddressById] Address ID is missing');
      return new HttpException(
        'Address ID is required',
        HttpStatus.BAD_REQUEST,
      );
    }
    try {
      console.log('[AddressService.findAddressById] Request received', { addressId });
      console.log('[AddressService.findAddressById] Querying address by ID from database');
      const [addressRecord] = await this.db
        .select()
        .from(address)
        .where(eq(address.id, addressId));
      console.log('[AddressService.findAddressById] Address found successfully', { addressId });
      return addressRecord;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to find addresses', {
        cause: error,
      });
    }
  }
  async findCompanyAddress(domain: string) {
    if (!domain) {
      console.log('[AddressService.findCompanyAddress] Domain is missing');
      return new HttpException('Domain is required', HttpStatus.BAD_REQUEST);
    }

    try {
      console.log('[AddressService.findCompanyAddress] Request received', { domain });
      console.log('[AddressService.findCompanyAddress] Resolving company ID from domain');
      const companyId = await this.resolveCompanyId(domain);
      const vendorUserId = await this.db.query.vendor.findFirst({
        where: eq(vendor.company_id, companyId),
        columns: { id: true },
        with: {
          user: {
            columns: { id: true },
          },
        },
      });
      if (!vendorUserId || !vendorUserId.user) {
        console.log('[AddressService.findCompanyAddress] Vendor not found for company', { companyId });
        throw new HttpException(
          'Vendor not found for the given company domain',
          HttpStatus.NOT_FOUND,
        );
      }
      console.log('[AddressService.findCompanyAddress] Querying addresses for company and vendor');
      const addressRecord = await this.db
        .select()
        .from(address)
        .where(
          and(
            eq(address.user_id, vendorUserId?.user.id || ''),
            eq(address.company_id, companyId),
          ),
        );
      console.log('[AddressService.findCompanyAddress] Company addresses retrieved', { count: addressRecord.length });
      return addressRecord;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to find addresses', {
        cause: error,
      });
    }
  }
  async createCompanyAddress(domain: string, addressData: CreateAddressDto) {
    try {
      console.log('[AddressService.createCompanyAddress] Request received', { domain });
      console.log('[AddressService.createCompanyAddress] Resolving company ID from domain');
      const companyId = await this.resolveCompanyId(domain);
      console.log('[AddressService.createCompanyAddress] Querying vendor record for company');
      const vendorRecord = await this.db.query.vendor.findFirst({
        where: eq(vendor.company_id, companyId),

        columns: { id: true },
        with: {
          company: {
            columns: { id: true, company_name: true },
          },
          user: {
            columns: { id: true, phone_number: true },
          },
        },
      });

      const newAddress = await this.db.transaction(async (tx) => {
        if (!vendorRecord || !vendorRecord.user || !vendorRecord.company) {
          console.log('[AddressService.createCompanyAddress] Vendor or company not found', { companyId });
          throw new HttpException(
            'Vendor not found for the given company domain',
            HttpStatus.NOT_FOUND,
          );
        }
        if (addressData.is_default) {
          console.log('[AddressService.createCompanyAddress] Setting previous default address to non-default');
          await tx
            .update(address)
            .set({ is_default: false })
            .where(eq(address.company_id, companyId));
        }
        console.log('[AddressService.createCompanyAddress] Inserting new company address into database');
        const [insertedAddress] = await tx
          .insert(address)
          .values({
            user_id: vendorRecord?.user.id || '',
            address_type: addressData.address_for,
            name: vendorRecord.company.company_name,
            number: vendorRecord.user.phone_number || '',
            address_line_1: addressData.address_line_1,
            address_line_2: addressData.address_line_2,
            street: addressData.street,
            city: addressData.city,
            state: addressData.state,
            postal_code: addressData.postal_code,
            country: addressData.country,
            is_default: addressData.is_default,
            landmark: addressData.landmark,
            company_id: companyId || '',
          })
          .returning()
          .catch((error) => {
            console.error('[AddressService.createCompanyAddress] Error inserting address:', error);
            throw new InternalServerErrorException('Failed to create address', {
              cause: error,
            });
          });
        console.log('[AddressService.createCompanyAddress] Company address created successfully', { addressId: insertedAddress.id });
        return insertedAddress;
      });
      console.log('newAddress ********', newAddress);
      return newAddress;
    } catch (error) {
      throw new InternalServerErrorException('Failed to find addresses', {
        cause: error,
      });
    }
  }
  // create address for user
  async createAddress(customerId: string, addressData: CreateAddressDto) {
    if (!customerId) {
      return new HttpException(
        'Customer ID is required',
        HttpStatus.BAD_REQUEST,
      );
    }
    console.log('addressData 7777777777777777777 \n', addressData);
    console.log('customerId', customerId);

    try {
      const newAddress = await this.db.transaction(async (tx) => {
        if (addressData.is_default) {
          await tx
            .update(address)
            .set({ is_default: false })
            .where(eq(address.user_id, customerId));
        }
        const [insertedAddress] = await tx
          .insert(address)
          .values({
            user_id: customerId,
            address_type: addressData.address_for,
            name: addressData.name,
            number: addressData.phone,
            address_line_1: addressData.address_line_1,
            address_line_2: addressData.address_line_2,
            street: addressData.street,
            city: addressData.city,
            state: addressData.state,
            postal_code: addressData.postal_code,
            country: addressData.country,
            is_default: addressData.is_default,
            landmark: addressData.landmark,
          })
          .returning()
          .catch((error) => {
            console.error('Error inserting address:', error);
            throw new InternalServerErrorException('Failed to create address', {
              cause: error,
            });
          });
        return insertedAddress;
      });
      console.log('newAddress ********', newAddress);
      return newAddress;
    } catch (error) {
      throw new InternalServerErrorException('Failed to find addresses', {
        cause: error,
      });
    }
  }
  // update address by address id
  async updateAddress(
    customerId: string,
    addressId: string,
    addressData: UpdateAddressDto,
  ) {
    if (!addressId && !customerId) {
      console.log('**************************** addressId ', addressId);
      console.log('**************************** customerId ', customerId);
      return new HttpException(
        'Address ID is required',
        HttpStatus.BAD_REQUEST,
      );
    }
    console.log('addressData   UPdate9999999999999999999 \n', addressData);
    try {
      await this.db.transaction(async (tx) => {
        if (addressData.is_default) {
          await tx
            .update(address)
            .set({ is_default: false })
            .where((eq(address.user_id, customerId), eq(address.id, addressId)))
            .returning()
            .catch((error) => {
              console.error('Error updating default address:', error);
              throw new InternalServerErrorException(
                'Failed to update default address',
                { cause: error },
              );
            });
        }
        const [updatedAddress] = await tx
          .update(address)
          .set({
            address_type: addressData.address_for,
            name: addressData.name,
            number: addressData.phone,
            address_line_1: addressData.address_line_1,
            address_line_2: addressData.address_line_2,
            street: addressData.street,
            city: addressData.city,
            state: addressData.state,
            postal_code: addressData.postal_code,
            country: addressData.country,
            is_default: addressData.is_default,
            landmark: addressData.landmark,
          })
          .where(eq(address.id, addressId))
          .returning()
          .catch((error) => {
            console.error('Error updating address:', error);
            throw new InternalServerErrorException('Failed to update address', {
              cause: error,
            });
          });
        console.log('adress upaadted');
        return updatedAddress;
      });
    } catch (error) {
      throw new InternalServerErrorException('Failed to find addresses', {
        cause: error,
      });
    }
  }
  // delete address by address id
  async deleteAddress(customerId: string, addressId: string) {
    if (!addressId && !customerId) {
      return new HttpException(
        'Address ID and Customer ID are required',
        HttpStatus.BAD_REQUEST,
      );
    }
    try {
      await this.db
        .delete(address)
        .where(and(eq(address.id, addressId), eq(address.user_id, customerId)))
        .catch((error) => {
          console.error('Error deleting address:', error);
          throw new InternalServerErrorException('Failed to delete address', {
            cause: error,
          });
        });
      console.log('Address deleted successfully');
      return { message: 'Address deleted successfully', status: HttpStatus.OK };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to find addresses', {
        cause: error,
      });
    }
  }
  async setDefaultAddress(customerId: string, addressId: string) {
    if (!customerId || !addressId) {
      return new HttpException(
        'Customer ID and Address ID are required',
        HttpStatus.BAD_REQUEST,
      );
    }
    try {
      await this.db.transaction(async (tx) => {
        await tx
          .update(address)
          .set({ is_default: false })
          .where(eq(address.user_id, customerId))
          .returning()
          .catch((error) => {
            console.error('Error updating default address:', error);
            throw new InternalServerErrorException(
              'Failed to update default address',
              { cause: error },
            );
          });
        const [updatedAddress] = await tx
          .update(address)
          .set({ is_default: true })
          .where(eq(address.id, addressId))
          .returning()
          .catch((error) => {
            console.error('Error setting default address:', error);
            throw new InternalServerErrorException(
              'Failed to set default address',
              { cause: error },
            );
          });
        return updatedAddress;
      });
    } catch (error) {
      throw new InternalServerErrorException('Failed to set default address', {
        cause: error,
      });
    }
  }
}
