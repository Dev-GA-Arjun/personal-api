import { afterEach, describe, expect, it } from 'vitest';
import http from 'http';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { createApp } from '../server/index.js';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const routineTemplate = join(projectRoot, 'sample-vault', 'Routine', 'routine.yaml');
const servers = [];
const temporaryVaults = [];

async function startServer() {
  const vaultPath = mkdtempSync(join(tmpdir(), 'personal-api-ui-'));
  temporaryVaults.push(vaultPath);
  mkdirSync(join(vaultPath, 'Routine'));
  copyFileSync(routineTemplate, join(vaultPath, 'Routine', 'routine.yaml'));

  const app = createApp({
    port: 3737,
    apiToken: 'test-token',
    allowedHosts: ['127.0.0.1', 'localhost', '::1'],
    vaultPath
  });
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  servers.push(server);
  return server;
}

function sendHostOverrideRequest(port, hostHeader, path, headers = {}) {
  return new Promise((resolve, reject) => {
    const request = http.request({
      hostname: '127.0.0.1',
      port,
      path,
      method: 'GET',
      headers: { Host: hostHeader, ...headers }
    }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        resolve({
          status: response.statusCode,
          body: Buffer.concat(chunks).toString('utf8')
        });
      });
    });

    request.on('error', reject);
    request.end();
  });
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  })));
  for (const vaultPath of temporaryVaults.splice(0)) {
    rmSync(vaultPath, { recursive: true, force: true });
  }
});

describe('React UI and local API integration', () => {
  it('serves the built UI without a token or embedded routine data', async () => {
    const server = await startServer();
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/`);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain('<div id="root"></div>');
    expect(html).not.toContain('test-token');
    expect(html).not.toContain('__API_TOKEN__');
    expect(html).not.toContain('window.__API_TOKEN__');
  });

  it('keeps health open while protecting every /api route even for HTML clients', async () => {
    const server = await startServer();
    const { port } = server.address();
    const health = await fetch(`http://127.0.0.1:${port}/health`);
    const api = await fetch(`http://127.0.0.1:${port}/api/now`, {
      headers: { Accept: 'text/html' }
    });

    expect(health.status).toBe(200);
    expect((await health.json()).ok).toBe(true);
    expect(api.status).toBe(401);
  });

  it('rejects a wrong bearer token', async () => {
    const server = await startServer();
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/api/today`, {
      headers: { Authorization: 'Bearer wrong-token' }
    });

    expect(response.status).toBe(401);
  });

  it('rejects a disallowed Host header', async () => {
    const server = await startServer();
    const { port } = server.address();
    const response = await sendHostOverrideRequest(port, 'example.com', '/api/now', {
      Authorization: 'Bearer test-token'
    });

    expect(response.status).toBe(403);
  });

  it('allows a configured IPv6 loopback Host header', async () => {
    const server = await startServer();
    const { port } = server.address();
    const response = await sendHostOverrideRequest(port, `[::1]:${port}`, '/health');

    expect(response.status).toBe(200);
  });

  it.each([
    ['09:00', 'done'],
    ['12:00', 'minimum'],
    ['15:00', 'skip']
  ])('shows a %s check-in logged as %s in Today', async (window, status) => {
    const server = await startServer();
    const { port } = server.address();
    const origin = `http://127.0.0.1:${port}`;
    const logged = await fetch(`${origin}/api/log`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer test-token',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ window, status })
    });

    expect(logged.status).toBe(201);

    const today = await fetch(`${origin}/api/today`, {
      headers: { Authorization: 'Bearer test-token' }
    });
    const data = await today.json();
    expect(today.status).toBe(200);
    expect(data.windows.find((item) => item.time === window).status).toBe(status);
  });
});
