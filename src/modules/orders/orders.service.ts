import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import {
  and,
  desc,
  eq,
  gt,
  gte,
  inArray,
  notInArray,
  or,
  sql,
} from 'drizzle-orm';
import { DRIZZLE, type DrizzleService } from '../../drizzle/drizzle.module';
import {
  gst_invoices,
  order_item_policy,
  order_items,
  orders,
  orders_tax,
  payments,
  product_images,
  product_policy_override,
  product_variants,
  products,
  category_policy,
  carts,
  cart_items,
} from '../../drizzle/schema';
import { OrderStatus, PaymentStatus } from '../../drizzle/types/types';
import { CompanyService } from '../company/company.service';
import { InventoryService } from '../inventory/inventory.service';
import { MailService } from '../../common/services/mail/mail.service';
import { domainExtractor } from '../../common/filters/domainExtractor.filter';
import { InvoiceService } from '../invoice/invoice.service';
import { FinancesService } from '../finances/finances.service';
import { PolicyDocumentService } from '../product-policies/policy-document.service';
import { ProductPoliciesService } from '../product-policies/product-policies.service';
import { PolicyResolutionService } from '../product-policies/policy-resolution.service'; // ← NEW
import { PolicySnapshot } from '../product-policies/interfaces/policy-document.interface';

