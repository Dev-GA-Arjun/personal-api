const FAILURE_THRESHOLD = 2;
const COOLDOWN_MS = 10 * 60 * 1_000;

export function createAvailability({
  healthCheck,
  now = Date.now,
  cooldownMs = COOLDOWN_MS,
  failureThreshold = FAILURE_THRESHOLD
} = {}) {
  let failures = 0;
  let openUntil = 0;
  let healthCheckInFlight = null;

  function recordSuccess() {
    failures = 0;
    openUntil = 0;
  }

  function recordFailure() {
    failures += 1;
    if (failures >= failureThreshold) {
      openUntil = now() + cooldownMs;
    }
    return failures;
  }

  async function isAvailable() {
    if (openUntil > now()) {
      return false;
    }
    if (healthCheckInFlight) {
      return healthCheckInFlight;
    }

    healthCheckInFlight = (async () => {
      try {
        const healthy = await healthCheck();
        if (!healthy) {
          recordFailure();
          return false;
        }
        recordSuccess();
        return true;
      } catch {
        recordFailure();
        return false;
      } finally {
        healthCheckInFlight = null;
      }
    })();

    return healthCheckInFlight;
  }

  function snapshot() {
    return {
      failures,
      openUntil,
      isOpen: openUntil > now()
    };
  }

  return {
    isAvailable,
    recordSuccess,
    recordFailure,
    snapshot
  };
}

export const availabilityPolicy = Object.freeze({
  failureThreshold: FAILURE_THRESHOLD,
  cooldownMs: COOLDOWN_MS
});
