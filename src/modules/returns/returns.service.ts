import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { CreateReturnDto } from './dto/create-return.dto';
import { eq, and } from 'drizzle-orm';
import { DRIZZLE, type DrizzleService } from 'src/drizzle/drizzle.module';
import { CompanyService } from '../company/company.service';
import {
  inventory,
  order_items,
  product_images,
  refunds,
  return_requests,
  shipping_details,
} from 'src/drizzle/schema';
import { orders, user } from 'src/drizzle/schema';
import { UpdateReturnDto } from './dto/update-return.dto';
import { OrderStatus, ReturnStatus, ReturnType } from 'src/drizzle/types/types';
import { UploadToCloudService } from 'src/utils/upload-to-cloud/upload-to-cloud.service';
import { RefundsService } from '../refunds/refunds.service';
import { InventoryService } from '../inventory/inventory.service';
import { MailService } from 'src/common/services/mail/mail.service';

// ── Valid transitions per return type ──────────────────────────────────────
// Prevents arbitrary status jumps (e.g. PENDING → QC_PASSED directly)
const VALID_TRANSITIONS: Record<ReturnType, Record<ReturnStatus, ReturnStatus[]>> = {
  [ReturnType.RETURN]: {
    [ReturnStatus.PENDING]: [ReturnStatus.APPROVED, ReturnStatus.REJECTED],
    [ReturnStatus.APPROVED]: [ReturnStatus.IN_TRANSIT],
    [ReturnStatus.IN_TRANSIT]: [ReturnStatus.DELIVERED],
    [ReturnStatus.DELIVERED]: [ReturnStatus.QC_PASSED, ReturnStatus.QC_FAILED],
    [ReturnStatus.QC_PASSED]: [ReturnStatus.COMPLETED],
    [ReturnStatus.QC_FAILED]: [],
    [ReturnStatus.REJECTED]: [],
    [ReturnStatus.COMPLETED]: [],
  },
  [ReturnType.REPLACEMENT]: {
    [ReturnStatus.PENDING]: [ReturnStatus.APPROVED, ReturnStatus.REJECTED],
    [ReturnStatus.APPROVED]: [ReturnStatus.IN_TRANSIT],
    [ReturnStatus.IN_TRANSIT]: [ReturnStatus.DELIVERED],
    [ReturnStatus.DELIVERED]: [ReturnStatus.QC_PASSED, ReturnStatus.QC_FAILED],
    [ReturnStatus.QC_PASSED]: [ReturnStatus.COMPLETED],
    [ReturnStatus.QC_FAILED]: [],
    [ReturnStatus.REJECTED]: [],
    [ReturnStatus.COMPLETED]: [],
  },
  [ReturnType.REFUND]: {
    // Direct refund — no physical return needed
    [ReturnStatus.PENDING]: [ReturnStatus.APPROVED, ReturnStatus.REJECTED],
    [ReturnStatus.APPROVED]: [ReturnStatus.COMPLETED],
    [ReturnStatus.IN_TRANSIT]: [],
    [ReturnStatus.DELIVERED]: [],
    [ReturnStatus.QC_PASSED]: [],
    [ReturnStatus.QC_FAILED]: [],
    [ReturnStatus.REJECTED]: [],
    [ReturnStatus.COMPLETED]: [],
  },
};

