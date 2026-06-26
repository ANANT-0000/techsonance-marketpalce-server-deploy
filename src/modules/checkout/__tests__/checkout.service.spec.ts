jest.mock('got', () => ({
  default: {
    post: jest.fn(),
    get: jest.fn(),
  },
}));

import { Test, TestingModule } from '@nestjs/testing';
import { CheckoutService } from '../checkout.service';
import { OrdersService } from '../../orders/orders.service';
import { CompanyService } from '../../company/company.service';
import { MailService } from '../../../common/services/mail/mail.service';
import { ShipRocketService } from '../../ship-rocket/ship-rocket.service';
import { ConfigService } from '@nestjs/config';
import { CryptoService } from '../../shipping/crypto.service';
import { DRIZZLE } from '../../../drizzle/drizzle.module';
import { HttpException, HttpStatus } from '@nestjs/common';
import { InitiateCheckoutDto, VerifyCheckoutDto } from '../dto/checkout.dto';
import { CheckoutErrorKeyEnum } from '../constants/checkout.enums';

describe('CheckoutService', () => {
  let service: CheckoutService;
  let dbMock: any;
  let ordersServiceMock: any;
  let companyServiceMock: any;
  let mailServiceMock: any;
  let shipRocketServiceMock: any;
  let configServiceMock: any;
  let cryptoServiceMock: any;

  beforeEach(async () => {
    dbMock = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([]),
      insert: jest.fn().mockReturnThis(),
      values: jest.fn().mockImplementation(() => Promise.resolve([])),
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      returning: jest.fn().mockReturnThis(),
      transaction: jest.fn().mockImplementation((cb) => cb(dbMock)),
    };

    ordersServiceMock = {
      createOrder: jest.fn(),
      completeOrderVerification: jest.fn(),
    };

    companyServiceMock = {
      find: jest.fn().mockResolvedValue('company-uuid'),
    };

    mailServiceMock = {
      sendEmail: jest.fn(),
    };

    shipRocketServiceMock = {
      getServiceability: jest.fn(),
    };

    configServiceMock = {
      get: jest.fn((key: string) => {
        if (key === 'SHIPROCKET_PICKUP_PINCODE') return '110001';
        return null;
      }),
    };

    cryptoServiceMock = {
      encrypt: jest.fn((val) => `enc-${val}`),
      decrypt: jest.fn((val) => val.replace('enc-', '')),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CheckoutService,
        { provide: DRIZZLE, useValue: dbMock },
        { provide: OrdersService, useValue: ordersServiceMock },
        { provide: CompanyService, useValue: companyServiceMock },
        { provide: MailService, useValue: mailServiceMock },
        { provide: ShipRocketService, useValue: shipRocketServiceMock },
        { provide: ConfigService, useValue: configServiceMock },
        { provide: CryptoService, useValue: cryptoServiceMock },
      ],
    }).compile();

    service = module.get<CheckoutService>(CheckoutService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('initiateCheckout', () => {
    it('should throw exception if address not found', async () => {
      dbMock.limit.mockResolvedValue([]); // Empty array simulates address not found

      const dto: InitiateCheckoutDto = {
        addressId: 'addr-123',
        paymentMethod: 'Prepaid',
        productVariantId: 'var-456',
        qty: 1,
        promotionId: '',
      };

      await expect(
        service.initiateCheckout('user-123', dto, 'example.com'),
      ).rejects.toThrow(
        new HttpException(CheckoutErrorKeyEnum.ADDRESS_NOT_FOUND, HttpStatus.NOT_FOUND),
      );
    });

    it('should throw exception if no cartId or productVariantId provided', async () => {
      const dto: InitiateCheckoutDto = {
        addressId: 'addr-123',
        paymentMethod: 'Prepaid',
        qty: 1,
        promotionId: '',
      };

      await expect(
        service.initiateCheckout('user-123', dto, 'example.com'),
      ).rejects.toThrow(
        new HttpException(
          CheckoutErrorKeyEnum.EITHER_CARTID_OR_PRODUCTVARIANTID_MUST_BE_PROVIDED,
          HttpStatus.BAD_REQUEST,
        ),
      );
    });
  });

  describe('verifyCheckout', () => {
    it('should correctly call ordersService completeOrderVerification on verifyCheckout', async () => {
      // Mock order select and then user select
      dbMock.limit
        .mockResolvedValueOnce([{ id: 'order-123', user_id: 'user-123', company_id: 'company-uuid' }]) // order select
        .mockResolvedValueOnce([{ email: 'user@example.com', first_name: 'John', last_name: 'Doe' }]); // user select

      ordersServiceMock.completeOrderVerification.mockResolvedValue({
        success: true,
        message: 'Order verified successfully',
        orderId: 'order-123',
      });

      const dto: VerifyCheckoutDto = {
        orderId: 'order-123',
        isSuccess: true,
        promotionId: 'promo-123',
        discountApplied: '10',
      };

      const result = await service.verifyCheckout(dto, 'example.com');
      expect(result).toEqual({
        success: true,
        message: 'Order verified successfully',
        orderId: 'order-123',
      });
      expect(ordersServiceMock.completeOrderVerification).toHaveBeenCalled();
    });

    it('should throw error if user_id is missing on the order', async () => {
      dbMock.limit.mockResolvedValueOnce([{ id: 'order-123', company_id: 'company-uuid' }]); // user_id missing

      const dto: VerifyCheckoutDto = {
        orderId: 'order-123',
        isSuccess: true,
      };

      await expect(
        service.verifyCheckout(dto, 'example.com'),
      ).rejects.toThrow(
        new HttpException(CheckoutErrorKeyEnum.USER_NOT_FOUND, HttpStatus.BAD_REQUEST),
      );
    });
  });
});
