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
  async findAddressesByUserId(userId: string) {
    if (!userId) {
      console.log('**************************** user ', userId);
      return new HttpException('User ID is required', HttpStatus.BAD_REQUEST);
    }
    try {
      const addressRecords = await this.db
        .select()
        .from(address)
        .where(eq(address.user_id, userId));
      console.log('addressRecords ******************* \n', addressRecords);
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
      console.log('**************************** user ', userId);
      return new HttpException('User ID is required', HttpStatus.BAD_REQUEST);
    }
    try {
      const [result] = await this.db
        .select({ value: count() })
        .from(address)
        .where(eq(address.user_id, userId));

      const addressCount = result.value;
      console.log(result);
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
      return new HttpException(
        'Address ID is required',
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
      throw new InternalServerErrorException('Failed to find addresses', {
        cause: error,
      });
    }
  }
  async findCompanyAddress(domain: string) {
    if (!domain) {
      return new HttpException('Domain is required', HttpStatus.BAD_REQUEST);
    }

    const companyId = await this.resolveCompanyId(domain);
    try {
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
          'Vendor not found for the given company domain',
          HttpStatus.NOT_FOUND,
        );
      }

      const addressRecord= await this.db
        .select()
        .from(address)
        .where(
          and(
            eq(address.user_id, vendorUserId?.user.id || ''),
            eq(address.company_id, companyId),
          ),
        );
      console.log('founded address', addressRecord);
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
      console.log('recived', addressData);
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
            'Vendor not found for the given company domain',
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
