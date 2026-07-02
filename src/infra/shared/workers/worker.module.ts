import { forwardRef, Module } from '@nestjs/common';
import { WorkerPool } from './worker-pool';
import { RealWorkerGateway } from './real-worker.gateway';
import {
  WorkerGateway,
  WorkerPool as WorkerPoolContract,
} from '@/domain/application/shared/gateways/worker.gateway';
import { EnvModule } from '../env/env.module';
import { TransactionModule } from '@/infra/modules/Transaction/transaction.module';

/**
 * WorkerModule - Módulo responsável pela orquestração de workers
 * Fornece o WorkerPool como provider para uso em toda a aplicação
 * Integra o RealWorkerGateway para processamento de transações
 */
@Module({
  imports: [EnvModule, forwardRef(() => TransactionModule)],
  providers: [
    {
      provide: WorkerGateway,
      useClass: RealWorkerGateway,
    },
    WorkerPool,
    {
      provide: WorkerPoolContract,
      useExisting: WorkerPool,
    },
  ],
  exports: [WorkerPool, WorkerGateway, WorkerPoolContract],
})
export class WorkerModule {}
