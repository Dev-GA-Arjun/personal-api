import express from 'express';
import { pathToFileURL } from 'url';
import { config } from './config.js';
import { authMiddleware } from './middleware/auth.js';
import { loadRoutine, getCurrentWindow } from './engine/routine.js';
import { appendLog, calculateWeeklyConsistency, getWindowStatus, shouldShowMinimumOnly } from './engine/storage.js';
import { markPassedWindowsAsNoData, scheduleRoutineNotifications, stopRoutineNotifications } from './notifications.js';

const validStatuses = new Set(['done', 'minimum', 'skip', 'no_data']);

export function createApp(runtimeConfig = config) {
  const app = express();
  app.use(express.json());

  app.get('/health', (req, res) => {
    res.json({ ok: true, time: new Date().toISOString() });
  });

  app.use(authMiddleware(runtimeConfig));

  app.get('/now', (req, res) => {
    try {
      const routine = loadRoutine(runtimeConfig.vaultPath);
      const today = new Date();
      const window = getCurrentWindow(routine, today);

      if (!window) {
        return res.json({
          ok: true,
          window: null,
          task: null,
          minimumVersion: null,
          minimumOnly: false,
          date: today.toISOString().slice(0, 10)
        });
      }

      const minimumOnly = shouldShowMinimumOnly(runtimeConfig.vaultPath, window.time, today);
      const task = minimumOnly ? window.minimum : window.full;
      const status = getWindowStatus(runtimeConfig.vaultPath, today, window.time);

      return res.json({
        ok: true,
        window: window.time,
        task,
        minimumVersion: window.minimum,
        minimumOnly,
        status,
        date: today.toISOString().slice(0, 10)
      });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });

  app.post('/log', (req, res) => {
    try {
      const { window: windowTime, status, note = '' } = req.body ?? {};

      if (!windowTime || typeof windowTime !== 'string') {
        return res.status(400).json({ error: 'window is required' });
      }

      if (!validStatuses.has(status)) {
        return res.status(400).json({ error: 'status must be one of: done, minimum, skip, no_data' });
      }

      const routine = loadRoutine(runtimeConfig.vaultPath);
      if (!routine.check_ins.includes(windowTime)) {
        return res.status(400).json({ error: `window ${windowTime} is not part of the routine template` });
      }

      const today = new Date();
      appendLog(runtimeConfig.vaultPath, today, windowTime, status, typeof note === 'string' ? note : String(note || ''));

      return res.status(201).json({
        ok: true,
        window: windowTime,
        status,
        note: typeof note === 'string' ? note : String(note || '')
      });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });

  app.get('/today', (req, res) => {
    try {
      const routine = loadRoutine(runtimeConfig.vaultPath);
      const today = new Date();

      const windows = routine.check_ins.map((time) => {
        const window = routine.windows[time];
        const status = getWindowStatus(runtimeConfig.vaultPath, today, time);
        const minimumOnly = shouldShowMinimumOnly(runtimeConfig.vaultPath, time, today);
        const task = minimumOnly ? window.minimum : window.full;

        return {
          time,
          status,
          task,
          minimumVersion: window.minimum,
          fullVersion: window.full,
          minimumOnly
        };
      });

      return res.json({
        ok: true,
        date: today.toISOString().slice(0, 10),
        windows
      });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });

  app.get('/week', (req, res) => {
    try {
      const routine = loadRoutine(runtimeConfig.vaultPath);
      const today = new Date();
      const consistency = calculateWeeklyConsistency(runtimeConfig.vaultPath, today);

      return res.json({
        ok: true,
        theme: routine.week_theme,
        checkIns: routine.check_ins,
        days: Object.entries(routine.days).map(([day, meta]) => ({
          day,
          focus: meta.focus
        })),
        consistency,
        template: routine.windows
      });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });

  return app;
}

export const app = createApp();

export function startServer(port = config.port, host = '127.0.0.1', runtimeConfig = config) {
  const routine = loadRoutine(runtimeConfig.vaultPath);
  markPassedWindowsAsNoData(runtimeConfig.vaultPath, routine, new Date());
  scheduleRoutineNotifications(routine, runtimeConfig);

  const server = app.listen(port, host, () => {
    console.log(`Routine assistant listening on http://${host}:${port}`);
  });

  return server;
}

export function shutdownServer(server) {
  if (server && typeof server.close === 'function') {
    server.close();
  }
  stopRoutineNotifications();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startServer();
}
