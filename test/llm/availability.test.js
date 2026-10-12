import { describe, expect, it, vi } from 'vitest';
import { createAvailability, availabilityPolicy } from '../../server/llm/availability.js';

describe('LLM availability circuit breaker', () => {
  it('opens after two failures and retries after the ten-minute cooldown', async () => {
    let now = 1_000;
    const healthCheck = vi.fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    const availability = createAvailability({ healthCheck, now: () => now });

    expect(await availability.isAvailable()).toBe(false);
    expect(await availability.isAvailable()).toBe(false);
    expect(availability.snapshot()).toEqual({
      failures: 2,
      openUntil: now + 10 * 60 * 1_000,
      isOpen: true
    });
    expect(await availability.isAvailable()).toBe(false);
    expect(healthCheck).toHaveBeenCalledTimes(2);

    now += 10 * 60 * 1_000;
    expect(await availability.isAvailable()).toBe(true);
    expect(availability.snapshot()).toEqual({ failures: 0, openUntil: 0, isOpen: false });
    expect(healthCheck).toHaveBeenCalledTimes(3);
  });

  it('counts generation failures and resets the consecutive count after success', () => {
    const availability = createAvailability({ healthCheck: async () => true });
    availability.recordFailure();
    availability.recordSuccess();
    availability.recordFailure();

    expect(availability.snapshot().failures).toBe(1);
    expect(availability.snapshot().isOpen).toBe(false);
    expect(availabilityPolicy).toEqual({
      failureThreshold: 2,
      cooldownMs: 10 * 60 * 1_000
    });
  });

  it('shares concurrent health checks rather than sending duplicates', async () => {
    let resolveHealth;
    const healthCheck = vi.fn(() => new Promise((resolve) => {
      resolveHealth = resolve;
    }));
    const availability = createAvailability({ healthCheck });

    const first = availability.isAvailable();
    const second = availability.isAvailable();
    expect(healthCheck).toHaveBeenCalledTimes(1);
    resolveHealth(true);
    await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
  });
});
