import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync
} from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { fileURLToPath } from 'url';

vi.mock('../../server/config.js', () => ({
  config: {
    apiToken: 'unused-import-token',
    vaultPath: '',
    allowedHosts: ['127.0.0.1', 'localhost', '::1'],
    omnirouteUrl: 'http://omniroute.test/v1',
    omnirouteKey: '',
    uiDistPath: ''
  }
}));

const { createApp } = await import('../../server/index.js');
const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
const sampleRoutinePath = join(projectRoot, 'sample-vault', 'Routine', 'routine.yaml');
const runningServers = [];
const temporaryRoots = [];

async function createTestServer({ client, availability } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'routine-llm-api-'));
  temporaryRoots.push(root);
  const vaultPath = join(root, 'vault');
  mkdirSync(join(vaultPath, 'Routine'), { recursive: true });
  mkdirSync(join(vaultPath, 'Daily'), { recursive: true });
  copyFileSync(sampleRoutinePath, join(vaultPath, 'Routine', 'routine.yaml'));

  const runtimeConfig = {
    apiToken: 'test-token',
    vaultPath,
    allowedHosts: ['127.0.0.1', 'localhost', '::1'],
    omnirouteUrl: 'http://omniroute.test/v1',
    omnirouteKey: '',
    uiDistPath: join(root, 'empty-ui')
  };
  const app = createApp(runtimeConfig, {
    client: client || {
      generateJson: vi.fn(async () => {
        throw new Error('API route must never call the model');
      })
    },
    availability: availability || { isAvailable: vi.fn(async () => false) },
    queueDirectory: join(root, 'queue'),
    cacheDirectory: join(root, 'queue', 'cache'),
    eventsPath: join(root, 'events.jsonl'),
    now: () => new Date(2026, 9, 12, 21, 5)
  });
  app.locals.getLlmService();
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  runningServers.push(server);

  return {
    app,
    root,
    vaultPath,
    origin: `http://127.0.0.1:${server.address().port}`
  };
}

function authorized(token = 'test-token') {
  return { Authorization: `Bearer ${token}` };
}

afterEach(async () => {
  await Promise.all(runningServers.splice(0).map((server) => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  })));
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('LLM API routes', () => {
  it('protects all four routes with the existing bearer-token middleware', async () => {
    const { origin } = await createTestServer();
    const requests = [
      fetch(`${origin}/api/nudge/09:00`),
      fetch(`${origin}/api/notes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ note: 'private' }) }),
      fetch(`${origin}/api/review/week`),
      fetch(`${origin}/api/suggestions`)
    ];

    const responses = await Promise.all(requests);
    expect(responses.map(({ status }) => status)).toEqual([401, 401, 401, 401]);
  });

  it('returns model-off fallbacks and saves notes immediately without waiting for the client', async () => {
    const client = {
      generateJson: vi.fn(() => new Promise(() => {}))
    };
    const { origin, vaultPath, root } = await createTestServer({ client });
    const token = authorized();
    const measure = async (request) => {
      const startedAt = performance.now();
      const response = await request;
      const elapsedMs = performance.now() - startedAt;
      return { response, elapsedMs };
    };

    const nudgeResult = await measure(fetch(`${origin}/api/nudge/09:00`, { headers: token }));
    const nudge = await nudgeResult.response.json();
    const noteText = 'PRIVATE API NOTE MUST NOT ENTER EVENTS';
    const noteResult = await measure(fetch(`${origin}/api/notes`, {
      method: 'POST',
      headers: { ...token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ note: noteText })
    }));
    const note = await noteResult.response.json();
    const reviewResult = await measure(fetch(`${origin}/api/review/week`, { headers: token }));
    const review = await reviewResult.response.json();
    const suggestionsResult = await measure(fetch(`${origin}/api/suggestions`, { headers: token }));
    const suggestions = await suggestionsResult.response.json();
    const events = readFileSync(join(root, 'events.jsonl'), 'utf8');

    expect(nudgeResult.response.status).toBe(200);
    expect(nudge).toMatchObject({ cached: false, window: '09:00' });
    expect(nudge.text).toContain('Example minimum: step outside');
    expect(noteResult.response.status).toBe(201);
    expect(note).toMatchObject({ ok: true, date: '2026-10-12', queued: true });
    expect(readFileSync(join(vaultPath, 'Daily', '2026-10-12.md'), 'utf8')).toContain(noteText);
    expect(reviewResult.response.status).toBe(200);
    expect(review.consistency).toMatchObject({ completedDays: 0, totalDays: 7, percent: 0 });
    expect(review.commentary).toBeNull();
    expect(suggestionsResult.response.status).toBe(200);
    expect(suggestions).toEqual({ suggestions: [] });
    expect(client.generateJson).not.toHaveBeenCalled();
    expect(events).not.toContain(noteText);
    const requestDurations = [
      nudgeResult.elapsedMs,
      noteResult.elapsedMs,
      reviewResult.elapsedMs,
      suggestionsResult.elapsedMs
    ];
    expect(requestDurations.every((duration) => duration < 100), JSON.stringify(requestDurations)).toBe(true);
  });

  it('validates notes and rejects unknown nudge windows', async () => {
    const { origin } = await createTestServer();
    const badNote = await fetch(`${origin}/api/notes`, {
      method: 'POST',
      headers: { ...authorized(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ note: '   ' })
    });
    const badWindow = await fetch(`${origin}/api/nudge/08:00`, { headers: authorized() });

    expect(badNote.status).toBe(400);
    expect(badWindow.status).toBe(400);
  });
});
