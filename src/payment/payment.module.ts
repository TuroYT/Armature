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

    return {
      module: PaymentModule,
      controllers: [PaymentController],
      providers: [PaymentService],
      exports: [PaymentService],
    };
  }
}