@Injectable()
export class ReturnsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleService,
    private readonly uploadToCloudService: UploadToCloudService,
    private readonly refundsService: RefundsService,
    private readonly inventoryService: InventoryService,
    private readonly companyService: CompanyService,
    private readonly mailService: MailService,
  ) { }

  // ── Create return request ─────────────────────────────────────────────────
  async createReturnRequest(
    userId: string,
    dto: CreateReturnDto,
    files: { evidence_images?: Express.Multer.File[] },
    domain: string,
  ) {
    try {
      const company_id = await this.companyService.find(domain);

      const orderItem = await this.db.query.order_items
        .findFirst({
          where: eq(order_items.id, dto.order_item_id),
          with: { order: true },
        })
        .catch((error) => {
          throw new InternalServerErrorException(
            'Failed to find order item',
            { cause: error },
          );
        });

      if (!orderItem || !orderItem.order) {
        throw new NotFoundException('Order item not found');
      }

      // Only delivered items can be returned/replaced/refunded
      if (orderItem.order_status !== OrderStatus.DELIVERED) {
        throw new BadRequestException(
          `Cannot raise a return request for an item with status: ${orderItem.order_status}. Item must be delivered first.`,
        );
      }

      const existingReturn = await this.db.query.return_requests
        .findFirst({
          where: eq(return_requests.order_item_id, dto.order_item_id),
        })
        .catch((error) => {
          throw new InternalServerErrorException(
            'Failed to check existing return request',
            { cause: error },
          );
        });

      if (existingReturn) {
        throw new BadRequestException(
          'A return or replacement request already exists for this item.',
        );
      }

      // Upload evidence images if provided
      const finalResults: { url: string }[] = [];
      if (files?.evidence_images && files.evidence_images.length > 0) {
        const uploaded = await this.uploadToCloudService.uploadEvidenceFiles(
          files.evidence_images,
        );
        finalResults.push(...uploaded.map((res) => ({ url: res.secure_url })));
      }

      const [newReturn] = await this.db
        .insert(return_requests)
        .values({
          order_item_id: dto.order_item_id,
          user_id: userId,
          company_id,
          type: dto.type,
          status: ReturnStatus.PENDING,
          reason: dto.reason,
          customer_note: dto.customer_note,
          evidence_images: finalResults,
        })
        .returning()
        .catch((error) => {
          throw new InternalServerErrorException(
            'Failed to create return request',
            { cause: error },
          );
        });

      // Notify vendor (via mail) that a new return request has been raised
      await this._notifyCustomer(
        orderItem.order.user_id ?? userId,
        'Return Request Received',
        `<p>Your ${dto.type} request has been received and is under review.</p>
         <p><strong>Reason:</strong> ${dto.reason}</p>
         <p>We will update you shortly.</p>`,
      );

      return newReturn;
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException ||
        error instanceof InternalServerErrorException
      ) {
        throw error;
      }
      throw new InternalServerErrorException(
        'Failed to create return request',
        { cause: error },
      );
    }
  }

  // ── Get customer returns ──────────────────────────────────────────────────
  async getCustomerReturns(userId: string, domain: string) {
    try {
      const companyId = await this.companyService.find(domain);

      return await this.db.query.return_requests
        .findMany({
          where: and(
            eq(return_requests.user_id, userId),
            eq(return_requests.company_id, companyId),
          ),
          orderBy: (returns, { desc }) => [desc(returns.created_at)],
        })
        .catch((error) => {
          throw new InternalServerErrorException(
            'Failed to find return requests',
            { cause: error },
          );
        });
    } catch (error) {
      if (error instanceof InternalServerErrorException) throw error;
      throw new InternalServerErrorException(
        'Failed to get customer returns',
        { cause: error },
      );
    }
  }

  // ── Get vendor returns list ───────────────────────────────────────────────
  async getVendorReturns(domain: string) {
    try {
      const companyId = await this.companyService.find(domain);

      return await this.db.query.return_requests
        .findMany({
          with: {
            user: {
              columns: {
                id: true,
                first_name: true,
                last_name: true,
                email: true,
                phone_number: true,
              },
            },
            orderItem: {
              with: {
                order: {
                  columns: { id: true },
                  with: {
                    address: {
                      columns: {
                        id: true,
                        state: true,
                        country: true,
                        postal_code: true,
                      },
                    },
                  },
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
                  },
                },
              },
            },
          },
          where: eq(return_requests.company_id, companyId),
          orderBy: (returns, { desc }) => [desc(returns.created_at)],
        })
        .catch((error) => {
          throw new InternalServerErrorException(
            'Failed to find return requests',
            { cause: error },
          );
        });
    } catch (error) {
      if (error instanceof InternalServerErrorException) throw error;
      throw new InternalServerErrorException(
        'Failed to get vendor returns',
        { cause: error },
      );
    }
  }

  // ── Get single vendor return by ID ────────────────────────────────────────
  async getVendorReturnById(returnId: string, domain: string) {
    try {
      const companyId = await this.companyService.find(domain);

      const requestDetails = await this.db.query.return_requests
        .findFirst({
          where: and(
            eq(return_requests.id, returnId),
            eq(return_requests.company_id, companyId),
          ),
          with: {
            user: {
              columns: {
                id: true,
                first_name: true,
                last_name: true,
                email: true,
                phone_number: true,
              },
            },
            orderItem: {
              with: {
                order: {
                  columns: { id: true },
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
                      },
                    },
                  },
                },
                variant: {
                  with: {
                    images: {
                      where: eq(product_images.is_primary, true),
                    },
                  },
                },
              },
            },
          },
        })
        .catch((error) => {
          throw new InternalServerErrorException(
            'Failed to find return request',
            { cause: error },
          );
        });

      if (!requestDetails) {
        throw new NotFoundException('Return request not found');
      }

      return requestDetails;
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof InternalServerErrorException
      ) {
        throw error;
      }
      throw new InternalServerErrorException(
        'Failed to fetch return details',
        { cause: error },
      );
    }
  }

  // ── Update return status — main state machine ─────────────────────────────
  async updateReturnStatus(
    returnId: string,
    domain: string,
    dto: UpdateReturnDto,
  ) {
    try {
      const companyId = await this.companyService.find(domain);

      // ── Fetch the full return request ──────────────────────────────────
      const [returnRequest] = await this.db
        .select()
        .from(return_requests)
        .where(
          and(
            eq(return_requests.id, returnId),
            eq(return_requests.company_id, companyId),
          ),
        )
        .catch((error) => {
          throw new InternalServerErrorException(
            'Failed to find return request',
            { cause: error },
          );
        });

      if (!returnRequest) {
        throw new NotFoundException('Return request not found or unauthorized');
      }

      const currentStatus = returnRequest.status as ReturnStatus;
      const newStatus = dto.status as ReturnStatus;
      const returnType = returnRequest.type as ReturnType;

      // ── Guard: already in a terminal state ────────────────────────────
      const terminalStatuses: ReturnStatus[] = [
        ReturnStatus.COMPLETED,
        ReturnStatus.REJECTED,
        ReturnStatus.QC_FAILED,
      ];
      if (terminalStatuses.includes(currentStatus)) {
        throw new BadRequestException(
          `Return request is already in a terminal state: ${currentStatus}. No further updates allowed.`,
        );
      }

      // ── Guard: validate transition is allowed ─────────────────────────
      const allowedNext = VALID_TRANSITIONS[returnType]?.[currentStatus] ?? [];
      if (!allowedNext.includes(newStatus)) {
        throw new BadRequestException(
          `Invalid status transition for ${returnType}: ${currentStatus} → ${newStatus}. ` +
          `Allowed next statuses: [${allowedNext.join(', ') || 'none'}]`,
        );
      }

      // ── Guard: note required for rejection/QC failure ─────────────────
      if (
        (newStatus === ReturnStatus.REJECTED ||
          newStatus === ReturnStatus.QC_FAILED) &&
        !dto.store_owner_note?.trim()
      ) {
        throw new BadRequestException(
          'A store owner note is required when rejecting or failing a quality check.',
        );
      }

      // ── Fetch the associated order item ───────────────────────────────
      const [orderItem] = await this.db
        .select({
          id: order_items.id,
          order_id: order_items.order_id,
          product_variant_id: order_items.product_variant_id,
          quantity: order_items.quantity,
          price: order_items.price,
          company_id: order_items.company_id,
        })
        .from(order_items)
        .where(eq(order_items.id, returnRequest.order_item_id))
        .limit(1);



      // ── Fetch customer email for notifications ─────────────────────────
      const customerEmail = await this._getCustomerEmailByUserId(
        returnRequest.user_id,
      );

      // ── Execute status-specific side effects ──────────────────────────
      await this.db.transaction(async (tx) => {
        // 1. Persist the status update first
        await tx
          .update(return_requests)
          .set({
            status: newStatus,
            store_owner_note: dto.store_owner_note ?? returnRequest.store_owner_note,
            tracking_id: dto.tracking_id ?? returnRequest.tracking_id,
          })
          .where(eq(return_requests.id, returnId))
          .catch((error) => {
            throw new InternalServerErrorException(
              'Failed to update return status',
              { cause: error },
            );
          });
        if (!orderItem || !orderItem.order_id || !orderItem.product_variant_id || !orderItem.company_id) {
          throw new InternalServerErrorException(
            'Order item data is incomplete',
          );
        }
        // 2. Run side effects based on type + newStatus
        await this._handleSideEffects({
          tx: tx as DrizzleService,
          returnRequest,
          orderItem,
          returnType,
          newStatus,
          companyId,
          customerEmail,
          dto,
        });
      });

      return {
        message: `Return request updated to ${newStatus}`,
        returnId,
        type: returnType,
        previousStatus: currentStatus,
        newStatus,
      };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException ||
        error instanceof InternalServerErrorException
      ) {
        throw error;
      }
      throw new InternalServerErrorException(
        'Failed to update return status',
        { cause: error },
      );
    }
  }

  // ── Side effects state machine ────────────────────────────────────────────
  private async _handleSideEffects({
    tx,
    returnRequest,
    orderItem,
    returnType,
    newStatus,
    companyId,
    customerEmail,
    dto,
  }: {
    tx: DrizzleService;
    returnRequest: typeof return_requests.$inferSelect;
    orderItem: {
      id: string;
      order_id: string;
      product_variant_id: string;
      quantity: number;
      price: string;
      company_id: string | null;
    };
    returnType: ReturnType;
    newStatus: ReturnStatus;
    companyId: string;
    customerEmail: string | null;
    dto: UpdateReturnDto;
  }) {
    // ════════════════════════════════════════════
    //  RETURN type side effects
    // ════════════════════════════════════════════
    if (returnType === ReturnType.RETURN) {
      switch (newStatus) {
        case ReturnStatus.APPROVED: {
          // Inform customer to ship the item back
          if (customerEmail) {
            await this.mailService.sendEmail(
              customerEmail,
              'Return Request Approved — Please Send Item Back',
              `<div style="font-family:sans-serif;max-width:600px;margin:auto">
                <h2>Return Approved</h2>
                <p>Your return request has been approved.</p>
                <p>Please pack the item securely and ship it back to us using the address provided in your original order details.</p>
                <p>Once we receive and inspect the item, your refund will be processed within 3–5 business days.</p>
              </div>`,
            );
          }
          break;
        }

        case ReturnStatus.IN_TRANSIT: {
          // Customer has shipped the item back — acknowledge receipt of shipment
          if (customerEmail) {
            await this.mailService.sendEmail(
              customerEmail,
              'We\'ve Confirmed Your Return Shipment',
              `<div style="font-family:sans-serif;max-width:600px;margin:auto">
                <h2>Return Shipment Confirmed</h2>
                <p>We have marked your return as in transit.</p>
                ${dto.tracking_id ? `<p><strong>Your tracking ID:</strong> ${dto.tracking_id}</p>` : ''}
                <p>We will notify you once the item reaches us and passes quality inspection.</p>
              </div>`,
            );
          }
          break;
        }

        case ReturnStatus.DELIVERED: {
          // Item physically received by vendor — waiting for QC
          if (customerEmail) {
            await this.mailService.sendEmail(
              customerEmail,
              'Returned Item Received — Quality Check in Progress',
              `<div style="font-family:sans-serif;max-width:600px;margin:auto">
                <h2>Item Received</h2>
                <p>We have received your returned item. It is currently undergoing a quality inspection.</p>
                <p>We will update you with the outcome shortly.</p>
              </div>`,
            );
          }
          break;
        }

        case ReturnStatus.QC_PASSED: {
          // ✅ Item passed QC — restock inventory + initiate refund
          const [inventoryRecord] = await tx
            .select({ id: inventory.id, warehouse_id: inventory.warehouse_id })
            .from(inventory)
            .where(
              and(
                eq(inventory.product_variant_id, orderItem.product_variant_id),
                eq(inventory.company_id, companyId),
              ),
            )
            .limit(1);

          if (inventoryRecord) {
            await this.inventoryService.rollbackStockForOrder(
              {
                variantId: orderItem.product_variant_id,
                quantity: orderItem.quantity,
              },
              companyId,
              tx,
            );
          }

          // Mark order item as RETURNED
          await tx
            .update(order_items)
            .set({ order_status: OrderStatus.RETURNED })
            .where(eq(order_items.id, orderItem.id))
            .catch((error) => {
              throw new InternalServerErrorException(
                'Failed to update order item status',
                { cause: error },
              );
            });

          // Initiate the refund (item-level)
          await this.refundsService.initiateRefund({
            orderId: orderItem.order_id,
            orderItemId: orderItem.id,
            reason: returnRequest.reason,
            domain: companyId, // passing companyId — companyService.find() handles UUID too
          });

          if (customerEmail) {
            await this.mailService.sendEmail(
              customerEmail,
              'Quality Check Passed — Refund Initiated',
              `<div style="font-family:sans-serif;max-width:600px;margin:auto">
                <h2>Quality Check Passed</h2>
                <p>Your returned item has passed our quality inspection.</p>
                <p>A refund of <strong>₹${(Number(orderItem.price) * orderItem.quantity).toFixed(2)}</strong> has been initiated and will reflect in your account within 3–5 business days.</p>
              </div>`,
            );
          }
          break;
        }

        case ReturnStatus.QC_FAILED: {
          // ❌ Item failed QC — no refund, notify customer with reason
          if (customerEmail) {
            await this.mailService.sendEmail(
              customerEmail,
              'Quality Check Failed — Return Request Rejected',
              `<div style="font-family:sans-serif;max-width:600px;margin:auto">
                <h2>Quality Check Failed</h2>
                <p>Unfortunately, your returned item did not pass our quality inspection.</p>
                ${dto.store_owner_note ? `<p><strong>Reason:</strong> ${dto.store_owner_note}</p>` : ''}
                <p>As a result, the refund cannot be processed. If you have any questions, please contact our support team.</p>
              </div>`,
            );
          }
          break;
        }

        case ReturnStatus.REJECTED: {
          if (customerEmail) {
            await this.mailService.sendEmail(
              customerEmail,
              'Return Request Rejected',
              `<div style="font-family:sans-serif;max-width:600px;margin:auto">
                <h2>Return Request Rejected</h2>
                <p>We were unable to approve your return request.</p>
                ${dto.store_owner_note ? `<p><strong>Reason:</strong> ${dto.store_owner_note}</p>` : ''}
                <p>If you believe this is an error, please contact our support team.</p>
              </div>`,
            );
          }
          break;
        }

        case ReturnStatus.COMPLETED: {
          // QC_PASSED → COMPLETED is automatic after refund is confirmed
          // Nothing extra needed here — refund was already initiated at QC_PASSED
          if (customerEmail) {
            await this.mailService.sendEmail(
              customerEmail,
              'Return Completed',
              `<div style="font-family:sans-serif;max-width:600px;margin:auto">
                <h2>Return Process Completed</h2>
                <p>Your return request has been fully processed. The refund should reflect in your account within 3–5 business days.</p>
              </div>`,
            );
          }
          break;
        }
      }
    }

    // ════════════════════════════════════════════
    //  REPLACEMENT type side effects
    // ════════════════════════════════════════════
    if (returnType === ReturnType.REPLACEMENT) {
      switch (newStatus) {
        case ReturnStatus.APPROVED: {
          // ✅ Check stock before approving — don't approve if out of stock
          const [inventoryRecord] = await tx
            .select({
              id: inventory.id,
              stock_quantity: inventory.stock_quantity,
              warehouse_id: inventory.warehouse_id,
            })
            .from(inventory)
            .where(
              and(
                eq(inventory.product_variant_id, orderItem.product_variant_id),
                eq(inventory.company_id, companyId),
              ),
            )
            .limit(1);

          if (
            !inventoryRecord ||
            inventoryRecord.stock_quantity < orderItem.quantity
          ) {
            throw new BadRequestException(
              `Cannot approve replacement: insufficient stock. ` +
              `Available: ${inventoryRecord?.stock_quantity ?? 0}, Required: ${orderItem.quantity}`,
            );
          }

          if (customerEmail) {
            await this.mailService.sendEmail(
              customerEmail,
              'Replacement Request Approved',
              `<div style="font-family:sans-serif;max-width:600px;margin:auto">
                <h2>Replacement Approved</h2>
                <p>Your replacement request has been approved.</p>
                <p>Please pack the original item securely and ship it back to us. Once received, your replacement will be dispatched.</p>
              </div>`,
            );
          }
          break;
        }

        case ReturnStatus.IN_TRANSIT: {
          // Replacement is being shipped out — deduct stock + create shipping record
          await this.inventoryService.deductStockForOrder(
            [
              {
                variantId: orderItem.product_variant_id,
                quantity: orderItem.quantity,
              },
            ],
            companyId,
            tx,
          );

          // Create a new shipping record for the replacement shipment
          if (dto.tracking_id && orderItem.order_id) {
            await tx
              .insert(shipping_details)
              .values({
                order_id: orderItem.order_id,
                company_id: companyId,
                tracking_url: dto.tracking_id, // tracking_id field used as tracking URL here
              })
              .catch((error) => {
                // Non-fatal — log but don't fail the whole update
                console.error(
                  'Failed to create shipping record for replacement:',
                  error,
                );
              });
          }

          // Mark order item as REPLACED
          await tx
            .update(order_items)
            .set({ order_status: OrderStatus.REPLACED })
            .where(eq(order_items.id, orderItem.id))
            .catch((error) => {
              throw new InternalServerErrorException(
                'Failed to update order item status to REPLACED',
                { cause: error },
              );
            });

          if (customerEmail) {
            await this.mailService.sendEmail(
              customerEmail,
              'Your Replacement Has Been Shipped',
              `<div style="font-family:sans-serif;max-width:600px;margin:auto">
                <h2>Replacement Dispatched</h2>
                <p>Your replacement item has been shipped.</p>
                ${dto.tracking_id ? `<p><strong>Tracking ID:</strong> ${dto.tracking_id}</p>` : ''}
                <p>Expected delivery within 3–7 business days.</p>
              </div>`,
            );
          }
          break;
        }

        case ReturnStatus.DELIVERED: {
          // Replacement delivered to customer + original item returned by customer
          // Restock the original returned item
          await this.inventoryService.rollbackStockForOrder(
            {
              variantId: orderItem.product_variant_id,
              quantity: orderItem.quantity,
            },
            companyId,
            tx,
          );

          if (customerEmail) {
            await this.mailService.sendEmail(
              customerEmail,
              'Replacement Delivered',
              `<div style="font-family:sans-serif;max-width:600px;margin:auto">
                <h2>Replacement Delivered</h2>
                <p>Your replacement item has been successfully delivered.</p>
                <p>Thank you for your patience throughout this process.</p>
              </div>`,
            );
          }
          break;
        }

        case ReturnStatus.QC_PASSED: {
          // Original returned item passed QC — replacement process fully completed
          if (customerEmail) {
            await this.mailService.sendEmail(
              customerEmail,
              'Replacement Process Completed',
              `<div style="font-family:sans-serif;max-width:600px;margin:auto">
                <h2>All Done!</h2>
                <p>The returned item has passed quality inspection. Your replacement process is now complete.</p>
              </div>`,
            );
          }
          break;
        }

        case ReturnStatus.QC_FAILED: {
          // Replacement: original item returned by customer failed QC
          // Replacement was already shipped — no inventory rollback needed
          if (customerEmail) {
            await this.mailService.sendEmail(
              customerEmail,
              'Returned Item Quality Check Failed',
              `<div style="font-family:sans-serif;max-width:600px;margin:auto">
                <h2>Quality Check Failed</h2>
                <p>The item you returned did not pass our quality inspection.</p>
                ${dto.store_owner_note ? `<p><strong>Reason:</strong> ${dto.store_owner_note}</p>` : ''}
                <p>Please contact our support team if you have any concerns.</p>
              </div>`,
            );
          }
          break;
        }

        case ReturnStatus.REJECTED: {
          if (customerEmail) {
            await this.mailService.sendEmail(
              customerEmail,
              'Replacement Request Rejected',
              `<div style="font-family:sans-serif;max-width:600px;margin:auto">
                <h2>Replacement Request Rejected</h2>
                <p>We were unable to approve your replacement request.</p>
                ${dto.store_owner_note ? `<p><strong>Reason:</strong> ${dto.store_owner_note}</p>` : ''}
                <p>Please contact our support team if you believe this is an error.</p>
              </div>`,
            );
          }
          break;
        }

        case ReturnStatus.COMPLETED: {
          if (customerEmail) {
            await this.mailService.sendEmail(
              customerEmail,
              'Replacement Fully Completed',
              `<div style="font-family:sans-serif;max-width:600px;margin:auto">
                <h2>Replacement Complete</h2>
                <p>Your replacement request has been fully completed. We hope you enjoy your new item!</p>
              </div>`,
            );
          }
          break;
        }
      }
    }

    // ════════════════════════════════════════════
    //  REFUND type side effects (direct refund, no physical return)
    // ════════════════════════════════════════════
    if (returnType === ReturnType.REFUND) {
      switch (newStatus) {
        case ReturnStatus.APPROVED: {
          // Directly initiate refund — no shipping/QC needed
          await tx
            .update(order_items)
            .set({ order_status: OrderStatus.REFUNDED })
            .where(eq(order_items.id, orderItem.id))
            .catch((error) => {
              throw new InternalServerErrorException(
                'Failed to update order item status to REFUNDED',
                { cause: error },
              );
            });

          await this.refundsService.initiateRefund({
            orderId: orderItem.order_id,
            orderItemId: orderItem.id,
            reason: returnRequest.reason,
            domain: companyId,
          });

          if (customerEmail) {
            await this.mailService.sendEmail(
              customerEmail,
              'Refund Approved and Initiated',
              `<div style="font-family:sans-serif;max-width:600px;margin:auto">
                <h2>Refund Approved</h2>
                <p>Your refund request has been approved.</p>
                <p>A refund of <strong>₹${(Number(orderItem.price) * orderItem.quantity).toFixed(2)}</strong> has been initiated and will reflect in your account within 3–5 business days.</p>
              </div>`,
            );
          }
          break;
        }

        case ReturnStatus.REJECTED: {
          if (customerEmail) {
            await this.mailService.sendEmail(
              customerEmail,
              'Refund Request Rejected',
              `<div style="font-family:sans-serif;max-width:600px;margin:auto">
                <h2>Refund Request Rejected</h2>
                <p>Unfortunately, your refund request could not be approved.</p>
                ${dto.store_owner_note ? `<p><strong>Reason:</strong> ${dto.store_owner_note}</p>` : ''}
                <p>Please contact support if you have questions.</p>
              </div>`,
            );
          }
          break;
        }

        case ReturnStatus.COMPLETED: {
          if (customerEmail) {
            await this.mailService.sendEmail(
              customerEmail,
              'Refund Completed',
              `<div style="font-family:sans-serif;max-width:600px;margin:auto">
                <h2>Refund Completed</h2>
                <p>Your refund has been fully processed.</p>
              </div>`,
            );
          }
          break;
        }
      }
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async _getCustomerEmailByUserId(
    userId: string,
  ): Promise<string | null> {
    try {
      const [customerRecord] = await this.db
        .select({ email: user.email })
        .from(user)
        .where(eq(user.id, userId))
        .limit(1);
      return customerRecord?.email ?? null;
    } catch {
      return null; // email failure should never block status updates
    }
  }

  private async _notifyCustomer(
    userId: string,
    subject: string,
    html: string,
  ) {
    try {
      const email = await this._getCustomerEmailByUserId(userId);
      if (email) {
        await this.mailService.sendEmail(email, subject, html);
      }
    } catch {
      // fire-and-forget — email failure must not break the main flow
    }
  }
}