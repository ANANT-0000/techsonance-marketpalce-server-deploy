jest.mock('got', () => ({
  default: {
    post: jest.fn(),
    get: jest.fn(),
  },
}));

import { Test, TestingModule } from '@nestjs/testing';
import { ShippingManagerService } from '../shipping-manager.service';
import { CryptoService } from '../crypto.service';
import { ShipRocketService } from '../../ship-rocket/ship-rocket.service';
import { MailService } from '../../../common/services/mail/mail.service';
import { InventoryService } from '../../inventory/inventory.service';
import { DRIZZLE } from '../../../drizzle/drizzle.module';
import { HttpException, HttpStatus, UnauthorizedException } from '@nestjs/common';
import { ShippingStatus, OrderStatus } from '../../../drizzle/types/types';

describe('ShippingManagerService', () => {
  let service: ShippingManagerService;
  let dbMock: any;
  let cryptoServiceMock: any;
  let shipRocketServiceMock: any;
  let mailServiceMock: any;
  let inventoryServiceMock: any;

  beforeEach(async () => {
    // Plain object thenable (so we can easily mock and chain without native Promise prototype restrictions)
    dbMock = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      returning: jest.fn().mockReturnThis(),
      catch: jest.fn().mockImplementation((cb) => Promise.resolve([]).catch(cb)),
      then: jest.fn().mockImplementation((onFulfilled) => Promise.resolve([]).then(onFulfilled)),
      transaction: jest.fn().mockImplementation((cb) => cb(dbMock)),
      query: {
        company: {
          findFirst: jest.fn(),
        },
        vendor: {
          findFirst: jest.fn(),
        },
        orders: {
          findFirst: jest.fn(),
        },
      },
    };

    cryptoServiceMock = {
      encrypt: jest.fn((val) => `enc-${val}`),
      decrypt: jest.fn((val) => val.replace('enc-', '')),
    };

    shipRocketServiceMock = {
      createDraftOrder: jest.fn(),
      getToken: jest.fn(),
    };

    mailServiceMock = {
      sendEmail: jest.fn(),
    };

    inventoryServiceMock = {
      rollbackStockForOrder: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ShippingManagerService,
        { provide: DRIZZLE, useValue: dbMock },
        { provide: CryptoService, useValue: cryptoServiceMock },
        { provide: ShipRocketService, useValue: shipRocketServiceMock },
        { provide: MailService, useValue: mailServiceMock },
        { provide: InventoryService, useValue: inventoryServiceMock },
      ],
    }).compile();

    service = module.get<ShippingManagerService>(ShippingManagerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('resolveStrategy', () => {
    it('should throw BadRequestException if company logistics is inactive', async () => {
      dbMock.then = jest.fn().mockImplementation((onFulfilled) =>
        Promise.resolve([
          { id: 'company-123', logistics_mode: 'STANDALONE', logistics_is_active: false }
        ]).then(onFulfilled)
      );

      await expect(service.resolveStrategy('company-123')).rejects.toThrow(
        new HttpException(
          'Standalone logistics deactivated due to invalid credentials. Please update settings.',
          HttpStatus.BAD_REQUEST,
        ),
      );
    });

    it('should return strategy successfully if active', async () => {
      dbMock.then = jest.fn().mockImplementation((onFulfilled) =>
        Promise.resolve([
          {
            id: 'company-123',
            logistics_is_active: true,
            logistics_mode: 'STANDALONE',
            encrypted_logistics_api_key: 'enc-key',
            encrypted_logistics_api_secret: 'enc-secret',
            logistics_pickup_id: 'loc-1',
          }
        ]).then(onFulfilled)
      );

      const strategy = await service.resolveStrategy('company-123');
      expect(strategy).toEqual({
        logisticsMode: 'STANDALONE',
        credentials: { email: 'key', password: 'secret' },
        pickupLocationId: 'loc-1',
      });
    });
  });

  describe('createDraftOrderForOrder - Circuit Breaker', () => {
    it('should trigger circuit breaker (deactivate logistics + email vendor) on 401 Unauthorized', async () => {
      // Mock company details resolver query
      dbMock.then = jest.fn().mockImplementation((onFulfilled) =>
        Promise.resolve([
          {
            id: 'company-123',
            logistics_is_active: true,
            logistics_mode: 'STANDALONE',
            encrypted_logistics_api_key: 'enc-key',
            encrypted_logistics_api_secret: 'enc-secret',
          }
        ]).then(onFulfilled)
      );

      // Mock order details query with correct phone and address structure
      dbMock.query.orders.findFirst.mockResolvedValue({
        id: 'order-123',
        company_id: 'company-123',
        customer: { email: 'cust@example.com', first_name: 'John', last_name: 'Doe', phone: '9876543210' },
        address: {
          name: 'John Doe',
          phone: '9876543210',
          address_line_1: '123 St',
          city: 'Delhi',
          state: 'Delhi',
          postal_code: '110001',
          country: 'India',
        },
        items: [{ sku: 'SKU1', variant: { hsn_code: '123' }, quantity: 1, price: '100' }],
      });

      shipRocketServiceMock.createDraftOrder.mockRejectedValue(
        new UnauthorizedException('Unauthorized API token'),
      );

      // Mock the findFirst calls for vendor query
      dbMock.query.vendor.findFirst.mockResolvedValue({
        id: 'vendor-123',
        user: { email: 'vendor@example.com' },
      });

      const updateSpy = jest.spyOn(dbMock, 'update');

      await expect(
        service.createDraftOrderForOrder('order-123', 'company-123'),
      ).rejects.toThrow(UnauthorizedException);

      expect(updateSpy).toHaveBeenCalled();
      expect(mailServiceMock.sendEmail).toHaveBeenCalled();
    });
  });

  describe('handleWebhookUpdate', () => {
    it('should skip regression updates', async () => {
      // Mock db queries: first byAwb select, second fullRow select
      dbMock.then = jest.fn()
        .mockImplementationOnce((onFulfilled) => Promise.resolve([{ company_id: 'company-123' }]).then(onFulfilled))
        .mockImplementationOnce((onFulfilled) => Promise.resolve([{
          id: 'detail-123',
          order_id: 'order-123',
          company_id: 'company-123',
          shipping_status: 'DELIVERED', // Rank 7
        }]).then(onFulfilled));

      shipRocketServiceMock.getToken.mockResolvedValue('expected-token');

      const payload: any = {
        awb: 'AWB123',
        current_status: 'SHIPPED', // Rank 4
        current_status_id: 4,
        order_id: 'order-123',
      };

      const result = await service.handleWebhookUpdate(payload, 'Bearer expected-token');
      expect(result).toEqual({
        success: true,
        action: 'SKIPPED_REGRESSION',
        currentStatus: 'DELIVERED',
        rejectedStatus: 'SHIPPED',
      });
    });

    it('should update status and trigger RTO stock rollback on RTO status', async () => {
      // Mock db queries: first byAwb, second fullRow, third items select
      dbMock.then = jest.fn()
        .mockImplementationOnce((onFulfilled) => Promise.resolve([{ company_id: 'company-123' }]).then(onFulfilled))
        .mockImplementationOnce((onFulfilled) => Promise.resolve([{
          id: 'detail-123',
          order_id: 'order-123',
          company_id: 'company-123',
          shipping_status: 'SHIPPED', // Rank 4
        }]).then(onFulfilled))
        .mockImplementationOnce((onFulfilled) => Promise.resolve([{
          product_variant_id: 'var-123',
          quantity: 2,
        }]).then(onFulfilled));

      shipRocketServiceMock.getToken.mockResolvedValue('expected-token');

      const payload: any = {
        awb: 'AWB123',
        current_status: 'RTO',
        current_status_id: 10,
        order_id: 'order-123',
      };

      const result = await service.handleWebhookUpdate(payload, 'Bearer expected-token');
      expect(result).toEqual({ success: true, updatedStatus: 'RTO' });

      // Verify that rollbackStockForOrder was triggered
      expect(inventoryServiceMock.rollbackStockForOrder).toHaveBeenCalledWith(
        [{ variantId: 'var-123', quantity: 2 }],
        'company-123',
        expect.any(Object),
      );
    });
  });
});