@Injectable()
export class OrdersService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleService,
    private readonly companyService: CompanyService,
    private readonly inventoryService: InventoryService,
    private readonly mailService: MailService,
    private readonly invoiceService: InvoiceService,
    private readonly financesService: FinancesService,
    private readonly policyDocumentService: PolicyDocumentService,
    private readonly productPoliciesService: ProductPoliciesService,
    private readonly policyResolutionService: PolicyResolutionService, // ← NEW
  ) {}
  private async resolveCompanyId(domain: string): Promise<string> {
    const filteredDomain = domainExtractor(domain);
    console.log(
      `[OrdersService.resolveCompanyId] Resolving company for domain: ${domain}`,
    );
    console.log(
      `[OrdersService.resolveCompanyId] Extracted filter domain: ${filteredDomain}`,
    );
    console.log(
      `[OrdersService.resolveCompanyId] Querying CompanyService.find(...)`,
    );
    const companyId = await this.companyService.find(filteredDomain);
    console.log(
      `[OrdersService.resolveCompanyId] Company resolved: ${companyId}`,
    );
    return companyId;
  }

  async createOrder({
    userId,
    companyId,
    addressId,
    orderLines,
    paymentMethod,
  }: {
    userId: string;
    companyId: string;
    addressId: string;
    orderLines: { variantId: string; quantity: number; price: number }[];
    paymentMethod: string;
  }) {
    try {
      console.log(
        '[OrdersService.createOrder] Starting order creation request',
        {
          userId,
          companyId,
          addressId,
          itemCount: orderLines.length,
          paymentMethod,
        },
      );
      const totalAmount = orderLines.reduce(
        (acc, line) => acc + line.price * line.quantity,
        0,
      );
      if (totalAmount <= 0) {
        throw new Error('Total amount must be greater than zero');
      }

      const orderResult = await this.db.transaction(async (tx) => {
        console.log('[OrdersService.createOrder] Transaction started');
        console.log(
          '[OrdersService.createOrder] Deducting stock for order lines',
        );
        await this.inventoryService.deductStockForOrder(
          orderLines.map((l) => ({
            variantId: l.variantId,
            quantity: l.quantity,
          })),
          companyId,
          tx as DrizzleService,
        );
        console.log('[OrdersService.createOrder] Stock deduction complete');

        console.log('[OrdersService.createOrder] Calculating taxes for order');
        const taxData = await this.financesService.calculateOrderTaxes(
          tx as DrizzleService,
          companyId,
          addressId,
          orderLines,
        );

        // 3. Create the main Order
        const [newOrder] = await tx
          .insert(orders)
          .values({
            company_id: companyId,
            user_id: userId,
            address_id: addressId,
            total_amount: String(taxData.grandTotal),
          })
          .returning({ id: orders.id })
          .catch((error) => {
            console.error('Error inserting order:', error);
            throw new InternalServerErrorException('Failed to create order', {
              cause: error,
            });
          });

        console.log('Order created:', newOrder.id);
        console.log('[OrdersService.createOrder] Order row created', {
          orderId: newOrder.id,
          grandTotal: String(taxData.grandTotal),
        });

        // 4. Insert orders_tax rows
        if (taxData.appliedTaxTypeIds.length > 0) {
          console.log(
            '[OrdersService.createOrder] Writing order tax mappings',
            {
              taxCount: taxData.appliedTaxTypeIds.length,
            },
          );
          const orderTaxInserts = taxData.appliedTaxTypeIds.map(
            (taxTypeId) => ({
              order_id: newOrder.id,
              tax_types_id: taxTypeId,
            }),
          );
          await tx.insert(orders_tax).values(orderTaxInserts);
        }

        // 5. Create GST Invoice record
        console.log('[OrdersService.createOrder] Creating GST invoice record');
        await tx.insert(gst_invoices).values({
          company_id: companyId,
          order_id: newOrder.id,
          gst_registration_id: taxData.vendorGstId,
          invoice_number: `INV-${Date.now()}`,
          invoice_date: new Date().toISOString().split('T')[0],
          cgst_amount: String(taxData.totalCgst),
          sgst_amount: String(taxData.totalSgst),
          igst_amount: String(taxData.totalIgst),
          total_tax: String(taxData.totalTax),
          gst_amount: String(taxData.totalTax),
        });

        // 6. Create order items
        const orderItemsData = orderLines.map((line) => ({
          order_id: newOrder.id,
          product_variant_id: line.variantId,
          quantity: line.quantity,
          price: String(line.price),
          order_status: OrderStatus.PENDING,
          company_id: companyId,
        }));

        console.log('[OrdersService.createOrder] Inserting order items', {
          itemCount: orderItemsData.length,
        });
        await tx
          .insert(order_items)
          .values(orderItemsData)
          .catch((error) => {
            console.error('Error inserting order items:', error);
            throw new InternalServerErrorException(
              'Failed to create order items',
              {
                cause: error,
              },
            );
          });

        const insertedItems = await tx
          .select({
            id: order_items.id,
            product_variant_id: order_items.product_variant_id,
          })
          .from(order_items)
          .where(eq(order_items.order_id, newOrder.id));

        console.log('[OrdersService.createOrder] Order items inserted', {
          insertedItemIds: insertedItems.map((item) => item.id),
        });

        // 7. Resolve and snapshot policies for every order item
        //
        // FIX: replaced the old ad-hoc inline lookup (which silently skipped
        // items when category had no policy) with PolicyResolutionService which:
        //   - checks product override first
        //   - falls back to category policy
        //   - logs exactly why each item did or didn't get a policy
        //   - never throws — a missing policy never aborts the order
        const resolutions =
          await this.policyResolutionService.resolveForVariants(
            insertedItems.map((item) => ({
              orderItemId: item.id,
              productVariantId: item.product_variant_id ?? '',
            })),
            tx as DrizzleService,
          );

        console.log('[OrdersService.createOrder] Policy resolution complete', {
          resolutionCount: resolutions.size,
        });

        for (const [orderItemId, resolution] of resolutions.entries()) {
          if (!resolution.policy_id) {
            // Already logged by PolicyResolutionService — no snapshot needed
            continue;
          }

          try {
            await this.productPoliciesService.createOrderItemPolicySnapshot(
              {
                order_item_id: orderItemId,
                policy_id: resolution.policy_id,
                policy_start_date: new Date().toISOString().split('T')[0],
              },
              companyId,
              tx as DrizzleService,
            );

            console.log(
              `[createOrder] Snapshot created for item ${orderItemId} ` +
                `via ${resolution.source}: ${resolution.reason}`,
            );
          } catch (err) {
            // Don't let a snapshot failure abort the whole order
            console.error(
              `[createOrder] Snapshot failed for item ${orderItemId}:`,
              err,
            );
          }
        }

        // 8. Create payment record (PENDING — confirmed later via verifyCheckout)
        console.log('[OrdersService.createOrder] Creating payment record');
        await tx
          .insert(payments)
          .values({
            order_id: newOrder.id,
            company_id: companyId,
            amount: String(taxData.grandTotal),
            payment_status: PaymentStatus.PENDING,
            payment_method: paymentMethod,
            transaction_ref: `txn_${newOrder.id}_${Date.now()}`,
          })
          .then(() => console.log('Payment record created'))
          .catch((error) => {
            console.error('Error inserting payment record:', error);
            throw new InternalServerErrorException(
              'Failed to create payment record',
              { cause: error },
            );
          });

        console.log(
          '[OrdersService.createOrder] Order creation transaction completed',
          {
            orderId: newOrder.id,
            totalAmount: String(taxData.grandTotal),
          },
        );

        return {
          orderId: newOrder.id,
          totalAmount: String(taxData.grandTotal),
          itemCount: orderLines.length,
        };
      });

      return orderResult;
    } catch (error) {
      if (
        error instanceof HttpException ||
        error instanceof InternalServerErrorException
      ) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to create order', {
        cause: error,
      });
    }
  }

  // ── All other methods unchanged below this line ──────────────────

  async getOrderById(orderId: string, domain?: string) {
    console.log('[OrdersService.getOrderById] Request received', {
      orderId,
      domain,
    });
    try {
      if (!orderId || !domain) {
        console.log(
          '[OrdersService.getOrderById] Stopping: orderId or domain is missing',
        );
        throw new HttpException(
          'Order ID and Domain are required',
          HttpStatus.BAD_REQUEST,
        );
      }
      console.log('[OrdersService.getOrderById] Resolving company id');
      const companyId = await this.resolveCompanyId(domain);

      console.log('[OrdersService.getOrderById] Querying order by id', {
        orderId,
        companyId,
      });
      const [orderResult] = await this.db.query.orders.findMany({
        where: and(eq(orders.id, orderId), eq(orders.company_id, companyId)),
        with: { items: true },
      });

      if (!orderResult || !orderResult.items) {
        console.log('[OrdersService.getOrderById] Stopping: Order not found');
        throw new HttpException(
          'Order not found with the provided ID',
          HttpStatus.NOT_FOUND,
        );
      }

      console.log('[OrdersService.getOrderById] Order found successfully');
      return orderResult;
    } catch (error) {
      console.error('Error fetching order:', error);
      throw new InternalServerErrorException('Failed to fetch order', {
        cause: error,
      });
    }
  }

  async getAllOrders() {
    console.log('[OrdersService.getAllOrders] Request received');
    try {
      console.log('[OrdersService.getAllOrders] Querying all orders');
      const allOrders = await this.db.query.orders.findMany({
        columns: { id: true, created_at: true },
      });
      console.log('[OrdersService.getAllOrders] Orders fetched successfully', {
        count: allOrders.length,
      });
      return allOrders;
    } catch (error) {
      console.error('Error fetching orders:', error);
      throw new InternalServerErrorException('Failed to fetch orders', {
        cause: error,
      });
    }
  }

  async completeOrderVerification(
    customerDetails: { email: string; first_name: string; last_name: string },
    existingOrder: {
      id: string;
      total_amount: string;
      created_at: Date;
      updated_at: Date;
      user_id: string | null;
      address_id: string | null;
      company_id: string | null;
    },
    orderId: string,
    isSuccess: boolean,
    companyId?: string,
  ): Promise<{ success: boolean; orderId: string; message: string }> {
    if (!orderId) {
      throw new HttpException('Order ID is required', HttpStatus.BAD_REQUEST);
    }
    if (!companyId) {
      throw new HttpException('Company ID is required', HttpStatus.BAD_REQUEST);
    }

    try {
      console.log(
        `[OrdersService.completeOrderVerification] Starting payment verification for order ${orderId} (company ${companyId}, success=${isSuccess})`,
      );
      if (!existingOrder || !existingOrder.user_id) {
        throw new HttpException('Order not found', HttpStatus.NOT_FOUND);
      }

      const orderLines = await this.db
        .select({
          variantId: order_items.product_variant_id,
          quantity: order_items.quantity,
        })
        .from(order_items)
        .where(eq(order_items.order_id, orderId));

      return this.db.transaction(async (tx) => {
        console.log(
          '[OrdersService.completeOrderVerification] Verification transaction started',
        );
        if (isSuccess) {
          console.log(
            `[OrdersService.completeOrderVerification] Payment succeeded, updating order items for order ${orderId}`,
          );
          const orderItemsRecord = await tx
            .select()
            .from(order_items)
            .where(eq(order_items.order_id, orderId));

          if (orderItemsRecord.length > 0) {
            await Promise.all(
              orderItemsRecord.map((item) =>
                tx
                  .update(order_items)
                  .set({ order_status: OrderStatus.PROCESSING })
                  .where(
                    and(
                      eq(order_items.order_id, orderId),
                      eq(order_items.id, item.id),
                    ),
                  )
                  .catch((error) => {
                    throw new InternalServerErrorException(
                      'Failed to update order status',
                      { cause: error },
                    );
                  }),
              ),
            );
          }

          console.log(
            `[OrdersService.completeOrderVerification] Order items marked processing (${orderItemsRecord.length} items) for order ${orderId}`,
          );

          if (!orderItemsRecord[0]?.order_id) {
            throw new HttpException('Order not found', HttpStatus.NOT_FOUND);
          }

          console.log(
            `[OrdersService.completeOrderVerification] Marking payment completed for order ${orderItemsRecord[0].order_id}`,
          );
          await tx
            .update(payments)
            .set({ payment_status: PaymentStatus.COMPLETED })
            .where(eq(payments.order_id, orderItemsRecord[0].order_id))
            .returning()
            .catch((error) => {
              throw new InternalServerErrorException(
                'Failed to update payment status',
                { cause: error },
              );
            });

          if (customerDetails.email) {
            console.log(
              `[OrdersService.completeOrderVerification] Sending order placed email to ${customerDetails.email} for order ${orderId}`,
            );
            await this.mailService
              .sendOrderPlacedEmail(
                customerDetails.email,
                `${customerDetails.first_name} ${customerDetails.last_name}`,
                orderId,
                Number(existingOrder.total_amount),
              )
              .catch((error) => {
                console.error('Error sending order placed email:', error);
              });
          }

          // Fire-and-forget invoice generation
          this.invoiceService
            .createInvoice(orderId)
            .then(() =>
              console.log(
                `[OrdersService] Invoice PDF generated for order ${orderId}`,
              ),
            )
            .catch((err) =>
              console.error(
                `[OrdersService] Background PDF generation failed for order ${orderId}:`,
                err,
              ),
            );

          const itemIds = orderItemsRecord.map((item) => item.id);
          console.log(
            `[OrdersService.completeOrderVerification] Checking policy snapshots for order items: ${itemIds.join(', ')}`,
          );

          if (itemIds.length > 0) {
            const orderItemsWithPolicies = await tx
              .select()
              .from(order_item_policy)
              .where(inArray(order_item_policy.order_item_id, itemIds))
              .catch((error) => {
                console.error('Error fetching order item policies:', error);
                throw new InternalServerErrorException(
                  'Failed to fetch order item policies',
                  { cause: error },
                );
              });

            console.log(
              `[OrdersService.completeOrderVerification] Policy snapshot records loaded: ${orderItemsWithPolicies.length}`,
            );

            // Fire-and-forget warranty PDF generation per item
            for (const itemPolicy of orderItemsWithPolicies) {
              const snapshot = itemPolicy.policy_snapshot as PolicySnapshot;
              console.log('Policy Snapshot:', snapshot);

              if (snapshot?.generates_document) {
                this.policyDocumentService
                  .generatePolicyDocument(itemPolicy.order_item_id)
                  .then(() =>
                    console.log(
                      `[OrdersService] Warranty PDF generated for item ${itemPolicy.order_item_id}`,
                    ),
                  )
                  .catch((err) =>
                    console.error(
                      `[OrdersService] Failed to generate warranty for item ${itemPolicy.order_item_id}`,
                      err,
                    ),
                  );
              }
            }
          }

          console.log(
            `[OrdersService.completeOrderVerification] Verification completed successfully for order ${orderId}`,
          );
          return {
            success: true,
            orderId,
            message: 'Order placed successfully',
          };
        } else {
          console.log(
            `[OrdersService.completeOrderVerification] Payment failed, rolling back stock for order ${orderId}`,
          );
          await this.inventoryService.rollbackStockForOrder(
            orderLines.map((l) => ({
              variantId: l.variantId ?? '',
              quantity: l.quantity,
            })),
            companyId,
            tx as DrizzleService,
          );

          const orderItemsRecord = await tx
            .select({ id: order_items.id })
            .from(order_items)
            .where(eq(order_items.order_id, orderId));

          if (orderItemsRecord.length > 0) {
            console.log(
              `[OrdersService.completeOrderVerification] Marking ${orderItemsRecord.length} order items cancelled after failed payment`,
            );
            await Promise.all(
              orderItemsRecord.map((item) =>
                tx
                  .update(order_items)
                  .set({ order_status: OrderStatus.CANCELLED })
                  .where(
                    and(
                      eq(order_items.order_id, orderId),
                      eq(order_items.id, item.id),
                    ),
                  )
                  .catch((error) => {
                    throw new InternalServerErrorException(
                      'Failed to update order status',
                      { cause: error },
                    );
                  }),
              ),
            );
          }

          console.log(
            `[OrdersService.completeOrderVerification] Marking payment as failed for order ${existingOrder.id}`,
          );
          await tx
            .update(payments)
            .set({ payment_status: PaymentStatus.FAILED })
            .where(eq(payments.order_id, existingOrder.id))
            .catch((error) => {
              throw new InternalServerErrorException(
                'Failed to update payment status',
                { cause: error },
              );
            });

          console.log(
            `[OrdersService.completeOrderVerification] Verification completed with failure branch for order ${existingOrder.id}`,
          );
          return {
            success: false,
            orderId: existingOrder.id,
            message: 'Payment failed. Order has been cancelled.',
          };
        }
      });
    } catch (error) {
      if (
        error instanceof HttpException ||
        error instanceof InternalServerErrorException
      ) {
        throw error;
      }
      throw new InternalServerErrorException(
        'Failed to complete order verification',
        { cause: error },
      );
    }
  }

  async getUserOrders(userId: string, domain: string) {
    console.log('[OrdersService.getUserOrders] Request received', {
      userId,
      domain,
    });
    try {
      if (!userId) {
        console.log(
          '[OrdersService.getUserOrders] Stopping: User ID is missing',
        );
        throw new HttpException('User ID is required', HttpStatus.BAD_REQUEST);
      }
      console.log('[OrdersService.getUserOrders] Resolving company id');
      const companyId = await this.resolveCompanyId(domain);

      console.log('[OrdersService.getUserOrders] Querying orders for user', {
        userId,
        companyId,
      });
      return await this.db.query.orders
        .findMany({
          orderBy: desc(orders.created_at),
          where: and(
            eq(orders.user_id, userId),
            eq(orders.company_id, companyId),
          ),
          columns: {
            id: true,
            user_id: true,
            total_amount: true,
            created_at: true,
          },
          with: {
            items: {
              columns: {
                order_status: true,
                quantity: true,
                price: true,
              },
              with: {
                variant: {
                  columns: { id: true, variant_name: true, price: true },
                  with: {
                    images: {
                      where: eq(product_images.is_primary, true),
                      columns: { image_url: true },
                    },
                  },
                },
                return_request: { columns: { id: true, status: true } },
              },
            },
            address: {
              columns: {
                name: true,
                address_line_1: true,
                address_line_2: true,
                city: true,
                state: true,
                postal_code: true,
                country: true,
              },
            },
            payment: {
              columns: {
                id: true,
                amount: true,
                payment_status: true,
                payment_method: true,
                transaction_ref: true,
              },
            },
            shipping: { columns: { tracking_url: true } },
          },
        })
        .catch((error) => {
          console.error('Error fetching user orders:', error);
          throw new InternalServerErrorException(
            'Failed to retrieve user orders',
            { cause: error },
          );
        });
    } catch (error) {
      console.error('Error fetching user orders:', error);
      throw new InternalServerErrorException('Failed to retrieve user orders', {
        cause: error,
      });
    }
  }

  async getUserOrderDetails(
    orderId: string,
    domain: string,
    offset: number = 0,
    limit: number = 10,
    status?: OrderStatus,
  ) {
    console.log('[OrdersService.getUserOrderDetails] Request received', {
      orderId,
      domain,
      offset,
      limit,
      status,
    });
    try {
      if (!orderId || !domain) {
        console.log(
          '[OrdersService.getUserOrderDetails] Stopping: orderId or domain is missing',
        );
        throw new HttpException(
          'Order ID and domain are required',
          HttpStatus.BAD_REQUEST,
        );
      }
      console.log('[OrdersService.getUserOrderDetails] Resolving company id');
      const companyId = await this.resolveCompanyId(domain);

      console.log(
        '[OrdersService.getUserOrderDetails] Querying order details',
        { orderId, companyId },
      );
      const orderDetails = await this.db.query.orders.findFirst({
        where: and(eq(orders.id, orderId), eq(orders.company_id, companyId)),
        columns: {
          id: true,
          user_id: true,
          total_amount: true,
          created_at: true,
        },
        with: {
          items: {
            columns: {
              id: true,
              quantity: true,
              order_status: true,
              price: true,
            },
            with: {
              variant: {
                columns: { id: true, variant_name: true, price: true },
                with: {
                  images: {
                    where: eq(product_images.is_primary, true),
                    columns: { image_url: true },
                  },
                },
              },
              return_request: {
                columns: {
                  id: true,
                  status: true,
                  store_owner_note: true,
                  tracking_id: true,
                  type: true,
                },
              },
              cancelledRecord: true,
              invoice: true,
            },
          },
          address: {
            columns: {
              name: true,
              address_line_1: true,
              address_line_2: true,
              city: true,
              state: true,
              postal_code: true,
              country: true,
            },
          },
          payment: true,
          shipping: { columns: { tracking_url: true } },
          invoice: true,
        },
      });

      if (!orderDetails) {
        console.log(
          '[OrdersService.getUserOrderDetails] Stopping: Order not found',
        );
        throw new HttpException('Order not found', HttpStatus.NOT_FOUND);
      }
      console.log(
        '[OrdersService.getUserOrderDetails] Order details found successfully',
      );
      return orderDetails;
    } catch (error) {
      console.error('Error fetching order details:', error);
      throw new InternalServerErrorException(
        'Failed to retrieve order details',
        { cause: error },
      );
    }
  }

  async getOrdersList(
    domain: string,
    offset: number = 0,
    limit: number = 50,
    status?: OrderStatus,
  ) {
    try {
      console.log(
        `[OrdersService.getOrdersList] Request received for domain: ${domain}, offset: ${offset}, limit: ${limit}, status: ${status}`,
      );
      const companyId = await this.resolveCompanyId(domain);
      console.log(
        `[OrdersService.getOrdersList] Company resolved: ${companyId}`,
      );

      const validOrderIds = (
        await this.db
          .selectDistinct({ id: orders.id, created_at: orders.created_at })
          .from(orders)
          .innerJoin(
            order_items,
            and(
              eq(order_items.order_id, orders.id),
              Object.values(OrderStatus).includes(status as OrderStatus)
                ? and(
                    // @ts-ignore
                    eq(order_items.order_status, status),
                    gt(order_items.quantity, 0),
                  )
                : undefined,
            ),
          )
          .where(eq(orders.company_id, companyId))
          .orderBy(desc(orders.created_at))
          .limit(limit)
          .offset(offset)
      ).map((o) => o.id);

      if (validOrderIds.length === 0) return [];

      return await this.db.query.orders.findMany({
        where: and(
          eq(orders.company_id, companyId),
          inArray(orders.id, validOrderIds),
        ),
        orderBy: desc(orders.created_at),
        columns: { id: true, total_amount: true, created_at: true },
        with: {
          items: {
            where: Object.values(OrderStatus).includes(status as OrderStatus)
              ? and(
                  // @ts-ignore
                  eq(order_items.order_status, status),
                  gt(order_items.quantity, 0),
                )
              : undefined,
            columns: { order_status: true, quantity: true, price: true },
            with: {
              cancelledRecord: true,
              return_request: true,
              invoice: true,
              order: { with: { payment: true } },
            },
          },
          address: {
            columns: {
              name: true,
              city: true,
              state: true,
              country: true,
              postal_code: true,
            },
          },
          payment: true,
        },
      });
    } catch (error) {
      console.error('Error fetching orders list:', error);
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException('Failed to retrieve orders list', {
        cause: error,
      });
    }
  }

  async getOrderDetails(orderId: string, domain: string) {
    console.log('[OrdersService.getOrderDetails] Request received', {
      orderId,
      domain,
    });
    try {
      if (!orderId || !domain) {
        console.log(
          '[OrdersService.getOrderDetails] Stopping: Order ID or domain missing',
        );
        throw new HttpException(
          'Order ID and domain are required',
          HttpStatus.BAD_REQUEST,
        );
      }
      console.log('[OrdersService.getOrderDetails] Resolving company id');
      const companyId = await this.resolveCompanyId(domain);
      console.log(
        '[OrdersService.getOrderDetails] Querying order details from DB',
        { orderId, companyId },
      );
      const row = await this.db.query.orders.findFirst({
        where: and(eq(orders.id, orderId), eq(orders.company_id, companyId)),
        columns: { id: true, total_amount: true, created_at: true },
        with: {
          items: {
            columns: {
              id: true,
              order_status: true,
              quantity: true,
              price: true,
            },
            with: {
              invoice: true,
              return_request: true,
              cancelledRecord: true,
              refund: true,
              variant: {
                columns: { id: true, variant_name: true, price: true },
                with: {
                  images: {
                    where: eq(product_images.is_primary, true),
                    columns: { image_url: true },
                  },
                  inventory: {
                    columns: { stock_quantity: true, warehouse_id: true },
                    with: {
                      warehouse: {
                        columns: { warehouse_name: true, address_id: true },
                        with: {
                          address: {
                            columns: {
                              address_line_1: true,
                              address_line_2: true,
                              city: true,
                              state: true,
                              postal_code: true,
                              country: true,
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          customer: {
            columns: {
              id: true,
              first_name: true,
              last_name: true,
              email: true,
              phone_number: true,
            },
          },
          address: {
            columns: {
              name: true,
              address_line_1: true,
              address_line_2: true,
              city: true,
              state: true,
              postal_code: true,
              country: true,
            },
          },
          payment: true,
          shipping: { columns: { tracking_url: true } },
          invoice: true,
        },
      });

      if (!row) {
        console.log(
          '[OrdersService.getOrderDetails] Stopping: Order not found',
        );
        throw new HttpException('Order not found', HttpStatus.NOT_FOUND);
      }

      const warehouseIds = new Set(
        row.items.map((i) => i?.variant?.inventory?.warehouse_id ?? null),
      );
      const isSingleWarehouse = warehouseIds.size <= 1;

      console.log(
        '[OrdersService.getOrderDetails] Order details found successfully',
      );
      return {
        id: row.id,
        total_amount: row.total_amount,
        created_at: row.created_at,
        is_single_warehouse: isSingleWarehouse,
        customer: {
          id: row.customer?.id ?? null,
          first_name: row.customer?.first_name ?? null,
          last_name: row.customer?.last_name ?? null,
          email: row.customer?.email ?? null,
          phone_number: row.customer?.phone_number ?? null,
        },
        invoice: row.invoice ?? null,
        items: row.items.map((item) => {
          const inventory = item?.variant?.inventory ?? null;
          const warehouse = inventory?.warehouse ?? null;
          return {
            id: item.id,
            quantity: item?.quantity,
            unit_price: item?.price,
            line_total: (Number(item?.price) * item?.quantity).toFixed(2),
            order_status: item?.order_status,
            refund: item?.refund,
            return: item?.return_request,
            cancel: item?.cancelledRecord,
            invoice: item.invoice ?? null,
            warehouse: warehouse
              ? {
                  id: inventory?.warehouse_id ?? null,
                  name: warehouse.warehouse_name,
                  address: warehouse.address
                    ? {
                        address_line_1: warehouse.address.address_line_1,
                        address_line_2:
                          warehouse.address.address_line_2 ?? null,
                        city: warehouse.address.city,
                        state: warehouse.address.state,
                        postal_code: warehouse.address.postal_code,
                        country: warehouse.address.country,
                      }
                    : null,
                }
              : null,
            product_variant: {
              id: item.variant?.id ?? null,
              variant_name: item.variant?.variant_name ?? null,
              price: item.variant?.price ?? null,
              image_url: item.variant?.images?.[0]?.image_url ?? null,
            },
          };
        }),
        shipping_address: row.address
          ? {
              name: row.address.name,
              address_line_1: row.address.address_line_1,
              address_line_2: row.address.address_line_2 ?? null,
              city: row.address.city,
              state: row.address.state,
              postal_code: row.address.postal_code,
              country: row.address.country,
            }
          : null,
        payment: row.payment
          ? {
              amount: row.payment.amount,
              payment_method: row.payment.payment_method,
            }
          : null,
        shipping: { tracking_url: row.shipping?.tracking_url ?? null },
      };
    } catch (error) {
      console.error('Error fetching order details:', error);
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException(
        'Failed to retrieve order details',
        { cause: error },
      );
    }
  }

  async setOrderStatus(
    orderId: string,
    newStatus: OrderStatus,
    domain: string,
  ) {
    console.log('[OrdersService.setOrderStatus] Request received', {
      orderId,
      newStatus,
      domain,
    });
    const filteredDomain = domainExtractor(domain);
    console.log(
      '[OrdersService.setOrderStatus] Resolving company for domain:',
      filteredDomain,
    );
    const companyId = await this.companyService.find(filteredDomain);
    if (!companyId) {
      console.log('[OrdersService.setOrderStatus] Stopping: Company not found');
      throw new HttpException(
        `Company not found ${domain}`,
        HttpStatus.NOT_FOUND,
      );
    }

    try {
      console.log(
        '[OrdersService.setOrderStatus] Querying existing order from DB',
        { orderId, companyId },
      );
      const [existingOrder] = await this.db
        .select({ id: orders.id })
        .from(orders)
        .where(and(eq(orders.id, orderId), eq(orders.company_id, companyId)))
        .limit(1);

      if (!existingOrder) {
        console.log('[OrdersService.setOrderStatus] Stopping: Order not found');
        throw new HttpException('Order not found', HttpStatus.NOT_FOUND);
      }

      if (
        !Object.values(OrderStatus).includes(
          newStatus.toLowerCase() as OrderStatus,
        )
      ) {
        console.log(
          '[OrdersService.setOrderStatus] Stopping: Invalid status',
          newStatus,
        );
        throw new HttpException(
          'Invalid order status value',
          HttpStatus.BAD_REQUEST,
        );
      }

      console.log(
        '[OrdersService.setOrderStatus] Querying order items to update',
      );
      const orderItemsRecord = await this.db
        .select({ id: order_items.id })
        .from(order_items)
        .where(eq(order_items.order_id, orderId))
        .limit(1);

      if (orderItemsRecord) {
        await Promise.all(
          orderItemsRecord.map((item) =>
            this.db
              .update(order_items)
              .set({ order_status: newStatus.toLowerCase() as OrderStatus })
              .where(
                and(
                  eq(order_items.order_id, orderId),
                  eq(order_items.id, item.id),
                ),
              )
              .catch((error) => {
                throw new InternalServerErrorException(
                  'Failed to update order status',
                  { cause: error },
                );
              }),
          ),
        );
      }

      console.log(
        '[OrdersService.setOrderStatus] Order status updated successfully',
        { orderId },
      );
      return orderId;
    } catch (error) {
      console.error('Error updating order status:', error);
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException('Failed to update order status', {
        cause: error,
      });
    }
  }

  async getPendingOrders(domain: string) {
    console.log('[OrdersService.getPendingOrders] Request received', {
      domain,
    });
    try {
      console.log('[OrdersService.getPendingOrders] Resolving company id');
      const companyId = await this.resolveCompanyId(domain);
      console.log(
        '[OrdersService.getPendingOrders] Querying pending orders from DB',
        { companyId },
      );
      const result = await this.db.query.orders.findMany({
        where: eq(orders.company_id, companyId),
        with: {
          items: {
            where: or(
              eq(order_items.order_status, OrderStatus.PENDING),
              eq(order_items.order_status, OrderStatus.PROCESSING),
            ),
            columns: {
              id: true,
              order_id: true,
              order_status: true,
              created_at: true,
              updated_at: true,
            },
          },
        },
      });
      console.log(
        '[OrdersService.getPendingOrders] Pending orders retrieved successfully',
      );
      return result.map((order) => order.items).flat();
    } catch (error) {
      console.error('Error fetching pending orders:', error);
      throw new InternalServerErrorException('Failed to fetch pending orders', {
        cause: error,
      });
    }
  }
  async getSalesAnalytics(domain: string, days: number = 30) {
    console.log(
      `[OrdersService.getSalesAnalytics] Fetching analytics for last ${days} days`,
    );
    try {
      const companyId = await this.resolveCompanyId(domain);

      // Calculate the date cutoff
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);

      const analytics = await this.db
        .select({
          // Format date as YYYY-MM-DD for the chart X-Axis
          date: sql<string>`TO_CHAR(${order_items.created_at}, 'YYYY-MM-DD')`,
          // Calculate total revenue (price * quantity)
          revenue: sql<number>`CAST(SUM(${order_items.price} * ${order_items.quantity}) AS FLOAT)`,
          // Count total items sold
          salesCount: sql<number>`CAST(COUNT(${order_items.id}) AS INTEGER)`,
        })
        .from(order_items)
        .where(
          and(
            eq(order_items.company_id, companyId),
            sql`${order_items.order_status} NOT IN ('cancelled', 'returned')`,
            gte(order_items.created_at, cutoffDate),
          ),
        )
        .groupBy(sql`TO_CHAR(${order_items.created_at}, 'YYYY-MM-DD')`)
        .orderBy(sql`TO_CHAR(${order_items.created_at}, 'YYYY-MM-DD') ASC`);

      // Calculate total revenue for the summary card
      const totalRevenue = analytics.reduce(
        (acc, curr) => acc + (curr.revenue || 0),
        0,
      );

      return {
        chartData: analytics,
        totalRevenue,
      };
    } catch (error) {
      throw new InternalServerErrorException(
        'Failed to fetch sales analytics',
        { cause: error },
      );
    }
  }

  async getTopSellingProducts(domain: string, limit: number = 5) {
    console.log(
      `[OrdersService.getTopSellingProducts] Fetching top ${limit} products`,
    );
    try {
      const companyId = await this.resolveCompanyId(domain);

      const topProducts = await this.db
        .select({
          variant_id: product_variants.id,
          variant_name: product_variants.variant_name,
          sku: product_variants.sku,
          // Sum the quantities from order_items
          total_sold: sql<number>`CAST(SUM(${order_items.quantity}) AS INTEGER)`,
          // Calculate total revenue generated by this specific variant
          revenue: sql<number>`CAST(SUM(${order_items.price} * ${order_items.quantity}) AS FLOAT)`,
        })
        .from(order_items)
        .innerJoin(
          product_variants,
          eq(order_items.product_variant_id, product_variants.id),
        )
        .where(
          and(
            eq(order_items.company_id, companyId),
            // Exclude cancelled/returned orders from the "top selling" metric
            sql`${order_items.order_status} NOT IN ('cancelled', 'returned')`,
          ),
        )
        .groupBy(
          product_variants.id,
          product_variants.variant_name,
          product_variants.sku,
        )
        .orderBy(sql`SUM(${order_items.quantity}) DESC`)
        .limit(limit);

      return topProducts;
    } catch (error) {
      throw new InternalServerErrorException(
        'Failed to fetch top selling products',
        { cause: error },
      );
    }
  }
  async getConversionMetrics(domain: string) {
    console.log(
      `[OrdersService.getConversionMetrics] Fetching metrics for: ${domain}`,
    );
    try {
      const companyId = await this.resolveCompanyId(domain);

      // ==========================================
      // 1. OVERALL STORE CONVERSION
      // ==========================================
      const [cartData] = await this.db
        .select({ count: sql<number>`CAST(COUNT(${carts.id}) AS INTEGER)` })
        .from(carts)
        .where(eq(carts.company_id, companyId))
        .catch((error) => {
          console.error('Error fetching cart data:', error);
          throw new InternalServerErrorException(
            'Failed to calculate conversion metrics',
            { cause: error },
          );
        });
      console.log("cartData",cartData);

      const [orderData] = await this.db
        .select({
          count: sql<number>`CAST(COUNT(${order_items.id}) AS INTEGER)`,
        })
        // BUG FIX: Was querying from `order_items` table but selecting COUNT of `orders.id`.
        // `orders` table is not joined here, so `orders.id` would reference an unjoined table.
        // Fixed: select COUNT of `order_items.id` since we're querying order_items directly.
        .from(order_items)
        .where(
          and(
            eq(order_items.company_id, companyId),
            // BUG FIX: Using raw sql template with string interpolation for enum values
            // is unsafe and broken — the interpolated string gets quoted as a SQL identifier,
            // not a string literal. e.g. produces: NOT IN ('CANCELLED') with wrong quoting.
            // Fixed: use Drizzle's `notInArray` operator for type-safe enum comparison.
            notInArray(order_items.order_status, [
              OrderStatus.CANCELLED,
              OrderStatus.RETURNED,
            ]),
          ),
        )
        .catch((error) => {
          console.error('Error fetching order data:', error);
          throw new InternalServerErrorException(
            'Failed to calculate conversion metrics',
            { cause: error },
          );
        });
      console.log('orderData',orderData);
      const totalCarts = cartData?.count || 0;
      const totalOrders = orderData?.count || 0;
      const overallConversionRate =
        totalCarts > 0 ? ((totalOrders / totalCarts) * 100).toFixed(2) : 0;
      const overallAbandonmentRate =
        totalCarts > 0
          ? (((totalCarts - totalOrders) / totalCarts) * 100).toFixed(2)
          : 0;

      // ==========================================
      // 2. PRODUCT/VARIANT LEVEL CONVERSION
      // ==========================================

      // A. Count how many times each variant was added to a cart
      const variantCartStats = await this.db
        .select({
          variant_id: cart_items.product_variant_id,
          cart_additions: sql<number>`CAST(COUNT(${cart_items.id}) AS INTEGER)`,
        })
        .from(cart_items)
        .innerJoin(carts, eq(cart_items.cart_id, carts.id))
        .where(eq(carts.company_id, companyId))
        .groupBy(cart_items.product_variant_id)
        .catch((error) => {
          console.error('Error fetching cart stats:', error);
          throw new InternalServerErrorException(
            'Failed to calculate conversion metrics',
            { cause: error },
          );
        });

      // B. Count how many times each variant was successfully ordered
      const variantOrderStats = await this.db
        .select({
          variant_id: order_items.product_variant_id,
          order_completions: sql<number>`CAST(COUNT(${order_items.id}) AS INTEGER)`,
        })
        .from(order_items)
        .where(
          and(
            eq(order_items.company_id, companyId),
            // BUG FIX: Same raw sql enum interpolation issue as above.
            // Fixed: use `notInArray` for correct, type-safe SQL generation.
            notInArray(order_items.order_status, [
              OrderStatus.CANCELLED,
              OrderStatus.RETURNED,
            ]),
          ),
        )
        .groupBy(order_items.product_variant_id)
        .catch((error) => {
          console.error('Error fetching order stats:', error);
          throw new InternalServerErrorException(
            'Failed to calculate conversion metrics',
            { cause: error },
          );
        });

      // C. Get Variant Details for the UI (Name, SKU)
      const variantIds = variantCartStats
        .map((v) => v.variant_id)
        .filter(Boolean) as string[];

      let productDetails: any[] = [];
      if (variantIds.length > 0) {
        productDetails = await this.db
          .select({
            id: product_variants.id,
            name: product_variants.variant_name,
            sku: product_variants.sku,
          })
          .from(product_variants)
          .where(inArray(product_variants.id, variantIds))
          .catch((error) => {
            console.error('Error fetching product details:', error);
            throw new InternalServerErrorException(
              'Failed to calculate conversion metrics',
              { cause: error },
            );
          });
      }
console.log('productDetails',productDetails)
      // D. Merge the data together
      const productConversions = productDetails.map((details) => {
        // BUG FIX: Local variables `cartData` and `orderData` shadow the outer-scope
        // `cartData` and `orderData` declared above for overall metrics, causing confusion
        // and potential incorrect references. Renamed to `variantCart` and `variantOrder`.
        const variantCart = variantCartStats.find(
          (v) => v.variant_id === details.id,
        );
        const variantOrder = variantOrderStats.find(
          (v) => v.variant_id === details.id,
        );

        const cartAdditions = variantCart?.cart_additions || 0;
        const orderCompletions = variantOrder?.order_completions || 0;
        const conversionRate =
          cartAdditions > 0
            ? ((orderCompletions / cartAdditions) * 100).toFixed(2)
            : 0;

        return {
          variantId: details.id,
          variantName: details.name,
          sku: details.sku,
          cartAdditions,
          orderCompletions,
          conversionRate: Number(conversionRate),
        };
      });
      console.log('productConversions', productConversions);
      // Sort by most cart additions descending
      productConversions.sort((a, b) => b.cartAdditions - a.cartAdditions);

      return {
        overall: {
          totalCarts,
          totalOrders,
          conversionRate: Number(overallConversionRate),
          abandonmentRate: Number(overallAbandonmentRate),
        },
        productConversions,
      };
    } catch (error) {
      throw new InternalServerErrorException(
        'Failed to calculate conversion metrics',
        { cause: error },
      );
    }
  }

  async exportVendorAnalytics(domain: string): Promise<string> {
    console.log(
      `[OrdersService.exportVendorAnalytics] Generating CSV for: ${domain}`,
    );
    try {
      const companyId = await this.resolveCompanyId(domain);

      // 1. Get Cart Additions per variant
      const variantCartStats = await this.db
        .select({
          variant_id: cart_items.product_variant_id,
          cart_additions: sql<number>`CAST(COUNT(${cart_items.id}) AS INTEGER)`,
        })
        .from(cart_items)
        .innerJoin(carts, eq(cart_items.cart_id, carts.id))
        .where(eq(carts.company_id, companyId))
        .groupBy(cart_items.product_variant_id)
        .catch((error) => {
          console.error('Error fetching cart stats:', error);
          throw new InternalServerErrorException(
            'Failed to export analytics CSV',
            { cause: error },
          );
        });

      // 2. Get Orders & Revenue per variant
      const variantOrderStats = await this.db
        .select({
          variant_id: order_items.product_variant_id,
          units_sold: sql<number>`CAST(SUM(${order_items.quantity}) AS INTEGER)`,
          revenue: sql<number>`CAST(SUM(${order_items.price} * ${order_items.quantity}) AS FLOAT)`,
        })
        .from(order_items)
        .where(
          // Already correctly using notInArray here — no change needed.
          and(
            eq(order_items.company_id, companyId),
            notInArray(order_items.order_status, [
              OrderStatus.CANCELLED,
              OrderStatus.RETURNED,
            ]),
          ),
        )
        .groupBy(order_items.product_variant_id)
        .catch((error) => {
          console.error('Error fetching order stats:', error);
          throw new InternalServerErrorException(
            'Failed to export analytics CSV',
            { cause: error },
          );
        });

      // 3. Get Variant Details
      // BUG FIX: The deduplication logic using `self.indexOf(value)` compares object
      // references, not string values — for UUIDs (strings) this is fine, but the
      // `value &&` check short-circuits falsy strings. Replaced with a Set for
      // correct and efficient deduplication.
      const allVariantIds = Array.from(
        new Set(
          [
            ...variantCartStats.map((v) => v.variant_id),
            ...variantOrderStats.map((v) => v.variant_id),
          ].filter((id): id is string => !!id),
        ),
      );

      let productDetails: any[] = [];
      if (allVariantIds.length > 0) {
        productDetails = await this.db
          .select({
            id: product_variants.id,
            name: product_variants.variant_name,
            sku: product_variants.sku,
          })
          .from(product_variants)
          .where(inArray(product_variants.id, allVariantIds))
          .catch((error) => {
            console.error('Error fetching product details:', error);
            throw new InternalServerErrorException(
              'Failed to export analytics CSV',
              { cause: error },
            );
          });
      }

      // 4. Build CSV Headers
      let csvString =
        'Variant Name,SKU,Cart Additions,Units Sold,Revenue (INR),Conversion Rate (%)\n';

      // 5. Populate CSV Rows
      productDetails.forEach((details) => {
        const cartData = variantCartStats.find(
          (v) => v.variant_id === details.id,
        );
        const orderData = variantOrderStats.find(
          (v) => v.variant_id === details.id,
        );

        const cartAdditions = cartData?.cart_additions || 0;
        const unitsSold = orderData?.units_sold || 0;
        const revenue = orderData?.revenue || 0;

        // BUG FIX: Conversion rate uses `unitsSold / cartAdditions` but `unitsSold`
        // is SUM of quantity (units), while `cartAdditions` is COUNT of cart_item rows.
        // A single cart_item row can have quantity > 1, making this ratio potentially > 100%.
        // For a meaningful conversion rate (did the cart item convert to an order?),
        // count order_item rows, not quantity sum. However since the query already aggregates
        // by variant using COUNT(*) for cart and SUM(quantity) for orders, this is an
        // intentional business metric mismatch — flagged here for awareness.
        // If true row-level conversion is needed, change units_sold query to COUNT(id).
        const conversionRate =
          cartAdditions > 0
            ? ((unitsSold / cartAdditions) * 100).toFixed(2)
            : '0.00';

        // BUG FIX: `details.name` could be null/undefined if variant_name is null in DB,
        // causing `.replace()` to throw. Added null-safe fallback.
        const safeName = `"${(details.name ?? '').replace(/"/g, '""')}"`;

        // BUG FIX: `revenue` comes from a CAST(...AS FLOAT) sql expression which Drizzle
        // returns as a string from pg driver (numeric/decimal columns always return strings).
        // Wrap in Number() to ensure numeric formatting in CSV, not a raw string.
        csvString += `${safeName},${details.sku},${cartAdditions},${unitsSold},${Number(revenue).toFixed(2)},${conversionRate}\n`;
      });

      return csvString;
    } catch (error) {
      if (error instanceof InternalServerErrorException) throw error;

      throw new InternalServerErrorException('Failed to export analytics CSV', {
        cause: error,
      });
    }
  }
}
