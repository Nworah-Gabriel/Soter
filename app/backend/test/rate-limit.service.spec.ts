import { Test, TestingModule } from '@nestjs/testing';
import { RateLimitService } from '../src/common/rate-limit/rate-limit.service';
import { REDIS_CLIENT } from '../src/redis/redis.module';

// Mock Redis
const mockRedis = {
  zadd: jest.fn().mockResolvedValue(1),
  zremrangebyscore: jest.fn().mockResolvedValue(1),
  zcard: jest.fn().mockResolvedValue(0),
  zrange: jest.fn().mockResolvedValue([]),
  expire: jest.fn().mockResolvedValue(1),
  del: jest.fn().mockResolvedValue(1),
  keys: jest.fn().mockResolvedValue([]),
};

describe('RateLimitService', () => {
  let service: RateLimitService;
  let redis: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RateLimitService,
        {
          provide: REDIS_CLIENT,
          useValue: mockRedis,
        },
      ],
    }).compile();

    service = module.get<RateLimitService>(RateLimitService);
    redis = module.get(REDIS_CLIENT);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('checkRateLimit', () => {
    it('should allow requests within limit', async () => {
      redis.zcard.mockResolvedValue(5); // 5 requests so far

      const result = await service.checkRateLimit(
        'test-user',
        'test-endpoint',
        { maxRequests: 10, windowMs: 60000 },
      );

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(5);
    });

    it('should block requests exceeding limit', async () => {
      redis.zcard.mockResolvedValue(10); // 10 requests already

      const result = await service.checkRateLimit(
        'test-user',
        'test-endpoint',
        { maxRequests: 10, windowMs: 60000 },
      );

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it('should calculate correct remaining', async () => {
      redis.zcard.mockResolvedValue(3);

      const result = await service.checkRateLimit(
        'test-user',
        'test-endpoint',
        { maxRequests: 10, windowMs: 60000 },
      );

      expect(result.remaining).toBe(7);
    });
  });

  describe('recordRequest', () => {
    it('should record a request', async () => {
      await service.recordRequest('test-user', 'test-endpoint');

      expect(redis.zadd).toHaveBeenCalled();
      expect(redis.expire).toHaveBeenCalled();
    });
  });

  describe('getRemaining', () => {
    it('should return remaining requests', async () => {
      redis.zcard.mockResolvedValue(3);

      const remaining = await service.getRemaining(
        'test-user',
        'test-endpoint',
      );

      expect(remaining).toBe(7);
    });
  });
});
