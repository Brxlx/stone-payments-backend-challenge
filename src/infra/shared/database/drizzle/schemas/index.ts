import * as drizzle from 'drizzle-orm';

import * as transactionSchema from './transaction.schema';

export const schemas = {
  transaction: transactionSchema,
} as const;

/**
 * Type utility para extrair tabelas de schemas individuais
 * Filtra apenas propriedades que são instâncias de tabelas Drizzle
 */
type ExtractTablesFromSchema<T> = {
  [K in keyof T]: T[K] extends drizzle.Table ? T[K] : never;
}[keyof T];

/**
 * Mapeia cada schema para sua respectiva tabela principal
 * Assume que cada schema exporta uma única tabela principal
 */
type SchemaToTableMapping = {
  [K in keyof typeof schemas]: ExtractTablesFromSchema<(typeof schemas)[K]>;
};

/**
 * Schema principal do banco de dados gerado automaticamente
 * Este tipo é inferido dinamicamente baseado nos schemas importados
 */
export type DatabaseSchema = SchemaToTableMapping;
/**
 * Builder para criar o schema do Drizzle com base nos schemas individuais
 * Este método é útil para inicializar o Drizzle com o schema completo
 * Sempre atualize este método se novos schemas forem adicionados
 * @returns DatabaseSchema completo para uso no Drizzle
 */
export const buildDrizzleSchema = (): DatabaseSchema => {
  return {
    transaction: transactionSchema.transactions,
  };
};

export const drizzleSchemaConfig = buildDrizzleSchema();

/**
 * Type utility para acessar tabelas específicas com type safety
 */
export type TableReference<T extends keyof DatabaseSchema> = DatabaseSchema[T];
