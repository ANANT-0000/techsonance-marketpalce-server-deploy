import {
    Injectable,
    InternalServerErrorException,
    Inject,
    NotFoundException,
} from '@nestjs/common';
import { eq, desc } from 'drizzle-orm';
import { DRIZZLE, type DrizzleService } from 'src/drizzle/drizzle.module';
import { orders, vendor } from 'src/drizzle/schema';
import { CompanyService } from '../company/company.service';
import { domainExtractor } from 'src/common/filters/domainExtractor.filter';

@Injectable()
export class FinancesService {
    constructor(
        @Inject(DRIZZLE) private readonly db: DrizzleService,
        private readonly companyService: CompanyService,
    ) { }

    async getVendorEarnings(domain: string) {
        try {
                  const filteredDomain = domainExtractor(domain);
            const companyId = await this.companyService.find(filteredDomain);

            // Using Drizzle's Relational Query API
            // This automatically checks your schema relations and connects the IDs
            const orderRecords = await this.db.query.orders.findMany({
                where: eq(orders.company_id, companyId),
                with: {
                    payment: {
                        columns: {
                            id: true,
                            payment_status: true,
                            transaction_ref: true,
                        },
                    },
                },
                orderBy: [desc(orders.created_at)],
            });

            // Calculate earnings on the fly
            // Note: You can move this to an env variable or config table later
            const PLATFORM_FEE_PERCENTAGE = 0.10; // 10% commission

            const earnings = orderRecords.map((order) => {
                const grossAmount = Number(order.total_amount || 0);
                const platformFee = grossAmount * PLATFORM_FEE_PERCENTAGE;
                const netEarning = grossAmount - platformFee;

                // Determine Settlement Status based on the connected Payment record
                let earningStatus = 'PENDING';

                if (order.payment) {
                    const status = order.payment.payment_status?.toUpperCase();
                    if (status === 'PAID' || status === 'SUCCESS') {
                        earningStatus = 'CLEARED';
                    } else if (status === 'REFUNDED') {
                        earningStatus = 'REVERSED';
                    }
                }

                return {
                    id: order.payment?.id || `calc-${order.id}`,
                    order_id: order.id,
                    gross_amount: grossAmount.toFixed(2),
                    platform_fee: platformFee.toFixed(2),
                    net_earning: netEarning.toFixed(2),
                    status: earningStatus,
                    created_at: order.created_at,
                    transaction_ref: order.payment?.transaction_ref || 'N/A',
                };
            });

            // Calculate aggregate dashboard stats
            const totalCleared = earnings
                .filter((e) => e.status === 'CLEARED')
                .reduce((sum, e) => sum + Number(e.net_earning), 0);

            const totalPending = earnings
                .filter((e) => e.status === 'PENDING')
                .reduce((sum, e) => sum + Number(e.net_earning), 0);

            return {
                total_transactions: earnings.length,
                total_cleared_earnings: totalCleared.toFixed(2),
                total_pending_earnings: totalPending.toFixed(2),
                earnings: earnings,
            };
        } catch (error) {
            console.error('FinancesService Error: ', error);
            throw new InternalServerErrorException(
                'Error occurred while fetching company earnings via relations',
                { cause: error },
            );
        }
    }
    async getVendorFinancials(vendorId: string) {
        try {
            // 1. First, find the vendor to get their associated company_id
            const vendorRecord = await this.db.query.vendor.findFirst({
                where: eq(vendor.id, vendorId),
                columns: {
                    company_id: true,
                }
            });

            if (!vendorRecord || !vendorRecord.company_id) {
                throw new NotFoundException('Vendor or associated company not found');
            }

            // 2. Fetch all orders and their associated payments for this company
            const orderRecords = await this.db.query.orders.findMany({
                where: eq(orders.company_id, vendorRecord.company_id),
                with: {
                    payment: {
                        columns: {
                            id: true,
                            payment_status: true,
                            transaction_ref: true,
                        },
                    },
                },
                orderBy: [desc(orders.created_at)],
            });

            // 3. Map the records to match the FinancialData interface for the frontend
            const earnings = orderRecords.map((order) => {
                const grossAmount = Number(order.total_amount || 0);

                // Zero-commission model: Vendor keeps 100%
                const netEarning = grossAmount;

                // Determine Settlement Status
                let earningStatus = 'PENDING';

                if (order.payment) {
                    const status = order.payment.payment_status?.toUpperCase();
                    if (status === 'PAID' || status === 'SUCCESS') {
                        earningStatus = 'CLEARED';
                    } else if (status === 'REFUNDED' || status === 'FAILED') {
                        earningStatus = 'REVERSED';
                    }
                }

                return {
                    id: order.payment?.id || `calc-${order.id}`,
                    order_id: order.id,
                    gross_amount: grossAmount.toFixed(2),
                    platform_fee: "0.00", // No commission taken per order
                    net_earning: earningStatus === 'REVERSED' ? "0.00" : netEarning.toFixed(2),
                    status: earningStatus,
                    created_at: order.created_at,
                    transaction_ref: order.payment?.transaction_ref || 'N/A',
                };
            });

            // 4. Calculate Aggregate KPIs
            const totalCleared = earnings
                .filter((e) => e.status === 'CLEARED')
                .reduce((sum, e) => sum + Number(e.net_earning), 0);

            const totalPending = earnings
                .filter((e) => e.status === 'PENDING')
                .reduce((sum, e) => sum + Number(e.net_earning), 0);

            // 5. Return the exact structure the UI expects
            return {
                success: true,
                message: "Financial ledger retrieved successfully",
                data: {
                    total_transactions: earnings.length,
                    total_cleared_earnings: totalCleared.toFixed(2),
                    total_pending_earnings: totalPending.toFixed(2),
                    earnings: earnings,
                }
            };

        } catch (error) {
            console.error('AdminFinancesService Error: ', error);

            if (error instanceof NotFoundException) throw error;

            throw new InternalServerErrorException(
                'Error occurred while fetching vendor financial ledger',
                { cause: error },
            );
        }
    }
}