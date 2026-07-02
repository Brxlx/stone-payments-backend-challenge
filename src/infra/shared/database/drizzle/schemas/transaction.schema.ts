import { relations } from 'drizzle-orm';
import { bigint, index, pgEnum, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

import { PAYMENT_STATUS } from '@/core/consts/payment-status';
import { CURRENCY_OPTIONS } from '@/core/consts/currency-options';

export const transactionStatusEnum = pgEnum('transaction_status', [
  PAYMENT_STATUS.PENDING,
  PAYMENT_STATUS.APPROVED,
  PAYMENT_STATUS.HIGH_AMOUNT,
  PAYMENT_STATUS.APPROVED_WITH_WARNING,
  PAYMENT_STATUS.REJECTED,
]);

export const currencyEnum = pgEnum('currency', [CURRENCY_OPTIONS.BRL, CURRENCY_OPTIONS.USD]);

export const transactions = pgTable(
  'transaction',
  {
    id: text('id').primaryKey(),
    amount: bigint('amount', { mode: 'bigint' }).notNull(),
    card_number: text('card_number').notNull(),
    currency: currencyEnum('currency').default(CURRENCY_OPTIONS.BRL).notNull(),
    merchant: text('merchant').notNull(),
    warning: text('warning'),
    authorize_id: text('authorize_id'),
    status: transactionStatusEnum('status').default(PAYMENT_STATUS.PENDING).notNull(),
    timestamp: timestamp('timestamp').defaultNow().notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').$onUpdate(() => new Date()),
  },
  (table) => [
    index('transactions_status_idx').on(table.status),
    index('transactions_created_at_idx').on(table.createdAt),
  ],
);
// Exporta a tabela de relacões para que possa ser usada em outros lugares, se necessário
export const transactionsRelations = relations(transactions, () => ({}));

// Mantém a exportação original para compatibilidade
export const transactionSchema = transactions;

export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;
