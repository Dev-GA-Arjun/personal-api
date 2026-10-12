import { createAvailability } from './availability.js';
import { createLlmClient } from './client.js';
import { createEventLogger } from './events.js';
import { createLlmFeatures } from './features.js';
import { createFileQueue } from './queue.js';
import { loadRoutine } from '../engine/routine.js';

export function createLlmService(runtimeConfig, overrides = {}) {
  const routine = loadRoutine(runtimeConfig.vaultPath);
  const client = overrides.client || createLlmClient({
    baseUrl: runtimeConfig.omnirouteUrl,
    model: runtimeConfig.omniroutePrivateCombo,
    apiKey: runtimeConfig.omnirouteKey
  });
  const events = overrides.events || createEventLogger({
    filePath: overrides.eventsPath
  });
  const availability = overrides.availability || createAvailability({
    healthCheck: client.healthCheck
  });
  const queueDirectory = overrides.queueDirectory;
  let features;

  const queue = overrides.queue || createFileQueue({
    directory: queueDirectory,
    availability,
    processJob: (job) => features.processJob(job),
    now: overrides.now,
    timers: overrides.timers,
    onQueued: (job) => events.queued(job),
    onProcessed: (job) => events.processed(job)
  });

  features = createLlmFeatures({
    vaultPath: runtimeConfig.vaultPath,
    routine,
    queue,
    client,
    events,
    now: overrides.now,
    cacheDirectory: overrides.cacheDirectory
  });

  return {
    features,
    queue,
    start() {
      features.prepareNudgeWeek();
      if (client.configured !== false) {
        queue.start();
      }
    },
    stop() {
      queue.stop();
    }
  };
}
