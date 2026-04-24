// test/rate-limit.guard.spec.ts
import { RateLimitGuard } from '../src/common/guards/rate-limit.guard';

// Create a properly typed mock class
class MockRateLimitService {
  checkRateLimit = jest.fn();
  recordRequest = jest.fn();
}

describe('RateLimitGuard', () => {
  let guard: RateLimitGuard;
  let rateLimitService: MockRateLimitService;
  let reflector: any;

  beforeEach(() => {
    rateLimitService = new MockRateLimitService();
    reflector = {
      get: jest.fn(),
    };

    guard = new RateLimitGuard(rateLimitService as any, reflector);
  });

  it('should allow request if within limit', async () => {
    reflector.get.mockReturnValue({
      endpoint: 'test',
      maxRequests: 10,
      windowMs: 60000,
    });

    rateLimitService.checkRateLimit.mockResolvedValue({
      allowed: true,
      remaining: 9,
      resetTime: new Date(),
    });

    const context = {
      getHandler: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({ headers: {}, ip: '127.0.0.1' }),
        getResponse: () => ({ setHeader: jest.fn() }),
      }),
    } as any;

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(rateLimitService.recordRequest).toHaveBeenCalled();
  });

  it('should block request if over limit', async () => {
    reflector.get.mockReturnValue({
      endpoint: 'test',
      maxRequests: 10,
      windowMs: 60000,
    });

    rateLimitService.checkRateLimit.mockResolvedValue({
      allowed: false,
      remaining: 0,
      resetTime: new Date(),
    });

    const context = {
      getHandler: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({ headers: {}, ip: '127.0.0.1' }),
        getResponse: () => ({ setHeader: jest.fn() }),
      }),
    } as any;

    await expect(guard.canActivate(context)).rejects.toThrow(
      'Rate limit exceeded',
    );
  });
});
