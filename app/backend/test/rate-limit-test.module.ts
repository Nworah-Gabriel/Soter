import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { MockApiKeyGuard } from './mocks/api-key.mock';
// import { ApiKeyGuard } from '../src/common/guards/api-key.guard';

@Module({
  imports: [AppModule],
  providers: [
    {
      provide: APP_GUARD,
      useClass: MockApiKeyGuard,
    },
  ],
})
export class RateLimitTestModule {}
