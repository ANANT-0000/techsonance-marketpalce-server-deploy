// src/modules/product-review/product-review.controller.ts
import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Req,
  Headers,
  UseGuards,
} from '@nestjs/common';
import { ProductReviewService } from './product-review.service';
import { CreateProductReviewDto } from './dto/create-product-review.dto';
import { UpdateProductReviewDto } from './dto/update-product-review.dto';
// import { JwtAuthGuard } from 'src/guards/jwt-auth.guard'; // Import your authentication guard here

@Controller(['product-review', 'reviews']) // Allows both routes
export class ProductReviewController {
  constructor(private readonly productReviewService: ProductReviewService) {}

  // @UseGuards(JwtAuthGuard) // Protect this endpoint so only logged in customers can review
  @Post()
  create(
    @Body() createProductReviewDto: CreateProductReviewDto,
    @Body() userId: string,
    @Headers('company-domain') domain: string,
  ) {
    return this.productReviewService.create(
      createProductReviewDto,
      userId,
      domain,
    );
  }

  @Get()
  findAll() {
    return this.productReviewService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.productReviewService.findOneById(id);
  }

  // Gets all reviews for a specific Product (Public)
  @Get('product/:id')
  findByProductId(@Param('id') id: string) {
    return this.productReviewService.findAllByProductId(id);
  }

  // @UseGuards(JwtAuthGuard)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateProductReviewDto: UpdateProductReviewDto,
    @Body() userId: string,
  ) {
    return this.productReviewService.update(id, userId, updateProductReviewDto);
  }

  // @UseGuards(JwtAuthGuard)
  @Delete(':id')
  remove(@Param('id') id: string, @Body() userId: string) {
    return this.productReviewService.remove(id, userId);
  }
}
