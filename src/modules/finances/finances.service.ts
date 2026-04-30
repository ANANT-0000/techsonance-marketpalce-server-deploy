import {
    Injectable,
    InternalServerErrorException,
    Inject,
} from '@nestjs/common';
import { eq, desc } from 'drizzle-orm';
import { DRIZZLE, type DrizzleService } from 'src/drizzle/drizzle.module';
import { orders } from 'src/drizzle/schema';
import { CompanyService } from '../company/company.service';

@Injectable()
export class FinancesService {
    constructor(
        @Inject(DRIZZLE) private readonly db: DrizzleService,
        private readonly companyService: CompanyService,
    ) { }

    async getVendorEarnings(domain: string) {
        try {
            const companyId = await this.companyService.find(domain);

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
}