import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import {
  WorkerGateway,
  WorkerPool as WorkerPoolContract,
  WorkerTask,
  WorkerResult,
} from '@/domain/application/shared/gateways/worker.gateway';

import { prefixedLogger } from '@/infra/helpers/prefixed-logger';
import { EnvService } from '../env/env.service';

/**
 * WorkerPool - Orquestrador de workers concorrentes
 * Responsabilidades:
 * - Gerenciar fila de tarefas
 * - Distribuir tarefas entre workers disponíveis
 * - Controlar número de workers via variável de ambiente
 * - Implementar processamento concorrente
 *
 * Segue princípios:
 * - Single Responsibility: apenas orquestra tarefas
 * - Dependency Inversion: depende de WorkerGateway abstrato
 */
@Injectable()
export class WorkerPool implements WorkerPoolContract, OnModuleInit, OnModuleDestroy {
  private readonly logger = prefixedLogger(WorkerPool.name);
  private taskQueue: WorkerTask[] = [];
  private activeWorkers = 0;
  private readonly maxWorkers: number;
  private isShuttingDown = false;

  constructor(
    private readonly workerGateway: WorkerGateway,
    private readonly envService: EnvService,
  ) {
    const workerCount = this.envService.get('WORKER_COUNT');
    this.maxWorkers = workerCount ?? 4;
    this.logger.debug(`WorkerPool initialized with ${this.maxWorkers} workers`);
    this.logger.log(workerCount);
  }

  /**
   * Enfileira uma tarefa para processamento
   */
  async enqueue(task: WorkerTask): Promise<WorkerResult> {
    if (this.isShuttingDown) {
      throw new Error('WorkerPool is shutting down');
    }

    return new Promise((resolve) => {
      this.taskQueue.push(task);
      this.processQueue();

      // Aguarda a resolução da tarefa
      const checkInterval = setInterval(() => {
        // Verifica se a tarefa foi processada
        if (this.taskQueue.indexOf(task) === -1) {
          clearInterval(checkInterval);
          resolve({ success: true });
        }
      }, 10);
    });
  }

  /**
   * Processa a fila de tarefas com controle de concorrência
   */
  private processQueue(): void {
    while (this.taskQueue.length > 0 && this.activeWorkers < this.maxWorkers) {
      const task = this.taskQueue.shift();

      if (!task) break;

      this.activeWorkers++;

      void this.workerGateway
        .process(task)
        .then((result) => {
          this.logger.debug(`Task processed: ${result.success ? 'success' : 'failed'}`);
        })
        .catch((error: unknown) => {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          this.logger.error(`Error processing task: ${errorMessage}`);
        })
        .finally(() => {
          this.activeWorkers--;
          // Continua processando fila após liberar worker
          this.processQueue();
        });
    }
  }

  /**
   * Retorna o número de tarefas na fila
   */
  getQueueSize(): number {
    return this.taskQueue.length;
  }

  /**
   * Retorna o número de workers ativos
   */
  getActiveWorkers(): number {
    return this.activeWorkers;
  }

  /**
   * Aguarda conclusão de todas as tarefas
   */
  async drain(): Promise<void> {
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        if (this.taskQueue.length === 0 && this.activeWorkers === 0) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 50);
    });
  }

  /**
   * Ciclo de vida do módulo - inicialização
   */
  onModuleInit() {
    this.logger.debug('WorkerPool module initialized');
  }

  /**
   * Ciclo de vida do módulo - encerramento
   */
  async onModuleDestroy() {
    this.logger.debug('WorkerPool shutting down...');
    this.isShuttingDown = true;
    await this.drain();
    this.logger.debug('WorkerPool shutdown complete');
  }
}
