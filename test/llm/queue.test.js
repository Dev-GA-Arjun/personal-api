import { afterEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createFileQueue, queuePolicy } from '../../server/llm/queue.js';

const temporaryDirectories = [];

function makeQueueDirectory() {
  const directory = mkdtempSync(join(tmpdir(), 'routine-queue-'));
  temporaryDirectories.push(directory);
  return directory;
}

function makeAvailability(available = true) {
  return {
    isAvailable: vi.fn(async () => available),
    recordSuccess: vi.fn(),
    recordFailure: vi.fn()
  };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('file-based LLM queue', () => {
  it('persists jobs and deduplicates equivalent payloads independent of property order', () => {
    const directory = makeQueueDirectory();
    const queue = createFileQueue({
      directory,
      availability: makeAvailability(),
      processJob: vi.fn()
    });

    const first = queue.enqueue('reflection', { date: '2026-10-12', note: 'private' });
    const duplicate = queue.enqueue('reflection', { note: 'private', date: '2026-10-12' });
    const stored = JSON.parse(readFileSync(join(directory, `${first.id}.json`), 'utf8'));

    expect(duplicate.id).toBe(first.id);
    expect(stored).toEqual({
      id: first.id,
      type: 'reflection',
      payload: { date: '2026-10-12', note: 'private' },
      status: 'pending',
      attempts: 0,
      createdAt: first.createdAt
    });
    expect(readdirSync(directory)).toEqual([`${first.id}.json`]);
  });

  it('recovers pending jobs after recreation and marks completed jobs so they are not reprocessed', async () => {
    const directory = makeQueueDirectory();
    const firstQueue = createFileQueue({
      directory,
      availability: makeAvailability(),
      processJob: vi.fn()
    });
    const job = firstQueue.enqueue('review', { week: '2026-10-12' });
    const processJob = vi.fn(async () => {});
    const restartedQueue = createFileQueue({
      directory,
      availability: makeAvailability(),
      processJob
    });

    await expect(restartedQueue.processPending()).resolves.toEqual({ available: true, processed: 1 });
    await expect(restartedQueue.processPending()).resolves.toEqual({ available: true, processed: 0 });
    expect(processJob).toHaveBeenCalledTimes(1);
    expect(JSON.parse(readFileSync(join(directory, `${job.id}.json`), 'utf8'))).toMatchObject({
      status: 'done',
      attempts: 1
    });
  });

  it('does not process jobs while unavailable', async () => {
    const directory = makeQueueDirectory();
    const processJob = vi.fn();
    const queue = createFileQueue({
      directory,
      availability: makeAvailability(false),
      processJob
    });
    const job = queue.enqueue('nudge', { window: '09:00' });

    await expect(queue.processPending()).resolves.toEqual({ available: false, processed: 0 });
    expect(processJob).not.toHaveBeenCalled();
    expect(queue.getPendingJobs()[0]).toMatchObject({ id: job.id, status: 'pending', attempts: 0 });
  });

  it('retries failures up to three total attempts then leaves the job failed', async () => {
    const directory = makeQueueDirectory();
    const processJob = vi.fn(async () => {
      throw new Error('fake model failure');
    });
    const availability = makeAvailability();
    const queue = createFileQueue({ directory, availability, processJob });
    const job = queue.enqueue('reflection', { date: '2026-10-12', note: 'private' });

    for (let attempt = 1; attempt <= queuePolicy.maxAttempts; attempt += 1) {
      await queue.processPending();
      const stored = JSON.parse(readFileSync(join(directory, `${job.id}.json`), 'utf8'));
      expect(stored.attempts).toBe(attempt);
      expect(stored.status).toBe(attempt === queuePolicy.maxAttempts ? 'failed' : 'pending');
    }

    await queue.processPending();
    expect(processJob).toHaveBeenCalledTimes(queuePolicy.maxAttempts);
    expect(availability.recordFailure).toHaveBeenCalledTimes(queuePolicy.maxAttempts);
    expect(queue.getPendingJobs()).toEqual([]);
  });

  it('processes a given queue only once at a time', async () => {
    const directory = makeQueueDirectory();
    let finishJob;
    const processJob = vi.fn(() => new Promise((resolve) => {
      finishJob = resolve;
    }));
    const queue = createFileQueue({
      directory,
      availability: makeAvailability(),
      processJob
    });
    queue.enqueue('review', { week: '2026-10-12' });

    const first = queue.processPending();
    const second = queue.processPending();
    await vi.waitFor(() => expect(processJob).toHaveBeenCalledTimes(1));
    expect(processJob).toHaveBeenCalledTimes(1);
    finishJob();
    await expect(Promise.all([first, second])).resolves.toEqual([
      { available: true, processed: 1 },
      { available: true, processed: 1 }
    ]);
    expect(existsSync(directory)).toBe(true);
  });

  it('runs jobs from its periodic timer and can be stopped', async () => {
    const directory = makeQueueDirectory();
    const processJob = vi.fn(async () => {});
    const timerHandle = { unref: vi.fn() };
    const timers = {
      setInterval: vi.fn((callback, delay) => {
        expect(delay).toBe(queuePolicy.processIntervalMs);
        timerHandle.callback = callback;
        return timerHandle;
      }),
      clearInterval: vi.fn()
    };
    const queue = createFileQueue({
      directory,
      availability: makeAvailability(),
      processJob,
      timers
    });
    queue.enqueue('nudge', { window: '09:00' });

    queue.start();
    expect(timerHandle.unref).toHaveBeenCalledOnce();
    timerHandle.callback();
    await vi.waitFor(() => expect(processJob).toHaveBeenCalledTimes(1));
    queue.stop();
    expect(timers.clearInterval).toHaveBeenCalledWith(timerHandle);
  });
});
