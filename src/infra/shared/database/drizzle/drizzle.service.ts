import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { format } from 'sql-formatter';

import { prefixedLogger } from '@/infra/helpers/prefixed-logger';

import { EnvService } from '../../env/env.service';
import { DatabaseSchema, drizzleSchemaConfig, schemas } from './schemas';

/**
 * Interface para armazenar o histórico de queries
 */
interface QueryHistoryItem {
  query: string;
  timestamp: number;
}

/**
 * Interface para eventos de query do Drizzle customizada
 */
interface DrizzleQueryEvent {
  query: string;
  params: any[];
  duration?: number;
}

/**
 * Tipo que define o schema completo do banco de dados
 * Importante para o TypeScript inferir corretamente os tipos das queries
 */
export type Database = NodePgDatabase<DatabaseSchema>;

/**
 * Type utility para operações type-safe com tabelas específicas
 */
export type SafeTableAccess = {
  [K in keyof DatabaseSchema]: {
    table: DatabaseSchema[K];
    insertType: DatabaseSchema[K]['$inferInsert'];
    selectType: DatabaseSchema[K]['$inferSelect'];
  };
};

@Injectable()
export class DrizzleService implements OnModuleInit, OnModuleDestroy {
  private logger = new Logger(DrizzleService.name);

  // Instância do pool de conexões PostgreSQL
  private pool: Pool | undefined = undefined;

  // Instância do Drizzle ORM
  private _db: Database | undefined = undefined;

  // Cache do schema para evitar recriações desnecessárias
  private _schemaCache: DatabaseSchema | undefined = undefined;

  // Armazena o histórico de queries recentes para evitar duplicação
  private queryHistory: QueryHistoryItem[] = [];

  // Tempo em ms para considerar uma query como duplicada
  private readonly QUERY_DEDUPLICATION_WINDOW = 100;

  // Cores ANSI para melhorar a legibilidade dos logs
  private readonly colors = {
    magenta: '\u001b[35m',
    cyan: '\u001b[36m',
    yellow: '\u001b[33m',
    green: '\u001b[32m',
    red: '\u001b[31m',
    reset: '\u001b[0m',
    bold: '\u001b[1m',
  };

  constructor(private readonly envService: EnvService) {}

  /**
   * Getter para acessar a instância do Drizzle DB
   */
  get db(): Database {
    if (!this._db) {
      throw new Error(
        'DrizzleService não foi inicializado. Certifique-se de que onModuleInit foi chamado.',
      );
    }
    return this._db;
  }

  /**
   * Getter que retorna o schema completo para uso em repositórios
   *
   * baseado na estrutura automatizada do sistema de schemas
   */
  get schema(): DatabaseSchema {
    if (!this._schemaCache) {
      // Constrói o schema mapeando cada schema para sua tabela principal
      this._schemaCache = Object.keys(schemas).reduce((acc, schemaKey) => {
        const schema = schemas[schemaKey as keyof typeof schemas];

        // Encontra a primeira exportação que é uma tabela
        const tableEntry = Object.entries(schema).find(
          ([, value]) => value && typeof value === 'object' && 'tableName' in value,
        );

        if (tableEntry) {
          return {
            ...acc,

            [schemaKey]: tableEntry[1],
          };
        }

        return acc;
      }, {} as DatabaseSchema);
    }

    return this._schemaCache;
  }

  /**
   * Método utilitário para acessar tabelas específicas com type safety completo
   *
   * EXEMPLO DE USO:
   * const walletsTable = this.getTable('wallet');
   * const result = await this.db.select().from(walletsTable);
   *
   * @param tableName Nome da tabela conforme definido no schema
   * @returns Referência tipada para a tabela
   */
  getTable<T extends keyof DatabaseSchema>(tableName: T): DatabaseSchema[T] {
    const table = this.schema[tableName];

    if (!table) {
      throw new Error(
        `Tabela '${String(tableName)}' não encontrada no schema. ` +
          `Tabelas disponíveis: ${Object.keys(this.schema).join(', ')}`,
      );
    }

    return table;
  }

