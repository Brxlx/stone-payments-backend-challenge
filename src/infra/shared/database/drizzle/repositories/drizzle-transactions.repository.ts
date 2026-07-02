import { Injectable } from '@nestjs/common';
import { eq, desc, and } from 'drizzle-orm';

import { TransactionsRepository } from '@/domain/application/transaction/repositories/transactions.repository';
import { Transaction } from '@/domain/enterprise/entities/transaction';

import { DrizzleService } from '../drizzle.service';
import { DrizzleTransactionMapper } from '../mappers/drizzle-transactions.mapper';
import { transactions } from '../schemas/transaction.schema';
import { PAYMENT_STATUS } from '@/core/consts/payment-status';

@Injectable()
export class DrizzleTransactionsRepository implements TransactionsRepository {
  constructor(private readonly drizzle: DrizzleService) {}

  async save(transaction: Transaction): Promise<Transaction | null> {
    const drizzleTransaction = DrizzleTransactionMapper.toDrizzle(transaction);
    const [result] = await this.drizzle.db
      .insert(transactions)
      .values(drizzleTransaction)
      .returning();

    if (!result) {
      return null;
    }
    return DrizzleTransactionMapper.toDomain(result);
  }
  async findLast50SuspiciousByCardNumber(card_number: string): Promise<Transaction[]> {
    const results = await this.drizzle.db
      .select()
      .from(transactions)
      .where(eq(transactions.card_number, card_number))
      .orderBy(desc(transactions.createdAt))
      .limit(50);

    return results.map((result) => DrizzleTransactionMapper.toDomain(result));
  }
  async flagCardAsSuspicious(card_number: string): Promise<void> {
    const [result] = await this.drizzle.db
      .update(transactions)
      .set({ status: PAYMENT_STATUS.APPROVED_WITH_WARNING })
      .where(eq(transactions.card_number, card_number))
      .returning();

    if (!result) {
      throw new Error('Failed to flag card as suspicious');
    }
  }
  async isCardBlacklisted(card_number: string): Promise<boolean> {
    const result = await this.drizzle.db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.status, PAYMENT_STATUS.APPROVED_WITH_WARNING),
          eq(transactions.card_number, card_number),
        ),
      )
      .limit(1);

    return result.length > 0;
  }
}
