import { describe, it, expect, beforeEach } from 'vitest';
import { RealWorkerGateway } from '@/infra/shared/workers/real-worker.gateway';
import { FakeAuthorizer } from 'test/gateways/authorizer/fake-authorizer';
import { InMemoryTransactionsRepository } from 'test/repositories/in-memory-transactions.repository';
import { makeTransaction } from 'test/factories/make-transaction';
import { PAYMENT_STATUS } from '@/core/consts/payment-status';
import { TransactionsRepository } from '@/domain/application/transaction/repositories/transactions.repository';
import { MakeTransactionUseCase } from '@/domain/application/transaction/use-cases/make-transaction-use-case';
import { TransactionDomainService } from '@/domain/application/transaction/transaction.domain-service';
import { WorkerPool } from '@/domain/application/shared/gateways/worker.gateway';

/**
 * Testes para o RealWorkerGateway
 * Valida a implementação real que coordena com Authorizer e Repository
 */
describe('RealWorkerGateway', () => {
  let realWorker: RealWorkerGateway;
  let fakeAuthorizer: FakeAuthorizer;
  let inMemoryRepository: InMemoryTransactionsRepository;
  let transactionDomainService: TransactionDomainService;

  beforeEach(() => {
    fakeAuthorizer = new FakeAuthorizer();
    inMemoryRepository = new InMemoryTransactionsRepository();
    // Minimal fake workerPool implementation for tests
    const fakeWorkerPool: WorkerPool = {
      // eslint-disable-next-line @typescript-eslint/require-await
      enqueue: async () => ({ success: true }),
      getQueueSize: () => 0,
      getActiveWorkers: () => 0,
    };

    const makeTransactionUseCase = new MakeTransactionUseCase(inMemoryRepository, fakeAuthorizer);
    transactionDomainService = new TransactionDomainService(
      makeTransactionUseCase,
      fakeWorkerPool,
      fakeAuthorizer,
      inMemoryRepository,
    );

    realWorker = new RealWorkerGateway(transactionDomainService);
  });

  it('should process a transaction successfully', async () => {
    const transaction = makeTransaction({});
    const task = {
      transaction,
      retries: 0,
    };

    const result = await realWorker.process(task);

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.error).toBeUndefined();
  });

  it('should save transaction in repository after successful authorization', async () => {
    const transaction = makeTransaction({});
    const task = {
      transaction,
      retries: 0,
    };

    const result = await realWorker.process(task);

    expect(result.success).toBe(true);
    const savedTransaction = inMemoryRepository.items.get(transaction.id.toString());
    expect(savedTransaction).toBeDefined();
    expect(savedTransaction?.status).toBe(PAYMENT_STATUS.APPROVED);
  });

  it('should set authorize_id from authorizer response', async () => {
    const transaction = makeTransaction({});
    const task = {
      transaction,
      retries: 0,
    };

    const result = await realWorker.process(task);

    expect(result.success).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect((result.data as any)?.authorizeId).toBeDefined();
    const savedTransaction = inMemoryRepository.items.get(transaction.id.toString());
    expect(savedTransaction?.authorize_id).toBeDefined();
  });

  it('should reject transaction when authorizer rejects', async () => {
    fakeAuthorizer.isAuthorized = false;

    const transaction = makeTransaction({});
    const task = {
      transaction,
      retries: 0,
    };

    const result = await realWorker.process(task);

    expect(result.success).toBe(false);
    expect(result.error?.message).toBe('Authorization failed');
    const savedTransaction = inMemoryRepository.items.get(transaction.id.toString());
    expect(savedTransaction?.status).toBe(PAYMENT_STATUS.REJECTED);
  });

  it('should return transaction data with correct status', async () => {
    const transaction = makeTransaction({});
    const task = {
      transaction,
      retries: 0,
    };

    const result = await realWorker.process(task);

    expect(result.success).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect((result.data as any)?.transactionId).toBe(transaction.id.toString());
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect((result.data as any)?.status).toBe(PAYMENT_STATUS.APPROVED);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect((result.data as any)?.processedAt).toBeDefined();
  });

  it('should handle errors gracefully', async () => {
    // Simula erro forçando um cenário de falha
    // Por exemplo, removendo o repositório temporariamente

    const brokenTransactionDomainService = new TransactionDomainService(
      new MakeTransactionUseCase(null as unknown as TransactionsRepository, fakeAuthorizer),
      null as unknown as WorkerPool,
      fakeAuthorizer,
      null as unknown as TransactionsRepository,
    );

    const brokenWorker = new RealWorkerGateway(brokenTransactionDomainService);

    const transaction = makeTransaction({});
    const task = {
      transaction,
      retries: 0,
    };

    const result = await brokenWorker.process(task);

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});
