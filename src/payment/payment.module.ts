import { DynamicModule, Logger, Module } from '@nestjs/common';
import { PaymentService } from './payment.service.js';
import { PaymentController } from './payment.controller.js';

@Module({})
export class PaymentModule {
  /**
   * Self-activating dynamic module.
   * Active when STRIPE_SECRET_KEY is set — controllers register automatically,
   * so Swagger documents the payment routes only when the module is active.
   */
  static register(): DynamicModule {
    const isActive = !!process.env['STRIPE_SECRET_KEY'];

    if (!isActive) {
      new Logger('PaymentModule').warn(
        'Stripe not configured (STRIPE_SECRET_KEY missing) — module disabled',
      );
      return { module: PaymentModule };
    }

    // STRIPE_WEBHOOK_SECRET is required when Stripe is active: without it,
    // constructEvent() cannot verify webhook signatures and the endpoint
    // silently accepts forged payloads (subscription spoofing, billing fraud).
    if (!process.env['STRIPE_WEBHOOK_SECRET']) {
      new Logger('PaymentModule').error(
        'STRIPE_WEBHOOK_SECRET is not set. ' +
          'The /api/payment/webhook endpoint will reject every Stripe request. ' +
          'Generate a webhook secret in the Stripe dashboard and set it.',
      );
    }

    return {
      module: PaymentModule,
      controllers: [PaymentController],
      providers: [PaymentService],
      exports: [PaymentService],
    };
  }
}
