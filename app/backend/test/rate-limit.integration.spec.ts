import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';

describe('Rate Limiting Integration', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Rate Limit Service', () => {
    it('should be defined', async () => {
      const rateLimitService = await app.resolve('RateLimitService');
      expect(rateLimitService).toBeDefined();
    });
  });
});
