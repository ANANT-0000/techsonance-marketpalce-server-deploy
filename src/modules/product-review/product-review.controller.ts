import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Headers,
  UseInterceptors,
  UseGuards,
} from '@nestjs/common';
import { ProductReviewService } from './product-review.service';
import { CreateProductReviewDto } from './dto/create-product-review.dto';
import { UpdateProductReviewDto } from './dto/update-product-review.dto';
import { ParseJsonPipe } from '../../common/pipes/parseJsonPipe';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Public } from '../../common/decorators/public.decorator';

@Controller({ version: '1', path: 'product-review' })
export class ProductReviewController {
  constructor(private readonly productReviewService: ProductReviewService) {}

  @UseGuards(JwtAuthGuard) // Protect this endpoint so only logged in customers can review
  @Post(':userId')
  @UseInterceptors(AnyFilesInterceptor())
  create(
    @Param('userId') userId: string,
    @Body('reviewData', ParseJsonPipe) createProductReviewDto: any,
    @Headers('company-domain') domain: string,
  ) {
    return this.productReviewService.create(
      createProductReviewDto,
      userId,
      domain,
    );
  }

  @Public()
  @Get()
  findAll() {
    return this.productReviewService.findAll();
  }

  @Public()
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.productReviewService.findOneById(id);
  }

  @Public()
  @Get('product/:id')
  findByProductId(@Param('id') id: string) {
    return this.productReviewService.findAllByProductId(id);
  }
  @Get('existing/:variantId/:id')
  findExistingReview(
    @Param('id') id: string,
    @Param('variantId') variantId: string,
  ) {
    return this.productReviewService.findExistingReview(id, variantId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':userId/:id')
  update(
    @Param('id') id: string,
    @Body(ParseJsonPipe) updateProductReviewDto: UpdateProductReviewDto,
    @Param('userId') userId: string,
  ) {
    return this.productReviewService.update(id, userId, updateProductReviewDto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':userId/:id')
  remove(@Param('id') id: string, @Param('userId') userId: string) {
    return this.productReviewService.remove(id, userId);
  }
}
