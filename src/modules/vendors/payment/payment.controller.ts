import {
  Controller,
  Get,
  Post,
  Body,
  Req,
  UseGuards,
  Headers,
} from '@nestjs/common';
import { RoleGuard } from '../../../guards/role.guard';
import { Role } from '../../../enums/role.enum';
import { Roles } from '../../../common/decorators/roles.decorator';
import { PaymentService } from './payment.service';
import { SavePaymentConfigDto } from './dto/save-config.dto';

@Controller({
  version: '1',
  path: 'vendor/payment',
})
@UseGuards(RoleGuard)
@Roles(Role.VENDOR)
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Get('config')
  async getConfig(
    @Req() req: any,
    @Headers('company-domain') companyDomain: string,
  ) {
    return this.paymentService.getConfigForUser(req.user, companyDomain);
  }

  @Post('config')
  async saveConfig(
    @Req() req: any,
    @Headers('company-domain') companyDomain: string,
    @Body() body: SavePaymentConfigDto,
  ) {
    return this.paymentService.saveConfigForUser(req.user, companyDomain, body);
  }
}
