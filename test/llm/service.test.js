import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { createEventLogger } from '../../server/llm/events.js';
import { createLlmService } from '../../server/llm/service.js';

const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
const sampleRoutinePath = join(projectRoot, 'sample-vault', 'Routine', 'routine.yaml');
const temporaryRoots = [];

function makeRuntime(client) {
  const root = mkdtempSync(join(tmpdir(), 'routine-llm-service-'));
  temporaryRoots.push(root);
  const vaultPath = join(root, 'vault');
  mkdirSync(join(vaultPath, 'Routine'), { recursive: true });
  mkdirSync(join(vaultPath, 'Daily'), { recursive: true });
  copyFileSync(sampleRoutinePath, join(vaultPath, 'Routine', 'routine.yaml'));

  const timer = { unref: vi.fn() };
  const timers = {
    setInterval: vi.fn(() => timer),
    clearInterval: vi.fn()
  };
  const service = createLlmService({
    vaultPath,
    omnirouteUrl: 'http://omniroute.test/v1',
    omnirouteKey: ''
  }, {
    client,
    availability: { isAvailable: vi.fn(async () => false) },
    queueDirectory: join(root, 'queue'),
    cacheDirectory: join(root, 'queue', 'cache'),
    events: createEventLogger({ filePath: join(root, 'events.jsonl') }),
    now: () => new Date(2026, 9, 12),
    timers
  });
  return { root, service, timer, timers };
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('LLM service startup', () => {
  it('queues week-ahead nudges but does not start model polling without a private combo', () => {
    const client = { configured: false, healthCheck: vi.fn() };
    const { service, timers } = makeRuntime(client);

    service.start();

    expect(service.queue.getPendingJobs().filter((job) => job.type === 'nudge')).toHaveLength(35);
    expect(timers.setInterval).not.toHaveBeenCalled();
    expect(client.healthCheck).not.toHaveBeenCalled();
    service.stop();
  });

  it('starts and stops the periodic queue when the private combo is configured', () => {
    const client = { configured: true, healthCheck: vi.fn(async () => false) };
    const { service, timer, timers } = makeRuntime(client);

    service.start();
    expect(timers.setInterval).toHaveBeenCalledOnce();
    expect(timer.unref).toHaveBeenCalledOnce();

    service.stop();
    expect(timers.clearInterval).toHaveBeenCalledWith(timer);
  });
});
