import { Inject, Injectable } from '@nestjs/common';
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
    const [addressRecords] = await this.db
      .select(this.getAddressColumns())
      .from(address)
      .where(eq(address.user_id, userId));
    return addressRecords;
  }
  // find a address by address id
  async findAddressById(addressId: string) {
    const [addressRecord] = await this.db
      .select(this.getAddressColumns())
      .from(address)
      .where(eq(address.id, addressId));
    return addressRecord;
  }
  // create address for user
  async createAddressForUser(userId: string, addressData: Address) {
    const [newAddress] = await this.db
      .insert(address)
      .values(addressData)
      .returning();
    return newAddress;
  }
  // update address by address id
  async updateAddress(addressId: string, addressData: Address) {
    const [updatedAddress] = await this.db
      .update(address)
      .set(addressData)
      .where(eq(address.id, addressId))
      .returning();
    return updatedAddress;
  }
  // delete address by address id
  async deleteAddress(addressId: string) {
    await this.db.delete(address).where(eq(address.id, addressId));
    return { message: 'Address deleted successfully' };
  }
}
