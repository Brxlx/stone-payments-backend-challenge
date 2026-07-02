import { Injectable, Logger } from '@nestjs/common';
import {
  WorkerGateway,
  WorkerTask,
  WorkerResult,
} from '@/domain/application/shared/gateways/worker.gateway';
import { TransactionDomainService } from '@/domain/application/transaction/transaction.domain-service';

/**
 * RealWorkerGateway - Implementação real do WorkerGateway
 *
 * Responsabilidades:
 * - Processar tarefas de transação em workers
 * - Coordenar com Authorizer para autorização
 * - Coordenar com Repository para persistência
 * - Tratamento robusto de erros
 *
 * Princípios:
 * - Single Responsibility: Apenas processa tarefas
 * - Dependency Injection: Recebe dependências
 * - Error Handling: Captura e registra erros
 */
@Injectable()
export class RealWorkerGateway implements WorkerGateway {
  private readonly logger = new Logger(RealWorkerGateway.name);

  constructor(private readonly transactionDomainService: TransactionDomainService) {
    // super();
  }

  async process(task: WorkerTask): Promise<WorkerResult> {
    try {
      const { transaction, retries } = task;

      this.logger.debug(`Processing transaction: ${transaction.id.toString()} (retry: ${retries})`);

      // Delegate processing to domain service
      const result: WorkerResult =
        await this.transactionDomainService.processExistingTransaction(transaction);

      if (result.success) {
        this.logger.debug(`Transaction ${transaction.id.toString()} processed successfully`);
      } else {
        this.logger.warn(
          `Transaction ${transaction.id.toString()} processing failed: ${result.error?.message}`,
        );
      }

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      this.logger.error(
        `Error processing transaction ${task.transaction.id.toString()}: ${errorMessage}`,
        error instanceof Error ? error.stack : undefined,
      );
      if (task.retries < 3) {
        return {
          success: false,
          error: new Error(`Failed after ${task.retries} retries: ${errorMessage}`),
        };
      }

      return {
        success: false,
        error: new Error(`Max retries exceeded: ${errorMessage}`),
      };
    }
  }
}
