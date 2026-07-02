import { ID } from '@/core/entities/id';
import { Transaction } from '@/domain/enterprise/entities/transaction';

import { Transaction as DrizzleTransaction } from '../schemas/transaction.schema';
import { Timestamp } from '@/domain/enterprise/entities/value-objects/timestamp';
import { CreditCard } from '@/domain/enterprise/entities/value-objects/credit-card';

export class DrizzleTransactionMapper {
  static toDomain(raw: DrizzleTransaction): Transaction {
    return Transaction.create(
      {
        amount: Number(raw.amount),
        card_number: CreditCard.createCreditCard(raw.card_number),
        currency: raw.currency,
        merchant: raw.merchant,
        status: raw.status,
        warning: raw.warning || undefined,
        authorize_id: raw.authorize_id || undefined,
        timestamp: Timestamp.createTimestamp(raw.timestamp),
        createdAt: raw.createdAt,
        updatedAt: raw.updatedAt || undefined,
      },
      new ID(raw.id),
    );
  }

  static toDrizzle(transaction: Transaction): DrizzleTransaction {
    return {
      id: transaction.id.toString(),
      amount: transaction.amount as unknown as bigint,
      card_number: transaction.card_number.value,
      currency: transaction.currency,
      merchant: transaction.merchant,
      warning: transaction.warning || null,
      authorize_id: transaction.authorize_id || null,
      status: transaction.status,
      timestamp: transaction.timestamp,
      createdAt: transaction.created_at,
      updatedAt: transaction.updated_at || null,
    };
  }
}
