import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { AddressErrorKeyEnum } from './constants/address.enums';
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
      return new HttpException(
        AddressErrorKeyEnum.USER_ID_REQUIRED,
        HttpStatus.BAD_REQUEST,
      );
    }
    try {
      const addressRecords = await this.db
        .select()
        .from(address)
        .where(eq(address.user_id, userId))
        .limit(filters?.limit ?? 20)
        .offset(filters?.offset ?? 0);
      if (!addressRecords) {
        throw new HttpException(
          AddressErrorKeyEnum.NO_ADDRESSES_FOUND_FOR_THIS_USER,
          HttpStatus.NOT_FOUND,
        );
      }
      return addressRecords;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException(
        AddressErrorKeyEnum.FAILED_TO_FIND,
        {
          cause: error,
        },
      );
    }
  }
  async checkAddressByUserId(userId: string) {
    if (!userId) {
      return new HttpException(
        AddressErrorKeyEnum.USER_ID_REQUIRED,
        HttpStatus.BAD_REQUEST,
      );
    }
    try {
      const [result] = await this.db
        .select({ value: count() })
        .from(address)
        .where(eq(address.user_id, userId));

      const addressCount = result.value;
      return { hasAddresses: addressCount > 0, count: addressCount };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException(
        AddressErrorKeyEnum.FAILED_TO_FIND,
        {
          cause: error,
        },
      );
    }
  }
  // find a address by address id
  async findAddressById(addressId: string) {
    if (!addressId) {
      return new HttpException(
        AddressErrorKeyEnum.ADDRESS_ID_IS_REQUIRED,
        HttpStatus.BAD_REQUEST,
      );
    }
    try {
      const [addressRecord] = await this.db
        .select()
        .from(address)
        .where(eq(address.id, addressId));
      return addressRecord;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException(
        AddressErrorKeyEnum.FAILED_TO_FIND,
        {
          cause: error,
        },
      );
    }
  }
  async findCompanyAddress(domain: string) {
    if (!domain) {
      return new HttpException(
        AddressErrorKeyEnum.DOMAIN_REQUIRED,
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
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
        throw new HttpException(
          AddressErrorKeyEnum.VENDOR_NOT_FOUND_FOR_THE_GIVEN_COMPANY_DOMAIN,
          HttpStatus.NOT_FOUND,
        );
      }
      const addressRecord = await this.db
        .select()
        .from(address)
        .where(
          and(
            eq(address.user_id, vendorUserId?.user.id || ''),
            eq(address.company_id, companyId),
          ),
        );
      return addressRecord;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException(
        AddressErrorKeyEnum.FAILED_TO_FIND,
        {
          cause: error,
        },
      );
    }
  }
  async createCompanyAddress(domain: string, addressData: CreateAddressDto) {
    try {
      const companyId = await this.resolveCompanyId(domain);
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
          throw new HttpException(
            AddressErrorKeyEnum.VENDOR_NOT_FOUND_FOR_THE_GIVEN_COMPANY_DOMAIN,
            HttpStatus.NOT_FOUND,
          );
        }
        if (addressData.is_default) {
          await tx
            .update(address)
            .set({ is_default: false })
            .where(eq(address.company_id, companyId));
        }
        const [insertedAddress] = await tx
          .insert(address)
          .values({
            user_id: vendorRecord?.user.id || '',
            address_type: addressData.address_for,
            name: vendorRecord.company.company_name,
            number: vendorRecord.user.phone_number || '',
            address_line_1: addressData.address_line_1,

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
            throw new InternalServerErrorException(
              AddressErrorKeyEnum.FAILED_TO_CREATE,
              {
                cause: error,
              },
            );
          });
        return insertedAddress;
      });
      return newAddress;
    } catch (error) {
      throw new InternalServerErrorException(
        AddressErrorKeyEnum.FAILED_TO_FIND,
        {
          cause: error,
        },
      );
    }
  }
  // create address for user
  async createAddress(customerId: string, addressData: CreateAddressDto) {
    if (!customerId) {
      return new HttpException(
        AddressErrorKeyEnum.CUSTOMER_ID_IS_REQUIRED,
        HttpStatus.BAD_REQUEST,
      );
    }

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
            throw new InternalServerErrorException(
              AddressErrorKeyEnum.FAILED_TO_CREATE,
              {
                cause: error,
              },
            );
          });
        return insertedAddress;
      });
      return newAddress;
    } catch (error) {
      throw new InternalServerErrorException(
        AddressErrorKeyEnum.FAILED_TO_FIND,
        {
          cause: error,
        },
      );
    }
  }
  // update address by address id
  async updateAddress(
    customerId: string,
    addressId: string,
    addressData: UpdateAddressDto,
  ) {
    if (!addressId && !customerId) {
      return new HttpException(
        AddressErrorKeyEnum.ADDRESS_ID_IS_REQUIRED,
        HttpStatus.BAD_REQUEST,
      );
    }
    try {
      await this.db.transaction(async (tx) => {
        if (addressData.is_default) {
          await tx
            .update(address)
            .set({ is_default: false })
            .where((eq(address.user_id, customerId), eq(address.id, addressId)))
            .returning()
            .catch((error) => {
              throw new InternalServerErrorException(
                AddressErrorKeyEnum.FAILED_TO_UPDATE_DEFAULT_ADDRESS,
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
            throw new InternalServerErrorException(
              AddressErrorKeyEnum.FAILED_TO_UPDATE,
              {
                cause: error,
              },
            );
          });
        return updatedAddress;
      });
    } catch (error) {
      throw new InternalServerErrorException(
        AddressErrorKeyEnum.FAILED_TO_FIND,
        {
          cause: error,
        },
      );
    }
  }
  // delete address by address id
  async deleteAddress(customerId: string, addressId: string) {
    if (!addressId && !customerId) {
      return new HttpException(
        AddressErrorKeyEnum.ADDRESS_ID_AND_CUSTOMER_ID_ARE_REQUIRED,
        HttpStatus.BAD_REQUEST,
      );
    }
    try {
      await this.db
        .delete(address)
        .where(and(eq(address.id, addressId), eq(address.user_id, customerId)))
        .catch((error) => {
          throw new InternalServerErrorException(
            AddressErrorKeyEnum.FAILED_TO_DELETE,
            {
              cause: error,
            },
          );
        });
      return { message: 'Address deleted successfully', status: HttpStatus.OK };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException(
        AddressErrorKeyEnum.FAILED_TO_FIND,
        {
          cause: error,
        },
      );
    }
  }
  async setDefaultAddress(customerId: string, addressId: string) {
    if (!customerId || !addressId) {
      return new HttpException(
        AddressErrorKeyEnum.CUSTOMER_ID_AND_ADDRESS_ID_ARE_REQUIRED,
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
            throw new InternalServerErrorException(
              AddressErrorKeyEnum.FAILED_TO_UPDATE_DEFAULT_ADDRESS,
              { cause: error },
            );
          });
        const [updatedAddress] = await tx
          .update(address)
          .set({ is_default: true })
          .where(eq(address.id, addressId))
          .returning()
          .catch((error) => {
            throw new InternalServerErrorException(
              AddressErrorKeyEnum.FAILED_TO_SET_DEFAULT,
              { cause: error },
            );
          });
        return updatedAddress;
      });
    } catch (error) {
      throw new InternalServerErrorException(
        AddressErrorKeyEnum.FAILED_TO_SET_DEFAULT,
        {
          cause: error,
        },
      );
    }
  }
}
