import { forwardRef, Module } from '@nestjs/common';
import { TransactionDomainService } from '../../../domain/application/transaction/transaction.domain-service';
import { MakeTransactionUseCase } from '../../../domain/application/transaction/use-cases/make-transaction-use-case';
import { FakeAuthorizer } from '@/infra/shared/gateways/fake-authorizer';
import { Authorizer } from '../../../domain/application/shared/gateways/authorizer.gateway';
import { TransactionsController } from './transactions.controller';
import { DatabaseModule } from '@/infra/shared/database/database.module';
import { WorkerModule } from '@/infra/shared/workers/worker.module';

/**
 * TransactionModule - Módulo de aplicação para transações
 * Fornece os use cases e serviços de transação
 * Integra com workers para processamento concorrente
 */
@Module({
  imports: [DatabaseModule.forRoot({ implementation: 'drizzle' }), forwardRef(() => WorkerModule)],
  providers: [
    TransactionDomainService,
    MakeTransactionUseCase,
    {
      provide: Authorizer,
      useClass: FakeAuthorizer,
    },
  ],
  controllers: [TransactionsController],
  exports: [TransactionDomainService, MakeTransactionUseCase, Authorizer],
})
export class TransactionModule {}
