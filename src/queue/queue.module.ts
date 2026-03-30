import { DynamicModule, Logger, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ExampleProcessor } from './example.processor.js';

@Module({})
export class QueueModule {
  /**
   * Self-activating dynamic module.
   * Active when REDIS_URL is set — BullMQ workers register automatically.
   */
  static register(): DynamicModule {
    const redisUrl = process.env['REDIS_URL'];

    if (!redisUrl) {
      new Logger('QueueModule').warn(
        'Redis not configured (REDIS_URL missing) — queue module disabled',
      );
      return { module: QueueModule };
    }

    return {
      module: QueueModule,
      imports: [
        BullModule.forRoot({ connection: { url: redisUrl } }),
        BullModule.registerQueue({ name: 'example' }),
      ],
      providers: [ExampleProcessor],
      exports: [BullModule],
    };
  }
}
