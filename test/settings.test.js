import { afterEach, describe, expect, it } from 'vitest';
import http from 'http';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { createApp } from '../server/index.js';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const routineTemplate = join(projectRoot, 'sample-vault', 'Routine', 'routine.yaml');
const servers = [];
const temporaryVaults = [];
const token = 'settings-test-token';
const updatedTimes = ['08:30', '11:45', '14:30', '17:30', '20:30'];

async function startServer() {
  const vaultPath = mkdtempSync(join(tmpdir(), 'personal-api-settings-'));
  temporaryVaults.push(vaultPath);
  mkdirSync(join(vaultPath, 'Routine'));
  copyFileSync(routineTemplate, join(vaultPath, 'Routine', 'routine.yaml'));

  const app = createApp({
    port: 3737,
    apiToken: token,
    allowedHosts: ['127.0.0.1', 'localhost', '::1'],
    vaultPath
  });
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  servers.push(server);
  return { server, vaultPath };
}

function headers(extra = {}) {
  return { Authorization: `Bearer ${token}`, ...extra };
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  })));
  for (const vaultPath of temporaryVaults.splice(0)) {
    rmSync(vaultPath, { recursive: true, force: true });
  }
});

describe('check-in time settings', () => {
  it('protects settings and returns the routine defaults', async () => {
    const { server } = await startServer();
    const origin = `http://127.0.0.1:${server.address().port}`;

    const unauthorized = await fetch(`${origin}/api/settings`);
    const response = await fetch(`${origin}/api/settings`, { headers: headers() });
    const settings = await response.json();

    expect(unauthorized.status).toBe(401);
    expect(response.status).toBe(200);
    expect(settings.checkIns).toEqual(['09:00', '12:00', '15:00', '18:00', '21:00']);
  });

  it('saves reminder times without changing task order or historical log keys', async () => {
    const { server, vaultPath } = await startServer();
    const origin = `http://127.0.0.1:${server.address().port}`;
    const routinePath = join(vaultPath, 'Routine', 'routine.yaml');
    const routineBefore = readFileSync(routinePath, 'utf8');

    const saved = await fetch(`${origin}/api/settings`, {
      method: 'PUT',
      headers: headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ checkIns: updatedTimes })
    });
    const savedSettings = await saved.json();

    expect(saved.status).toBe(200);
    expect(savedSettings.checkIns).toEqual(updatedTimes);
    expect(readFileSync(routinePath, 'utf8')).toBe(routineBefore);

    const logged = await fetch(`${origin}/api/log`, {
      method: 'POST',
      headers: headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ window: '09:00', status: 'done' })
    });
    expect(logged.status).toBe(201);

    const todayResponse = await fetch(`${origin}/api/today`, { headers: headers() });
    const today = await todayResponse.json();
    expect(today.windows[0]).toMatchObject({
      time: updatedTimes[0],
      window: '09:00',
      status: 'done'
    });
    expect(today.windows[0].task).toBe('Example: take a short morning walk and read');

    const weekResponse = await fetch(`${origin}/api/week`, { headers: headers() });
    const week = await weekResponse.json();
    expect(week.checkIns).toEqual(updatedTimes);
    expect(week.template[updatedTimes[0]].full).toBe(today.windows[0].task);

    const loaded = await fetch(`${origin}/api/settings`, { headers: headers() });
    expect((await loaded.json()).checkIns).toEqual(updatedTimes);

    const secondTimes = ['08:45', '11:50', '14:45', '17:45', '20:45'];
    const updatedAgain = await fetch(`${origin}/api/settings`, {
      method: 'PUT',
      headers: headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ checkIns: secondTimes })
    });
    expect(updatedAgain.status).toBe(200);
    expect((await updatedAgain.json()).checkIns).toEqual(secondTimes);
  });

  it.each([
    [['08:30', '11:45', '14:30', '14:30', '20:30'], 'chronological order'],
    [['08:30', '11:45', '14:30', '17:30'], 'exactly 5 times'],
    [['08:30', '11:45', '14:30', '17:30', '25:00'], '24-hour HH:mm']
  ])('rejects invalid time sets without persisting them', async (checkIns, errorText) => {
    const { server, vaultPath } = await startServer();
    const origin = `http://127.0.0.1:${server.address().port}`;
    const response = await fetch(`${origin}/api/settings`, {
      method: 'PUT',
      headers: headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ checkIns })
    });

    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain(errorText);
    expect(() => readFileSync(join(vaultPath, 'Routine', 'check-in-times.json'))).toThrow();
  });
});
