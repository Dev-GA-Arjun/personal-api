import express from 'express';
import { dirname, join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { config } from './config.js';
import { authMiddleware } from './middleware/auth.js';
import { loadRoutine, getCurrentWindow } from './engine/routine.js';
import { loadCheckInTimes, saveCheckInTimes } from './engine/settings.js';
import { appendLog, calculateWeeklyConsistency, getWindowStatus, shouldShowMinimumOnly } from './engine/storage.js';
import { markPassedWindowsAsNoData, scheduleRoutineNotifications, stopRoutineNotifications } from './notifications.js';
import { createLlmService } from './llm/service.js';
import { createLlmRouter } from './routes/llm.js';

const validStatuses = new Set(['done', 'minimum', 'skip', 'no_data']);

export function createApp(runtimeConfig = config, llmOverrides = {}) {
  const app = express();
  let notificationRuntimeConfig = null;
  let llmService;
  const getLlmService = () => {
    if (!llmService) {
      llmService = createLlmService(runtimeConfig, llmOverrides);
    }
    return llmService;
  };
  const uiDistPath = runtimeConfig.uiDistPath || join(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    'ui',
    'dist'
  );

  app.use(express.json());
  app.use(authMiddleware(runtimeConfig));

  app.get('/health', (req, res) => {
    res.json({ ok: true, time: new Date().toISOString() });
  });

  app.get('/api/settings', (req, res) => {
    try {
      const routine = loadRoutine(runtimeConfig.vaultPath);
      const checkIns = loadCheckInTimes(runtimeConfig.vaultPath, routine);
      return res.json({ ok: true, checkIns });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });

  app.put('/api/settings', (req, res) => {
    try {
      const routine = loadRoutine(runtimeConfig.vaultPath);
      const checkIns = saveCheckInTimes(runtimeConfig.vaultPath, routine, req.body?.checkIns);
      if (notificationRuntimeConfig) {
        scheduleRoutineNotifications(routine, notificationRuntimeConfig, checkIns);
      }
      return res.json({ ok: true, checkIns });
    } catch (error) {
      if (error instanceof RangeError) {
        return res.status(400).json({ error: error.message });
      }
      return res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/now', (req, res) => {
    try {
      const routine = loadRoutine(runtimeConfig.vaultPath);
      const checkIns = loadCheckInTimes(runtimeConfig.vaultPath, routine);
      const today = new Date();
      const window = getCurrentWindow(routine, today, checkIns);

      if (!window) {
        return res.json({
          ok: true,
          window: null,
          scheduledTime: null,
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
        scheduledTime: window.scheduledTime,
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

  app.post('/api/log', (req, res) => {
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

  app.get('/api/today', (req, res) => {
    try {
      const routine = loadRoutine(runtimeConfig.vaultPath);
      const checkIns = loadCheckInTimes(runtimeConfig.vaultPath, routine);
      const today = new Date();

      const windows = routine.check_ins.map((windowId, index) => {
        const scheduledTime = checkIns[index];
        const window = routine.windows[windowId];
        const status = getWindowStatus(runtimeConfig.vaultPath, today, windowId);
        const minimumOnly = shouldShowMinimumOnly(runtimeConfig.vaultPath, windowId, today);
        const task = minimumOnly ? window.minimum : window.full;

        return {
          time: scheduledTime,
          window: windowId,
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

  app.get('/api/week', (req, res) => {
    try {
      const routine = loadRoutine(runtimeConfig.vaultPath);
      const checkIns = loadCheckInTimes(runtimeConfig.vaultPath, routine);
      const today = new Date();
      const consistency = calculateWeeklyConsistency(runtimeConfig.vaultPath, today);
      const template = Object.fromEntries(checkIns.map((time, index) => [
        time,
        routine.windows[routine.check_ins[index]]
      ]));

      return res.json({
        ok: true,
        theme: routine.week_theme,
        checkIns,
        days: Object.entries(routine.days).map(([day, meta]) => ({
          day,
          focus: meta.focus
        })),
        consistency,
        template
      });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });

  app.use('/api', createLlmRouter(() => getLlmService().features));
  app.use(express.static(uiDistPath, { index: 'index.html' }));

  app.locals.activateNotificationSchedule = (activeConfig, checkIns) => {
    notificationRuntimeConfig = activeConfig;
    scheduleRoutineNotifications(loadRoutine(activeConfig.vaultPath), activeConfig, checkIns);
  };
  app.locals.deactivateNotificationSchedule = () => {
    notificationRuntimeConfig = null;
    stopRoutineNotifications();
  };
  app.locals.getLlmService = getLlmService;
  return app;
}

export const app = createApp();

export function startServer(port = config.port, host = '127.0.0.1', runtimeConfig = config) {
  const routine = loadRoutine(runtimeConfig.vaultPath);
  const checkIns = loadCheckInTimes(runtimeConfig.vaultPath, routine);
  markPassedWindowsAsNoData(runtimeConfig.vaultPath, routine, new Date(), checkIns);
  app.locals.activateNotificationSchedule(runtimeConfig, checkIns);
  const llmService = app.locals.getLlmService();
  llmService.start();

  const server = app.listen(port, host, () => {
    console.log(`Routine assistant listening on http://${host}:${port}`);
  });

  server.once('close', () => {
    llmService.stop();
    app.locals.deactivateNotificationSchedule();
  });
  return server;
}

export function shutdownServer(server) {
  if (server && typeof server.close === 'function') {
    server.close();
  } else {
    app.locals.deactivateNotificationSchedule();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startServer();
}
