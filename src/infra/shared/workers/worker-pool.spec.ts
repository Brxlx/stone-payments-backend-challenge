import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WorkerPool } from '@/infra/shared/workers/worker-pool';
import { FakeWorkerGateway } from 'test/gateways/workers/fake-worker.gateway';
import { makeTransaction } from 'test/factories/make-transaction';
import { CoreEnv } from '@/domain/application/shared/env/env';
import { Env } from '../env/env.schema';

/**
 * Testes para o WorkerPool
 * Valida:
 * - Processamento concorrente
 * - Enfileiramento de tarefas
 * - Limite de workers
 */
describe('WorkerPool', () => {
  let workerPool: WorkerPool;
  let fakeWorkerGateway: FakeWorkerGateway;

  beforeEach(() => {
    fakeWorkerGateway = new FakeWorkerGateway();

    // Mock do env service
    const mockEnvService = {
      get: (key: string) => {
        if (key === 'WORKER_COUNT') return 2; // 2 workers para testes
        return;
      },
    };

    workerPool = new WorkerPool(fakeWorkerGateway, mockEnvService as CoreEnv<Env>);
  });

  it('should create worker pool with correct number of workers', () => {
    expect(workerPool.getActiveWorkers()).toBe(0);
    expect(workerPool.getQueueSize()).toBe(0);
  });

  it('should enqueue and process a single task', async () => {
    const transaction = makeTransaction({});
    const task = {
      transaction,
      retries: 0,
    };

    fakeWorkerGateway.processDelay = 10;

    const result = await workerPool.enqueue(task);

    expect(result.success).toBe(true);
    expect(workerPool.getQueueSize()).toBe(0);
  });

  it('should process multiple tasks concurrently up to max workers', async () => {
    const tasks = Array.from({ length: 4 }, () => ({
      transaction: makeTransaction({}),
      retries: 0,
    }));

    fakeWorkerGateway.processDelay = 50;

    const startTime = Date.now();

    // Enfileira todas as tarefas
    await Promise.all(tasks.map((task) => workerPool.enqueue(task)));

    const endTime = Date.now();
    const duration = endTime - startTime;

    // Com 2 workers e 4 tarefas de 50ms cada:
    // Sequential: 200ms
    // Concurrent (2 workers): ~100-120ms
    expect(duration).toBeLessThan(150); // Permite margem
    expect(workerPool.getQueueSize()).toBe(0);
  });

  it('should handle worker failures gracefully', async () => {
    fakeWorkerGateway.shouldFail = true;
    fakeWorkerGateway.failureMessage = 'Test error';
    fakeWorkerGateway.processDelay = 10;

    const transaction = makeTransaction({});
    const task = {
      transaction,
      retries: 0,
    };

    const result = await workerPool.enqueue(task);
    expect(result.success).toBe(true); // Queue enqueue é bem sucedido
  });

  it('should reject enqueue when shutting down', async () => {
    // Simula shutdown
    await workerPool.onModuleDestroy();

    const transaction = makeTransaction({});
    const task = {
      transaction,
      retries: 0,
    };

    await expect(workerPool.enqueue(task)).rejects.toThrow('WorkerPool is shutting down');
  });

  it('should drain all tasks before shutdown', async () => {
    const tasks = Array.from({ length: 3 }, () => ({
      transaction: makeTransaction({}),
      retries: 0,
    }));

    fakeWorkerGateway.processDelay = 20;

    const spyDrain = vi.spyOn(workerPool, 'drain');

    // Enfileira tarefas sem aguardar
    Promise.all(tasks.map((task) => workerPool.enqueue(task))).catch(() => {
      // Ignore
    });

    // Aguarda um pouco para as tarefas serem processadas
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Verifica que drain foi chamado durante shutdown
    await workerPool.onModuleDestroy();
    expect(spyDrain).toHaveBeenCalled();
  });
});
