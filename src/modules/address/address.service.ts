import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { eq, getTableColumns, InferSelectModel } from 'drizzle-orm';
import { DRIZZLE } from 'src/drizzle/drizzle.module';
import { address } from 'src/drizzle/schema';
import { type DrizzleDB } from 'src/drizzle/types/drizzle';
type Address = InferSelectModel<typeof address>;
@Injectable()
export class AddressService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  getAddressColumns() {
    const { company_id, ...columns } = getTableColumns(address);
    return columns;
  }
  // find addresses by user id
  async findAddressesByUserId(userId: string) {
    if (!userId) {
      return new HttpException('User ID is required', HttpStatus.BAD_REQUEST);
    }
    try {
      const [addressRecords] = await this.db
        .select(this.getAddressColumns())
        .from(address)
        .where(eq(address.user_id, userId));
      return addressRecords;
    } catch (error) {
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
        .select(this.getAddressColumns())
        .from(address)
        .where(eq(address.id, addressId));
      return addressRecord;
    } catch (error) {
      throw new InternalServerErrorException('Failed to find addresses', {
        cause: error,
      });
    }
  }
  // create address for user
  async createAddressForUser(userId: string, addressData: Address) {
    if (!userId) {
      return new HttpException('User ID is required', HttpStatus.BAD_REQUEST);
    }
    try {
      const [newAddress] = await this.db
        .insert(address)
        .values(addressData)
        .returning();
      return newAddress;
    } catch (error) {
      throw new InternalServerErrorException('Failed to find addresses', {
        cause: error,
      });
    }
  }
  // update address by address id
  async updateAddress(addressId: string, addressData: Address) {
    if (!addressId) {
      return new HttpException(
        'Address ID is required',
        HttpStatus.BAD_REQUEST,
      );
    }
    try {
      const [updatedAddress] = await this.db
        .update(address)
        .set(addressData)
        .where(eq(address.id, addressId))
        .returning();
      return updatedAddress;
    } catch (error) {
      throw new InternalServerErrorException('Failed to find addresses', {
        cause: error,
      });
    }
  }
  // delete address by address id
  async deleteAddress(addressId: string) {
    if (!addressId) {
      return new HttpException(
        'Address ID is required',
        HttpStatus.BAD_REQUEST,
      );
    }
    try {
      await this.db.delete(address).where(eq(address.id, addressId));
      return { message: 'Address deleted successfully', status: HttpStatus.OK };
    } catch (error) {
      throw new InternalServerErrorException('Failed to find addresses', {
        cause: error,
      });
    }
  }
}
