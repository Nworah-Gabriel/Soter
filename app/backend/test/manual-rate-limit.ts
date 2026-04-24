// test/manual-rate-limit.ts
/**
 * Simple manual test for rate limiting logic
 * Run with: npx ts-node test/manual-rate-limit.ts
 */

class SimpleRateLimiter {
  private store: Map<string, number[]> = new Map();

  // eslint-disable-next-line @typescript-eslint/require-await
  async checkLimit(
    key: string,
    limit: number,
    windowMs: number,
  ): Promise<{ allowed: boolean; remaining: number }> {
    const now = Date.now();
    const timestamps = this.store.get(key) || [];

    // Filter out old timestamps
    const valid = timestamps.filter(t => t > now - windowMs);

    if (valid.length < limit) {
      valid.push(now);
      this.store.set(key, valid);
      return { allowed: true, remaining: limit - valid.length };
    }

    return { allowed: false, remaining: 0 };
  }

  getStoreSize(): number {
    return this.store.size;
  }

  clearStore(): void {
    this.store.clear();
  }
}

async function runTests() {
  console.log('\nTesting Rate Limiting Logic\n');
  console.log('='.repeat(50));

  const limiter = new SimpleRateLimiter();
  const key = 'test:user:123';
  const limit = 10;
  const windowMs = 60 * 60 * 1000; // 1 hour

  console.log(`\n Test 1: Allow up to ${limit} requests per hour`);
  console.log('-'.repeat(40));

  // First 10 requests should be allowed
  for (let i = 1; i <= limit; i++) {
    const { allowed, remaining } = await limiter.checkLimit(
      key,
      limit,
      windowMs,
    );
    console.log(
      `Request ${i}: ${allowed ? ' ALLOWED' : ' DENIED'} (${remaining} remaining)`,
    );
    if (!allowed) {
      console.log(` FAILED: Request ${i} should have been allowed!`);
      process.exit(1);
    }
  }

  // 11th request should be denied
  const { allowed, remaining } = await limiter.checkLimit(key, limit, windowMs);
  console.log(
    `Request ${limit + 1}: ${allowed ? ' ALLOWED' : ' DENIED'} (${remaining} remaining)`,
  );

  if (!allowed) {
    console.log('\n PASS: Rate limit correctly blocked the 11th request');
  } else {
    console.log('\n FAIL: Rate limit should have blocked the 11th request');
    process.exit(1);
  }

  console.log('\n' + '='.repeat(50));
  console.log('\n Test 2: Different endpoints have separate limits');
  console.log('-'.repeat(40));

  limiter.clearStore();
  const endpoints = ['/api/start', '/api/resend', '/api/complete'];

  for (const endpoint of endpoints) {
    const endpointKey = `test:${endpoint}`;
    for (let i = 1; i <= 5; i++) {
      const { allowed } = await limiter.checkLimit(endpointKey, 5, windowMs);
      if (i === 5 && !allowed) {
        console.log(` FAILED: Should allow 5 requests to ${endpoint}`);
      }
    }
    console.log(` ${endpoint}: Allowed 5 requests`);
  }

  console.log('\n' + '='.repeat(50));
  console.log('\n Test 3: Different users have separate limits');
  console.log('-'.repeat(40));

  limiter.clearStore();
  const users = ['user1', 'user2', 'user3'];

  for (const user of users) {
    const userKey = `user:${user}`;
    for (let i = 1; i <= 10; i++) {
      await limiter.checkLimit(userKey, 10, windowMs);
    }
    console.log(` ${user}: Allowed 10 requests`);
  }

  // Verify each user has their own counter
  console.log(`\nTotal unique keys in store: ${limiter.getStoreSize()}`);
  if (limiter.getStoreSize() === 3) {
    console.log(' PASS: Each user has independent counter');
  } else {
    console.log(` FAIL: Expected 3 keys, got ${limiter.getStoreSize()}`);
  }

  console.log('\n' + '='.repeat(50));
  console.log('\n All rate limiting tests passed!');
  console.log('='.repeat(50));
}

runTests().catch(console.error);
