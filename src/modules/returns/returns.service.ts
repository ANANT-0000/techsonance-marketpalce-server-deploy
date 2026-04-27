import { Injectable, Inject, NotFoundException, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { CreateReturnDto } from './dto/create-return.dto';
import { eq, and } from 'drizzle-orm';
import { DRIZZLE, type DrizzleService } from 'src/drizzle/drizzle.module';
import { CompanyService } from '../company/company.service';
import { order_items, product_images, refunds, return_requests } from 'src/drizzle/schema';
import { UpdateReturnDto } from './dto/update-return.dto';
import { OrderStatus, ReturnStatus, ReturnType } from 'src/drizzle/types/types';
import { UploadToCloudService } from 'src/utils/upload-to-cloud/upload-to-cloud.service';
import { RefundsService } from '../refunds/refunds.service';

@Injectable()
export class ReturnsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleService, private uploadToCloudService: UploadToCloudService, private readonly refundsService: RefundsService
    , private readonly companyService: CompanyService
  ) { }

  async createReturnRequest(userId: string, dto: CreateReturnDto, files: { evidence_images?: Express.Multer.File[] }, domain: string) {
    try {
      console.log('Creating return request for user', userId, 'with data', dto);
      const company_id = await this.companyService.find(domain);
      console.log('Company ID', company_id);
      const orderItem = await this.db.query.order_items.findFirst({
        where: eq(order_items.id, dto.order_item_id),
        with: {
          order: true,
        }
      }).catch((error) => {
        console.log('Failed to find order item', error);
        throw new InternalServerErrorException('Failed to find order item', {
          cause: error
        });
      });

      if (!orderItem || !orderItem.order) throw new NotFoundException('Order item not found');

      const existingReturn = await this.db.query.return_requests.findFirst({
        where: eq(return_requests.order_item_id, dto.order_item_id)
      }).catch((error) => {
        console.log('Failed to find return request', error);
        throw new InternalServerErrorException('Failed to find return request', {
          cause: error
        });
      });

      if (existingReturn) {
        console.log('A return or replacement request already exists for this item.')
        throw new BadRequestException('A return or replacement request already exists for this item.');
      }
      const finalResults: { url: string }[] = [];
      if (files?.evidence_images && files.evidence_images.length > 0) {
        const evidence_images = await this.uploadToCloudService.uploadEvidenceFiles(
          files.evidence_images as Express.Multer.File[],
        );
        finalResults.push(
          ...evidence_images.map((res) => ({
            url: res.secure_url,
          })),
        );
      }
      console.log('finalResults', finalResults);
      console.log('create return request')
      const [newReturn] = await this.db.insert(return_requests).values({
        order_item_id: dto.order_item_id,
        user_id: userId,
        company_id: company_id,
        type: dto.type,
        status: ReturnStatus.PENDING,
        reason: dto.reason,
        customer_note: dto.customer_note,
        evidence_images: finalResults,
      }).returning().catch((error) => {
        console.log('Failed to make return request', error);
        throw new InternalServerErrorException('Failed to make return request', {
          cause: error
        });
      });
      console.log('created return request', newReturn)
      return newReturn;
    } catch (error) {
      console.log('Failed to create return request', error);
      throw new InternalServerErrorException('Failed to create return request', {
        cause: error
      });
    }
  }

  async getCustomerReturns(userId: string, domain: string) {
    try {

      const companyId = await this.companyService.find(domain);
      const customerReturnsList = await this.db.query.return_requests.findMany({
        where: and(eq(return_requests.user_id, userId), eq(return_requests.company_id, companyId)),
        orderBy: (returns, { desc }) => [desc(returns.created_at)],
      }).catch((error) => {
        console.log('Failed to find return requests', error);
        throw new InternalServerErrorException('Failed to find return requests', {
          cause: error
        });
      })
      return customerReturnsList;
    } catch (error) {
      console.log('Failed to get customer returns', error);
      throw new InternalServerErrorException('Failed to get customer returns', {
        cause: error
      });
    }
  }

  // --- VENDOR ACTIONS ---

  async getVendorReturns(domain: string) {
    try {
      const companyId = await this.companyService.find(domain);
      const vendorReturnsList = await this.db.query.return_requests.findMany({
        with: {
          user: {
            columns: {
              id: true,
              first_name: true,
              last_name: true,
              email: true,
              phone_number: true,
            }
          },
          orderItem: {
            with: {
              order: {
                columns: {
                  id: true,
                },
                with: {
                  address: {
                    columns: {
                      id: true,
                      // address_line_1: true,
                      // address_line_2: true,
                      // city: true,
                      state: true,
                      country: true,
                      postal_code: true,
                    }
                  }
                }
              },
              variant: {
                columns: {
                  variant_name: true,
                  sku: true,
                  price: true,
                },
                with: {
                  images: {
                    where: eq(product_images.is_primary, true),
                  },
                }
              },
            }
          }
        },
        where: eq(return_requests.company_id, companyId),
        orderBy: (returns, { desc }) => [desc(returns.created_at)],
      }).catch((error) => {
        console.log('Failed to find return requests', error);
        throw new InternalServerErrorException('Failed to find return requests', {
          cause: error
        });
      })
      return vendorReturnsList;
    } catch (error) {
      console.log('Failed to get vendor returns', error);
      throw new InternalServerErrorException('Failed to get vendor returns', {
        cause: error
      });
    }
  }

  async getVendorReturnById(returnId: string, domain: string) {
    try {
      const companyId = await this.companyService.find(domain);
      const requestDetails = await this.db.query.return_requests.findFirst({
        where: and(
          eq(return_requests.id, returnId),
          eq(return_requests.company_id, companyId)
        ),
        with: {
          user: {
            columns: {
              id: true,
              first_name: true,
              last_name: true,
              email: true,
              phone_number: true,
            }
          },
          orderItem: {
            with: {
              order: {
                columns: {
                  id: true,
                },
                with: {
                  address: {
                    columns: {
                      id: true,
                      address_line_1: true,
                      address_line_2: true,
                      city: true,
                      state: true,
                      country: true,
                      postal_code: true,
                    }
                  }
                }
              },
              variant: {
                with: {
                  images: {
                    where: eq(product_images.is_primary, true),
                  },
                }
              },
            }
          }
        }
      }).catch((error) => {
        throw new InternalServerErrorException('Failed to find return request', { cause: error });
      });

      if (!requestDetails) throw new NotFoundException('Return request not found');

      return requestDetails;
    } catch (error) {
      throw new InternalServerErrorException('Failed to fetch return details', { cause: error });
    }
  }

  async updateReturnStatus(returnId: string, domain: string, dto: UpdateReturnDto) {
    console.log("return status", dto)
    const companyId = await this.companyService.find(domain);
    const request = await this.db.select().from(return_requests).where(and(eq(return_requests.id, returnId), eq(return_requests.company_id, companyId))).catch((error) => {
      console.log('Failed to find return request', error);
      throw new InternalServerErrorException('Failed to find return request', {
        cause: error
      });
    });

    if (!request) throw new NotFoundException('Return request not found or unauthorized');

    if ((dto.status === ReturnStatus.REJECTED || dto.status === ReturnStatus.QC_FAILED) && !dto.store_owner_note) {
      throw new BadRequestException('A note is required when rejecting or failing a quality check.');
    }

    const [updatedReturn] = await this.db.update(return_requests)
      .set({
        status: dto.status,
        store_owner_note: dto.store_owner_note,
      })
      .where(eq(return_requests.id, returnId))
      .returning().catch((error) => {
        console.log('Failed to update return status', error);
        throw new InternalServerErrorException('Failed to update return status', {
          cause: error
        });
      });
    console.log("updated return", updatedReturn)
    if (!updatedReturn || !updatedReturn.order_item_id) {
      throw new InternalServerErrorException('Failed to update return status');
    }
    if (updatedReturn.type === ReturnType.RETURN) {
      const [updatedOrderItem] = await this.db.update(order_items)
        .set({
          order_status: OrderStatus.RETURNED,
        })
        .where(eq(order_items.id, updatedReturn.order_item_id)).returning()
        .catch((error) => {
          console.log('Failed to update order item status', error);
          throw new InternalServerErrorException('Failed to update order item status', {
            cause: error
          });
        });
      if (!updatedOrderItem.order_id) {
        throw new InternalServerErrorException('Failed to update order item status');
      }
      await this.refundsService.initiateRefund({
        orderId: updatedOrderItem.order_id,
        orderItemId: updatedReturn.order_item_id,
        reason: updatedReturn.reason,
        domain: updatedReturn.company_id,
      }).catch((error) => {
        console.log('Failed to insert refund', error);
        throw new InternalServerErrorException('Failed to insert refund', {
          cause: error
        });
      });
    }
    if (updatedReturn.type === ReturnType.REFUND) {
      await this.db.update(order_items)
        .set({
          order_status: OrderStatus.REFUNDED,
        })
        .where(eq(order_items.id, updatedReturn.order_item_id))
        .catch((error) => {
          console.log('Failed to update order item status', error);
          throw new InternalServerErrorException('Failed to update order item status', {
            cause: error
          });
        });
    }
    if (updatedReturn.type === ReturnType.REPLACEMENT) {
      await this.db.update(order_items)
        .set({
          order_status: OrderStatus.REPLACED,
        })
        .where(eq(order_items.id, updatedReturn.order_item_id))
        .catch((error) => {
          console.log('Failed to update order item status', error);
          throw new InternalServerErrorException('Failed to update order item status', {
            cause: error
          });
        });
    }
  }
}