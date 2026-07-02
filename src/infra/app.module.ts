import { Module } from '@nestjs/common';
import { EnvModule } from './shared/env/env.module';
import { HttpModule } from './http/http.module';

@Module({
  imports: [EnvModule, HttpModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