  async onModuleInit() {
    const databaseUrl = this.envService.get('DATABASE_URL');

    if (!databaseUrl) {
      throw new Error('DATABASE_URL não foi fornecida nas variáveis de ambiente');
    }

    this.logger = prefixedLogger(this.envService.get('NODE_ENV'), DrizzleService.name);

    // Configuração do pool de conexões PostgreSQL
    this.pool = new Pool({
      connectionString: databaseUrl,
      max: 20, // Máximo de 20 conexões no pool
      idleTimeoutMillis: 30000, // 30 segundos de timeout para conexões idle
      connectionTimeoutMillis: 2000, // 2 segundos para timeout de conexão
    });

    // Inicializa o Drizzle com logging customizado apenas em ambientes não-produtivos
    const shouldLog = !(this.envService.get('NODE_ENV') === 'prod');

    this._db = drizzle(this.pool, {
      schema: drizzleSchemaConfig, // Defina seu schema aqui
      logger: shouldLog
        ? {
            logQuery: (query: string, params: any[]) => {
              const startTime = Date.now();

              // Simula o evento de query similar ao Prisma
              const event: DrizzleQueryEvent = {
                query,
                params,
                duration: Date.now() - startTime, // Durução aproximada
              };

              this.handleQueryEvent(event);
            },
          }
        : undefined,
    });

    // Testa a conexão
    try {
      const client = await this.pool.connect();
      await client.query('SELECT 1');
      client.release();

      this.logger.log(
        `${this.colors.green}✓ Conexão com DB estabelecida com sucesso${this.colors.reset}`,
      );
    } catch (error) {
      this.logger.error(
        `${this.colors.red}✗ Erro ao conectar com o DB:${this.colors.reset}`,
        error,
      );
      throw error;
    }
  }

  /**
   * Manipula eventos de query do Drizzle, aplicando formatação e deduplicação
   * @param event Evento de query do Drizzle
   */
  private handleQueryEvent(event: DrizzleQueryEvent): void {
    // Verifica se a query é duplicada dentro da janela de tempo
    if (this.isDuplicatedQuery(event.query)) {
      return;
    }

    // Formata a query SQL para melhor legibilidade
    let formattedQuery: string;
    try {
      formattedQuery = format(event.query, {
        language: 'postgresql',
        tabWidth: 2,
        keywordCase: 'upper',
      });
    } catch {
      // Em caso de erro na formatação, usa a query original
      formattedQuery = event.query;
    }

    // Formata os parâmetros como JSON para melhor legibilidade
    let formattedParams = '[]';
    try {
      formattedParams = event.params ? JSON.stringify(event.params, null, 2) : '[]';
    } catch {
      // Em caso de erro na formatação dos parâmetros, usa o formato original
      formattedParams = JSON.stringify(event.params || []);
    }

    // Cria um log mais estruturado e visualmente claro
    this.logger.log(
      `\n${this.colors.bold}${this.colors.magenta}DRIZZLE QUERY${this.colors.reset}\n` +
        `${this.colors.cyan}┌─ Duration:${this.colors.reset} ${event.duration || 0}ms\n` +
        `${this.colors.cyan}├─ Timestamp:${this.colors.reset} ${new Date().toISOString()}\n` +
        `${this.colors.cyan}├─ Query:${this.colors.reset}\n${formattedQuery}\n` +
        `${this.colors.cyan}└─ Params:${this.colors.reset}\n${formattedParams}\n`,
    );

    // Adiciona ao histórico para deduplicação
    this.addToQueryHistory(event.query);
  }

  /**
   * Verifica se uma query foi executada recentemente para evitar logs duplicados
   * @param query A consulta SQL a ser verificada
   * @returns true se a query for considerada duplicada
   */
  private isDuplicatedQuery(query: string): boolean {
    const now = Date.now();

    // Limpa entradas antigas do histórico
    this.queryHistory = this.queryHistory.filter(
      (item) => now - item.timestamp < this.QUERY_DEDUPLICATION_WINDOW,
    );

    // Verifica se a query existe no histórico recente
    return this.queryHistory.some((item) => item.query === query);
  }

  /**
   * Adiciona uma query ao histórico para controle de deduplicação
   * @param query A consulta SQL a ser adicionada ao histórico
   */
  private addToQueryHistory(query: string): void {
    this.queryHistory.push({
      query,
      timestamp: Date.now(),
    });
  }

  /**
   * Método utilitário para executar transações
   * @param callback Função que será executada dentro da transação
   * @returns Resultado da transação
   */
  async transaction<T>(callback: (tx: NodePgDatabase<any>) => Promise<T>): Promise<T> {
    return await this.db.transaction(callback);
  }

  /**
   * Método utilitário para executar queries raw SQL
   * @param query Query SQL raw
   * @param params Parâmetros da query
   * @returns Resultado da query
   */
  async execute(query: string, params: any[] = []): Promise<any> {
    const client = await this.pool?.connect();
    try {
      const result = await client?.query(query, params);
      return result;
    } finally {
      client?.release();
    }
  }

  /**
   * Verifica se a conexão com o banco está ativa
   * @returns Promise<boolean> indicando se a conexão está ativa
   */
  async isHealthy(): Promise<boolean> {
    try {
      const client = await this.pool?.connect();
      await client?.query('SELECT 1');
      client?.release();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Retorna estatísticas do pool de conexões
   */
  getPoolStats() {
    return {
      totalCount: this.pool?.totalCount,
      idleCount: this.pool?.idleCount,
      waitingCount: this.pool?.waitingCount,
    };
  }

  async onModuleDestroy() {
    if (this.pool) {
      await this.pool.end();
      this.logger.log(
        `${this.colors.yellow}DrizzleService desconectado com sucesso${this.colors.reset}`,
      );
    }
  }
}
