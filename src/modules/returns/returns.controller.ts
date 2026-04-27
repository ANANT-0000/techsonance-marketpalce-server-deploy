import { Controller, Post, Body, Get, Patch, Param, UseGuards, Req, Headers, HttpStatus, HttpCode, UploadedFiles } from '@nestjs/common';
import { ReturnsService } from './returns.service';
import { CreateReturnDto } from './dto/create-return.dto';
import { UpdateReturnDto } from './dto/update-return.dto';
import { ParseJsonPipe } from 'src/common/pipes/parseJsonPipe';
import { UploadToCloud } from 'src/common/decorators/upload.decorator';

@Controller({ path: 'returns', version: '1' })

export class ReturnsController {
  constructor(private readonly returnsService: ReturnsService) { }

  @Post('user/:userId')
  @UploadToCloud([
    { name: 'evidence_images', maxCount: 3 },
  ])
  @HttpCode(HttpStatus.CREATED)
  createReturn(@Param('userId') userId: string, @Body(ParseJsonPipe) dto: CreateReturnDto, @UploadedFiles() files: { evidence_images?: Express.Multer.File[] }, @Headers('company-domain') domain: string) {
    console.log(dto, files)
    return this.returnsService.createReturnRequest(userId, dto, files, domain);
  }

  @Get('user/:userId')

  @HttpCode(HttpStatus.OK)
  getCustomerReturns(@Param('userId') userId: string, @Headers('company-domain') domain: string) {
    return this.returnsService.getCustomerReturns(userId, domain);
  }


  @Get('vendor')
  @HttpCode(HttpStatus.OK)
  getVendorReturns(@Headers('company-domain') domain: string) {
    return this.returnsService.getVendorReturns(domain);
  }
  @Get('vendor/:returnId')
  async getVendorReturnById(
    @Param('returnId') returnId: string,
    @Headers('company-domain') domain: string,
  ) {
    return this.returnsService.getVendorReturnById(returnId, domain);
  }
  @Patch(':returnId/status')
  @HttpCode(HttpStatus.ACCEPTED)
  updateStatus(
    @Param('returnId') returnId: string,
    @Body() dto: any,
    @Headers('company-domain') domain: string
  ) {
    console.log("return status dto", dto)
    return this.returnsService.updateReturnStatus(returnId, domain, dto);
  }
}