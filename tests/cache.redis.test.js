'use strict';

const {
  RedisEscrowSummaryCache,
  createRedisEscrowSummaryCache,
  parseRedisEscrowCacheConfig,
} = require('../src/cache/redis');

class FakeRedisClient {
  constructor() {
    this.map = new Map();
    this.lastSetArgs = null;
  }

  async get(key) {
    return this.map.get(key) || null;
  }

  async set(key, value, mode, ttl) {
    this.lastSetArgs = { key, value, mode, ttl };
    this.map.set(key, value);
    return 'OK';
  }

  async del(key) {
    this.map.delete(key);
    return 1;
  }
}

describe('redis escrow cache config', () => {
  it('disables cache when REDIS_URL is not set', () => {
    const config = parseRedisEscrowCacheConfig({
      REDIS_ESCROW_CACHE_ENABLED: 'true',
    });

    expect(config.enabled).toBe(false);
  });

  it('clamps TTL and ledger gap threshold to strict limits', () => {
    const config = parseRedisEscrowCacheConfig({
      REDIS_ESCROW_CACHE_ENABLED: 'true',
      REDIS_URL: 'redis://localhost:6379',
      REDIS_ESCROW_CACHE_TTL_SECONDS: '9999',
      REDIS_ESCROW_LEDGER_GAP_THRESHOLD: '0',
    });

    expect(config.enabled).toBe(true);
    expect(config.ttlSeconds).toBe(300);
    expect(config.ledgerGapThreshold).toBe(1);
  });
});

describe('RedisEscrowSummaryCache', () => {
  it('stores cache entries with EX TTL', async () => {
    const client = new FakeRedisClient();
    const cache = new RedisEscrowSummaryCache({
      client,
      ttlSeconds: 45,
      ledgerGapThreshold: 3,
    });

    await cache.setSummary('inv_123', { invoiceId: 'inv_123', status: 'not_found' }, 120);

    expect(client.lastSetArgs.mode).toBe('EX');
    expect(client.lastSetArgs.ttl).toBe(45);
  });

  it('returns miss and invalidates entry when ledger gap exceeds threshold', async () => {
    const client = new FakeRedisClient();
    const cache = new RedisEscrowSummaryCache({
      client,
      ttlSeconds: 30,
      ledgerGapThreshold: 2,
    });

    await cache.setSummary('inv_ledger', { invoiceId: 'inv_ledger', status: 'funded' }, 100);
    const result = await cache.getSummary('inv_ledger', 104);

    expect(result.hit).toBe(false);
    expect(result.reason).toBe('ledger_gap');
    expect(await client.get('escrow:summary:inv_ledger')).toBeNull();
  });

  it('returns hit when ledger gap is within threshold', async () => {
    const client = new FakeRedisClient();
    const cache = new RedisEscrowSummaryCache({
      client,
      ttlSeconds: 30,
      ledgerGapThreshold: 5,
    });

    await cache.setSummary('inv_ok', { invoiceId: 'inv_ok', status: 'not_found' }, 250);
    const result = await cache.getSummary('inv_ok', 254);

    expect(result.hit).toBe(true);
    expect(result.value).toEqual({ invoiceId: 'inv_ok', status: 'not_found' });
  });

  it('does not create cache instance when optional redis cache is disabled', () => {
    const cache = createRedisEscrowSummaryCache({
      env: {
        REDIS_ESCROW_CACHE_ENABLED: 'false',
        REDIS_URL: 'redis://localhost:6379',
      },
    });

    expect(cache).toBeNull();
  });
});
