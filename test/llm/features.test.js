import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync
} from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { appendLog } from '../../server/engine/storage.js';
import { loadRoutine } from '../../server/engine/routine.js';
import { createEventLogger } from '../../server/llm/events.js';
import { createLlmFeatures } from '../../server/llm/features.js';
import { createFileQueue } from '../../server/llm/queue.js';

const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
const sampleRoutinePath = join(projectRoot, 'sample-vault', 'Routine', 'routine.yaml');
const temporaryRoots = [];

function createContext({ available = false, generateJson } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'routine-llm-features-'));
  temporaryRoots.push(root);
  const vaultPath = join(root, 'vault');
  mkdirSync(join(vaultPath, 'Routine'), { recursive: true });
  mkdirSync(join(vaultPath, 'Daily'), { recursive: true });
  copyFileSync(sampleRoutinePath, join(vaultPath, 'Routine', 'routine.yaml'));

  const routine = loadRoutine(vaultPath);
  const eventPath = join(root, 'events.jsonl');
  const events = createEventLogger({ filePath: eventPath });
  const availability = {
    isAvailable: vi.fn(async () => available),
    recordSuccess: vi.fn(),
    recordFailure: vi.fn()
  };
  const client = {
    generateJson: generateJson || vi.fn(async ({ feature }) => ({
      value: feature === 'nudge'
        ? { text: 'A generated nudge.' }
        : feature === 'reflection'
          ? { reflection: 'A generated reflection.' }
          : { commentary: 'A generated weekly note.', suggestions: ['Try a lighter minimum.'] },
      durationMs: 2
    }))
  };
  let features;
  const queue = createFileQueue({
    directory: join(root, 'queue'),
    availability,
    processJob: (job) => features.processJob(job),
    onQueued: (job) => events.queued(job),
    onProcessed: (job) => events.processed(job)
  });
  features = createLlmFeatures({
    vaultPath,
    routine,
    queue,
    client,
    events,
    now: () => new Date(2026, 9, 12, 21, 5),
    cacheDirectory: join(root, 'queue', 'cache')
  });

  return { root, vaultPath, routine, eventPath, events, availability, client, queue, features };
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('LLM feature fallbacks and deferred work', () => {
  it('serves every feature fallback without the model', async () => {
    const context = createContext();
    const privateNote = 'SENSITIVE NOTE FOR EVENT REDACTION';
    const nudge = context.features.getNudge('09:00');
    const note = context.features.addNote(privateNote);
    const review = context.features.getWeeklyReview();
    const suggestions = context.features.getSuggestions();
    await context.queue.processPending();

    const dailyNote = readFileSync(join(context.vaultPath, 'Daily', '2026-10-12.md'), 'utf8');
    const events = readFileSync(context.eventPath, 'utf8');
    expect(nudge).toMatchObject({ cached: false, window: '09:00' });
    expect(nudge.text).toContain('Example minimum: step outside');
    expect(note).toMatchObject({ ok: true, date: '2026-10-12', queued: true });
    expect(dailyNote).toContain(privateNote);
    expect(review.consistency).toEqual({ completedDays: 0, totalDays: 7, percent: 0 });
    expect(review.missesByWindow).toEqual(context.routine.check_ins.map((window) => ({ window, misses: 7 })));
    expect(review.commentary).toBeNull();
    expect(suggestions).toEqual([]);
    expect(context.client.generateJson).not.toHaveBeenCalled();
    expect(events).not.toContain(privateNote);
    expect(events).not.toContain('Write one concise');
    expect(existsSync(join(context.vaultPath, 'Routine', 'Reviews', '2026-10-06.md'))).toBe(true);
  });

  it('pre-queues a week of nudges with task names and status counts but no note content', () => {
    const context = createContext();
    context.features.addNote('never send this as nudge input');

    expect(context.features.prepareNudgeWeek()).toBe(35);
    const nudgeJobs = context.queue.getPendingJobs().filter((job) => job.type === 'nudge');
    expect(nudgeJobs).toHaveLength(35);
    expect(nudgeJobs[0].payload).toMatchObject({
      date: '2026-10-12',
      window: expect.any(String),
      fullTask: expect.any(String),
      minimumTask: expect.any(String),
      counts: { done: 0, minimum: 0, skip: 0, no_data: 7 }
    });
    expect(JSON.stringify(nudgeJobs)).not.toContain('never send this as nudge input');
  });

  it('uses only the task names and status counts in the nudge model prompt and caches the result', async () => {
    const context = createContext({ available: true });
    context.features.prepareNudgeWeek();

    await context.queue.processPending();
    const modelInput = context.client.generateJson.mock.calls[0][0];

    expect(modelInput.feature).toBe('nudge');
    expect(modelInput.userPrompt).toContain('Full task:');
    expect(modelInput.userPrompt).toContain('Status counts:');
    expect(modelInput.userPrompt).not.toContain('2026-10-12');
    expect(modelInput.userPrompt).not.toContain('09:00');
    expect(context.features.getNudge('09:00')).toMatchObject({
      cached: true,
      text: 'A generated nudge.'
    });
  });

  it('adds note reflections later and keeps review commentary and suggestions pending', async () => {
    const context = createContext({ available: true });
    const privateNote = 'PRIVATE REFLECTION TEST NOTE';
    const routineYamlBefore = readFileSync(join(context.vaultPath, 'Routine', 'routine.yaml'), 'utf8');

    appendLog(context.vaultPath, new Date(2026, 9, 12), '09:00', 'done');
    appendLog(context.vaultPath, new Date(2026, 9, 11), '12:00', 'skip');
    const queuedNote = context.features.addNote(privateNote);
    const immediateReview = context.features.getWeeklyReview();
    expect(queuedNote.queued).toBe(true);
    expect(immediateReview.commentary).toBeNull();

    await context.queue.processPending();

    const dailyNote = readFileSync(join(context.vaultPath, 'Daily', '2026-10-12.md'), 'utf8');
    const reviewPath = join(context.vaultPath, 'Routine', 'Reviews', '2026-10-06.md');
    const savedReview = readFileSync(reviewPath, 'utf8');
    const events = readFileSync(context.eventPath, 'utf8');
    expect(dailyNote).toContain(privateNote);
    expect(dailyNote).toContain('## Reflections');
    expect(dailyNote).toContain('A generated reflection.');
    expect(savedReview).toContain('A generated weekly note.');
    expect(context.features.getWeeklyReview().commentary).toBe('A generated weekly note.');
    expect(context.features.getSuggestions()).toEqual([
      expect.objectContaining({ text: 'Try a lighter minimum.', status: 'pending' })
    ]);
    expect(readFileSync(join(context.vaultPath, 'Routine', 'routine.yaml'), 'utf8')).toBe(routineYamlBefore);
    expect(events).not.toContain(privateNote);
    expect(events).not.toContain('A generated reflection.');
    expect(events).toContain('"event":"model_call"');
    expect(events).toContain('"event":"queued"');
    expect(events).toContain('"event":"processed"');
    expect(context.queue.getPendingJobs()).toEqual([]);
    expect(context.queue.getPendingJobs().some((job) => job.id === queuedNote.jobId)).toBe(false);
  });
});
