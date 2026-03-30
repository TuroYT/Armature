import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { LoggerService } from '../common/logger/logger.service.js';
import { ErrorCode } from '../common/constants/error-constants.js';
import type { Env } from '../config/env.validation.js';

@Injectable()
export class PaymentService {
  private readonly stripe: Stripe;
  private readonly logger: LoggerService;
  private readonly webhookSecret: string;

  constructor(
    private readonly config: ConfigService<Env, true>,
    logger: LoggerService,
  ) {
    this.logger = logger.withContext('PaymentService');
    this.stripe = new Stripe(
      this.config.get('STRIPE_SECRET_KEY', { infer: true }),
    );
    this.webhookSecret = this.config.get('STRIPE_WEBHOOK_SECRET', {
      infer: true,
    })!;
  }

  async createCheckoutSession(
    priceId: string,
    userId: string,
    successUrl: string,
    cancelUrl: string,
  ): Promise<{ url: string }> {
    const session = await this.stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: { userId },
    });

    this.logger.log('Checkout session created', {
      sessionId: session.id,
      userId,
    });
    return { url: session.url! };
  }

  constructWebhookEvent(payload: Buffer, signature: string): Stripe.Event {
    try {
      return this.stripe.webhooks.constructEvent(
        payload,
        signature,
        this.webhookSecret,
      );
    } catch {
      throw new BadRequestException(ErrorCode.BAD_REQUEST);
    }
  }

  handleWebhookEvent(event: Stripe.Event): void {
    switch (event.type) {
      case 'checkout.session.completed':
        this.logger.log('Checkout completed', { eventId: event.id });
        // TODO: provision subscription
        break;
      case 'customer.subscription.deleted':
        this.logger.log('Subscription cancelled', { eventId: event.id });
        // TODO: revoke access
        break;
      default:
        this.logger.debug('Unhandled Stripe event', { type: event.type });
    }
  }
}
