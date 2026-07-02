import { Module } from '@nestjs/common';
import { EnvModule } from '../shared/env/env.module';
import { TransactionModule } from '../modules/Transaction/transaction.module';

@Module({
  imports: [EnvModule, TransactionModule],
})
export class HttpModule {}
