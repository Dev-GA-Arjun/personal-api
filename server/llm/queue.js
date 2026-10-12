import { createHash } from 'crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync
} from 'fs';
import { join } from 'path';

const MAX_ATTEMPTS = 3;
const PROCESS_INTERVAL_MS = 30_000;

function canonicalJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => (
      `${JSON.stringify(key)}:${canonicalJson(value[key])}`
    )).join(',')}}`;
  }
  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    throw new TypeError('Queue payload must contain only JSON values');
  }
  return serialized;
}

function jobId(type, payload, idempotencyKey) {
  const identity = idempotencyKey === undefined
    ? canonicalJson(payload)
    : String(idempotencyKey);
  return createHash('sha256').update(`${type}\0${identity}`).digest('hex');
}

function assertJob(job, filePath) {
  const validStatuses = new Set(['pending', 'done', 'failed']);
  if (
    !job ||
    typeof job.id !== 'string' ||
    typeof job.type !== 'string' ||
    !job.payload ||
    typeof job.payload !== 'object' ||
    typeof job.status !== 'string' ||
    !validStatuses.has(job.status) ||
    !Number.isInteger(job.attempts) ||
    job.attempts < 0 ||
    typeof job.createdAt !== 'string'
  ) {
    throw new Error(`Invalid queue job file: ${filePath}`);
  }
  return job;
}

export function createFileQueue({
  directory = join(process.cwd(), 'queue'),
  availability,
  processJob,
  intervalMs = PROCESS_INTERVAL_MS,
  now = () => new Date(),
  timers = { setInterval, clearInterval },
  onProcessorError = (error) => console.error('LLM queue processor failed:', error)
} = {}) {
  if (!availability || typeof availability.isAvailable !== 'function') {
    throw new TypeError('Queue requires an availability checker');
  }
  if (typeof processJob !== 'function') {
    throw new TypeError('Queue requires a job processor');
  }

  let interval = null;
  let processing = null;

  function readJob(filePath) {
    let job;
    try {
      job = JSON.parse(readFileSync(filePath, 'utf8'));
    } catch (cause) {
      throw new Error(`Could not read queue job at ${filePath}`, { cause });
    }
    return assertJob(job, filePath);
  }

  function writeJob(job) {
    mkdirSync(directory, { recursive: true });
    const targetPath = join(directory, `${job.id}.json`);
    const temporaryPath = join(directory, `${job.id}.${process.pid}.tmp`);
    writeFileSync(temporaryPath, `${JSON.stringify(job)}\n`, { flag: 'w' });
    renameSync(temporaryPath, targetPath);
  }

  function allJobs() {
    if (!existsSync(directory)) {
      return [];
    }
    return readdirSync(directory)
      .filter((name) => name.endsWith('.json'))
      .map((name) => readJob(join(directory, name)));
  }

  function enqueue(type, payload, { idempotencyKey } = {}) {
    if (typeof type !== 'string' || !type.trim()) {
      throw new TypeError('Queue job type must be a non-empty string');
    }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new TypeError('Queue job payload must be an object');
    }

    const normalizedType = type.trim();
    const id = jobId(normalizedType, payload, idempotencyKey);
    const existingPath = join(directory, `${id}.json`);
    if (existsSync(existingPath)) {
      return readJob(existingPath);
    }

    const job = {
      id,
      type: normalizedType,
      payload: JSON.parse(canonicalJson(payload)),
      status: 'pending',
      attempts: 0,
      createdAt: now().toISOString()
    };
    writeJob(job);
    return job;
  }

  function getPendingJobs() {
    return allJobs()
      .filter((job) => job.status === 'pending')
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id));
  }

  async function runPending() {
    if (!await availability.isAvailable()) {
      return { available: false, processed: 0 };
    }

    let processed = 0;
    for (const pending of getPendingJobs()) {
      const attempt = { ...pending, attempts: pending.attempts + 1 };
      writeJob(attempt);
      try {
        await processJob(attempt);
        writeJob({ ...attempt, status: 'done' });
        availability.recordSuccess?.();
      } catch {
        availability.recordFailure?.();
        const status = attempt.attempts >= MAX_ATTEMPTS ? 'failed' : 'pending';
        writeJob({ ...attempt, status });
        processed += 1;
        break;
      }
      processed += 1;
    }

    return { available: true, processed };
  }

  function processPending() {
    if (processing) {
      return processing;
    }
    processing = runPending();
    return processing.finally(() => {
      processing = null;
    });
  }

  function start() {
    if (interval) {
      return;
    }
    interval = timers.setInterval(() => {
      processPending().catch(onProcessorError);
    }, intervalMs);
    interval.unref?.();
  }

  function stop() {
    if (interval) {
      timers.clearInterval(interval);
      interval = null;
    }
  }

  return {
    enqueue,
    getPendingJobs,
    processPending,
    start,
    stop
  };
}

export const queuePolicy = Object.freeze({
  maxAttempts: MAX_ATTEMPTS,
  processIntervalMs: PROCESS_INTERVAL_MS
});
