import {
  Injectable,
  Inject,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { DRIZZLE, type DrizzleService } from 'src/drizzle/drizzle.module';
import { eq } from 'drizzle-orm';
import { orders, invoices, gst_registrations } from 'src/drizzle/schema';
import { PdfService } from 'src/utils/pdf/pdf.service';
import { UploadToCloudService } from 'src/utils/upload-to-cloud/upload-to-cloud.service';
import { randomUUID } from 'crypto';

// ─── Strict Interfaces (mirrors Drizzle relational query shape) ────────────────

interface WarehouseAddress {
  address_line_1: string;
  city: string;
  state: string;
  postal_code: string;
}

interface Warehouse {
  id: string;
  warehouse_name: string;
  address: WarehouseAddress | null;
}

interface OrderItem {
  id: string;
  quantity: number;
  price: string; // Drizzle returns decimal columns as string
  company_id: string;
  variant: {
    product: {
      name: string;
      vendor: {
        store_name: string;
      };
    };
    inventory: {
      warehouse: Warehouse;
    } | null;
  } | null;
}

interface OrderWithRelations {
  id: string;
  company_id: string;
  customer: {
    first_name: string | null;
    last_name: string | null;
    phone_number: string | null;
    email: string;
  };
  address: {
    address_line_1: string;
    city: string;
    state: string;
    postal_code: string;
  };
  items: OrderItem[];
}

// ─── Grouping Types ────────────────────────────────────────────────────────────

interface WarehouseGroup {
  warehouse: Warehouse;
  items: OrderItem[];
}

interface GroupingResult {
  // Items with a valid warehouse — keyed by warehouse.id
  // All items sharing the same warehouse.id share ONE invoice
  assigned: Map<string, WarehouseGroup>;

  // Items where warehouse/inventory relation is null or missing
  // These are NOT silently merged — they're surfaced for ops visibility
  unresolved: OrderItem[];
}

// ─── Mapped PDF types ──────────────────────────────────────────────────────────

interface MappedOrderInfo {
  id: string;
  customerName: string;
  customerPhone: string;
  shippingAddress: {
    addressLine1: string;
    city: string;
    state: string;
    pincode: string;
  };
}

interface MappedVendorInfo {
  companyName: string;
  gstNumber: string;
  mobileNumber: string;
  email: string;
}

interface MappedWarehouseAddress {
  addressLine1: string;
  city: string;
  state: string;
  pincode: string;
}

interface MappedItem {
  productName: string;
  quantity: number;
  price: number;
  taxAmount: number;
}

// ─── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class InvoiceService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleService,
    private readonly pdfService: PdfService,
    private readonly uploadToCloudService: UploadToCloudService,
  ) {}

  async createInvoice(orderId: string): Promise<void> {
    // ── Step 1: Fetch order + all deep relations in ONE query ──────────────────
    const orderData = (await this.db.query.orders.findFirst({
      where: eq(orders.id, orderId),
      with: {
        customer: true,
        address: true,
        items: {
          with: {
            variant: {
              with: {
                product: {
                  with: { vendor: true },
                },
                inventory: {
                  with: {
                    warehouse: {
                      with: { address: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
    })) as OrderWithRelations | undefined;

    if (!orderData) {
      throw new NotFoundException(`Order ${orderId} not found`);
    }
    if (!orderData.items.length) {
      throw new NotFoundException(`Order ${orderId} has no items`);
    }

    // ── Step 2: GST details (one extra query — different table root) ───────────
    const gstDetails = await this.db.query.gst_registrations.findFirst({
      where: eq(gst_registrations.company_id, orderData.company_id),
    });

    // ── Step 3: Group items by warehouse ──────────────────────────────────────
    //
    // RULE:
    //   Same warehouse ID  → items share ONE invoice (grouped together)
    //   Different warehouse → each gets its OWN separate invoice
    //   No warehouse found  → item is flagged as unresolved, NOT silently merged
    //
    const { assigned, unresolved } = this.groupItemsByWarehouse(
      orderData.items,
    );

    if (unresolved.length > 0) {
      console.warn(
        `[InvoiceService] Order ${orderId}: ${unresolved.length} item(s) have no ` +
          `resolvable warehouse assignment and will be skipped. ` +
          `Item IDs: [${unresolved.map((i) => i.id).join(', ')}]`,
      );
    }

    if (assigned.size === 0) {
      throw new InternalServerErrorException(
        `No items in order ${orderId} have a valid warehouse. Cannot generate any invoices.`,
      );
    }

    // ── Step 4: Build shared info objects (computed once, passed to all invoices)
    const mappedOrderInfo: MappedOrderInfo = {
      id: orderData.id,
      customerName:
        [orderData.customer.first_name, orderData.customer.last_name]
          .filter(Boolean)
          .join(' ') || 'Customer',
      customerPhone: orderData.customer.phone_number ?? 'N/A',
      shippingAddress: {
        addressLine1: orderData.address.address_line_1,
        city: orderData.address.city,
        state: orderData.address.state,
        pincode: orderData.address.postal_code,
      },
    };

    const mappedVendorInfo: MappedVendorInfo = {
      companyName: this.resolveVendorName(assigned),
      gstNumber: gstDetails?.gst_number ?? 'N/A',
      mobileNumber: 'N/A',
      email: orderData.customer.email,
    };

    // ── Step 5: Generate all warehouse invoices IN PARALLEL ───────────────────
    //
    // Promise.allSettled ensures one warehouse failure does NOT cancel others.
    // Each warehouse group independently generates its PDF, uploads it, and
    // returns the DB rows to insert.
    //
    const results = await Promise.allSettled(
      Array.from(assigned.values()).map((group) =>
        this.generateInvoiceForGroup(
          orderData.id,
          group,
          mappedOrderInfo,
          mappedVendorInfo,
        ),
      ),
    );

    // ── Step 6: Collect successes, surface failures ────────────────────────────
    const invoiceInsertions: (typeof invoices.$inferInsert)[] = [];

    for (const result of results) {
      if (result.status === 'fulfilled') {
        invoiceInsertions.push(...result.value);
      } else {
        console.error(
          `[InvoiceService] Warehouse invoice generation failed for order ${orderId}:`,
          result.reason,
        );
      }
    }

    if (invoiceInsertions.length === 0) {
      throw new InternalServerErrorException(
        `All invoice generations failed for order ${orderId}.`,
      );
    }

    // ── Step 7: Single bulk insert for all invoice rows ────────────────────────
    await this.db.insert(invoices).values(invoiceInsertions);
  }

  // ─── Group items by warehouse ─────────────────────────────────────────────────
  //
  // Iterates each order item once — O(n).
  // Uses a Map so lookup+insert per warehouse is O(1).
  //
  private groupItemsByWarehouse(items: OrderItem[]): GroupingResult {
    const assigned = new Map<string, WarehouseGroup>();
    const unresolved: OrderItem[] = [];

    for (const item of items) {
      // Walk the relation chain safely
      const warehouse = item.variant?.inventory?.warehouse ?? null;

      if (!warehouse) {
        // Item cannot be assigned — surface it, never silently discard
        unresolved.push(item);
        continue;
      }

      const existing = assigned.get(warehouse.id);

      if (existing) {
        // Same warehouse → append to existing group → same invoice
        existing.items.push(item);
      } else {
        // New warehouse → new group → new invoice
        assigned.set(warehouse.id, { warehouse, items: [item] });
      }
    }

    return { assigned, unresolved };
  }

  // ─── Generate one invoice for a warehouse group ───────────────────────────────

  private async generateInvoiceForGroup(
    orderId: string,
    group: WarehouseGroup,
    orderInfo: MappedOrderInfo,
    vendorInfo: MappedVendorInfo,
  ): Promise<(typeof invoices.$inferInsert)[]> {
    const invoiceNumber = this.buildInvoiceNumber(group.warehouse.id);

    const warehouseAddress: MappedWarehouseAddress = group.warehouse.address
      ? {
          addressLine1: group.warehouse.address.address_line_1,
          city: group.warehouse.address.city,
          state: group.warehouse.address.state,
          pincode: group.warehouse.address.postal_code,
        }
      : {
          // Warehouse record exists but address FK is null — use name as fallback
          addressLine1: group.warehouse.warehouse_name,
          city: '',
          state: '',
          pincode: '',
        };

    const mappedItems: MappedItem[] = group.items.map((item) => ({
      productName: item.variant?.product?.name ?? 'Unknown Product',
      quantity: item.quantity,
      price: Number(item.price),
      taxAmount: 0, // Wire up from product_tax join when ready
    }));

    // Generate PDF buffer for this warehouse's items
    const pdfBuffer = await this.pdfService.generateWarehouseInvoice(
      invoiceNumber,
      orderInfo,
      vendorInfo,
      warehouseAddress,
      mappedItems,
    );

    // Upload to Cloudinary — one PDF per warehouse group
    const invoiceUrl: string = await this.uploadToCloudService.uploadInvoice(
      pdfBuffer,
      `invoice_${orderId}_${group.warehouse.id}`,
    );

    // One DB row per order item — each item points back to its invoice
    return group.items.map((item) => ({
      invoice_number: invoiceNumber,
      invoice_url: invoiceUrl,
      order_id: orderId,
      order_item_id: item.id,
      company_id: item.company_id,
    }));
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────────

  /**
   * Collision-safe invoice number.
   *
   * OLD: `INV-${Date.now().toString().slice(-6)}-${warehouseId.slice(0, 4)}`
   *   → Collides when two invoices are generated in the same millisecond (common
   *     under Promise.all). The last 6 digits of a Unix timestamp repeat every
   *     ~16 minutes and are identical across concurrent calls.
   *
   * NEW: INV-YYYYMMDD-<UUID6>-<WH4>
   *   → UUID segment is statistically unique per call regardless of timing.
   *   → Date prefix keeps it human-readable and sortable.
   *   → Example: INV-20240512-A3F9B1-AB12
   */
  private buildInvoiceNumber(warehouseId: string): string {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const unique = randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase();
    const whSuffix = warehouseId.replace(/-/g, '').slice(0, 4).toUpperCase();
    return `INV-${date}-${unique}-${whSuffix}`;
  }

  /**
   * Walks all assigned groups to find the first non-empty vendor store name.
   * All items under the same company_id share one vendor for billing.
   */
  private resolveVendorName(assigned: Map<string, WarehouseGroup>): string {
    for (const group of assigned.values()) {
      for (const item of group.items) {
        const name = item.variant?.product?.vendor?.store_name;
        if (name) return name;
      }
    }
    return 'Vendor Store';
  }
}
