import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { LoggerService } from '../common/logger/logger.service.js';

export interface ExampleJobData {
  userId: string;
  payload: Record<string, unknown>;
}

/**
 * Example BullMQ processor — replace with your own job logic.
 * Inject services (PrismaService, etc.) as needed.
 */
@Processor('example')
export class ExampleProcessor extends WorkerHost {
  private readonly logger: LoggerService;

  constructor(logger: LoggerService) {
    super();
    this.logger = logger.withContext('ExampleProcessor');
  }

  async process(job: Job<ExampleJobData>): Promise<void> {
    this.logger.log('Processing job', { jobId: job.id, name: job.name });

    // Replace with your actual job logic
    await new Promise((resolve) => setTimeout(resolve, 100));

    this.logger.log('Job completed', { jobId: job.id });
  }
}
