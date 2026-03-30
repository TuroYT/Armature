import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsString, IsUrl } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import type { Request } from 'express';
import { PaymentService } from './payment.service.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Public } from '../auth/decorators/public.decorator.js';
import type { AuthUser } from '../auth/strategies/jwt.strategy.js';

class CreateCheckoutDto {
  @ApiProperty() @IsString() priceId!: string;
  @ApiProperty() @IsUrl() successUrl!: string;
  @ApiProperty() @IsUrl() cancelUrl!: string;
}

@ApiTags('Payment')
@Controller('api/payment')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Post('checkout')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a Stripe checkout session' })
  createCheckout(
    @Body() dto: CreateCheckoutDto,
    @CurrentUser() user: AuthUser,
  ): Promise<{ url: string }> {
    return this.paymentService.createCheckoutSession(
      dto.priceId,
      user.id,
      dto.successUrl,
      dto.cancelUrl,
    );
  }

  @Public()
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Stripe webhook endpoint (raw body required)' })
  webhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string,
  ): void {
    const event = this.paymentService.constructWebhookEvent(
      req.rawBody!,
      signature,
    );
    this.paymentService.handleWebhookEvent(event);
  }
}
