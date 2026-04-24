// test/verification.rate-limit.e2e-spec.ts (simplified working version)
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../src/redis/redis.module';
import { RateLimitTestModule } from './rate-limit-test.module';

describe('Verification Rate Limiting E2E', () => {
  let app: INestApplication;
  let redis: Redis;

  beforeAll(async () => {
    // Use the test module that bypasses API key validation
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [RateLimitTestModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    await app.init();

    redis = moduleFixture.get(REDIS_CLIENT);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    // Clear all rate limit keys before each test
    const keys = await redis.keys('rate_limit:*');
    if (keys.length) {
      await redis.del(...keys);
    }
  });

  describe('Start Verification Rate Limiting', () => {
    it('should allow up to 10 start requests per hour', async () => {
      const endpoint = '/verification/start';

      // First 10 requests should succeed
      for (let i = 0; i < 10; i++) {
        const response = await request(app.getHttpServer())
          .post(endpoint)
          .send({ channel: 'email', identifier: `test${i}@example.com` });

        expect(response.status).not.toBe(429);
        expect(response.status).toBe(200);
      }

      // 11th request should be rate limited
      const response = await request(app.getHttpServer())
        .post(endpoint)
        .send({ channel: 'email', identifier: 'test11@example.com' });

      expect(response.status).toBe(429);
      expect(response.body.message).toContain('Rate limit exceeded');
      expect(response.body.retryAfter).toBeDefined();
    });

    it('should include rate limit headers', async () => {
      const response = await request(app.getHttpServer())
        .post('/verification/start')
        .send({ channel: 'email', identifier: 'headers@example.com' });

      // Headers might be set by the rate limit guard
      expect(response.headers['x-ratelimit-limit']).toBeDefined();
      expect(response.headers['x-ratelimit-remaining']).toBeDefined();
      expect(response.headers['x-ratelimit-reset']).toBeDefined();
    });
  });

  describe('Resend Verification Rate Limiting', () => {
    let sessionId: string;

    beforeEach(async () => {
      // Create a session first
      const startResponse = await request(app.getHttpServer())
        .post('/verification/start')
        .send({
          channel: 'email',
          identifier: `resend-${Date.now()}@example.com`,
        });

      sessionId = startResponse.body.sessionId;
    });

    it('should allow up to 3 resend requests per hour', async () => {
      // First 3 resends should succeed
      for (let i = 0; i < 3; i++) {
        const response = await request(app.getHttpServer())
          .post('/verification/resend')
          .send({ sessionId });

        expect(response.status).not.toBe(429);
        expect(response.status).toBe(200);
      }

      // 4th resend should be rate limited
      const response = await request(app.getHttpServer())
        .post('/verification/resend')
        .send({ sessionId });

      expect(response.status).toBe(429);
    });
  });

  describe('Complete Verification Rate Limiting', () => {
    let sessionId: string;

    beforeEach(async () => {
      const startResponse = await request(app.getHttpServer())
        .post('/verification/start')
        .send({
          channel: 'email',
          identifier: `complete-${Date.now()}@example.com`,
        });

      sessionId = startResponse.body.sessionId;
    });

    it('should allow up to 5 complete attempts per 15 minutes', async () => {
      // First 5 attempts may return 400 (invalid code) but not rate limit
      for (let i = 0; i < 5; i++) {
        const response = await request(app.getHttpServer())
          .post('/verification/complete')
          .send({ sessionId, code: '000000' });

        // Should not be rate limited (429)
        expect(response.status).not.toBe(429);
      }

      // 6th attempt should be rate limited
      const response = await request(app.getHttpServer())
        .post('/verification/complete')
        .send({ sessionId, code: '000000' });

      expect(response.status).toBe(429);
    });
  });
});
