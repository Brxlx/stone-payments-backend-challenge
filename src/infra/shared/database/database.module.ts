import { DynamicModule, Module } from '@nestjs/common';
import { EnvModule } from '../env/env.module';
import { DrizzleService } from './drizzle/drizzle.service';
import { EnvService } from '../env/env.service';
import { TransactionsRepository } from '@/domain/application/transaction/repositories/transactions.repository';
import { DrizzleTransactionsRepository } from './drizzle/repositories/drizzle-transactions.repository';
import {
  DRIZZLE_TRANSACTIONS_REPOSITORY,
  PRISMA_TRANSACTIONS_REPOSITORY,
  TRANSACTIONS_REPOSITORY,
} from './tokens';

@Module({})
export class DatabaseModule {
  static forRoot(options?: { implementation?: 'drizzle' | 'prisma' }): DynamicModule {
    const implementation = options?.implementation ?? 'drizzle';

    const providers: any[] = [
      {
        provide: DrizzleService,
        useFactory: async (envService: EnvService) => {
          const drizzleService = new DrizzleService(envService);
          if (await drizzleService.isHealthy()) {
            return drizzleService;
          }
          throw new Error('Database connection is not healty');
        },
        inject: [EnvService],
      },
    ];

    if (implementation === 'drizzle') {
      providers.push(
        {
          provide: DRIZZLE_TRANSACTIONS_REPOSITORY,
          useClass: DrizzleTransactionsRepository,
        },
        {
          provide: TRANSACTIONS_REPOSITORY,
          useExisting: DRIZZLE_TRANSACTIONS_REPOSITORY,
        },
        {
          provide: TransactionsRepository,
          useExisting: TRANSACTIONS_REPOSITORY,
        },
      );
    } else if (implementation === 'prisma') {
      // Prisma implementation should register PRISMA_TRANSACTIONS_REPOSITORY
      providers.push({
        provide: TRANSACTIONS_REPOSITORY,
        useExisting: PRISMA_TRANSACTIONS_REPOSITORY,
      });
    } else {
      throw new Error('Unknown database implementation');
    }

    return {
      module: DatabaseModule,
      imports: [EnvModule],
      providers,
      exports: [DrizzleService, TransactionsRepository, TRANSACTIONS_REPOSITORY],
    };
  }
}
