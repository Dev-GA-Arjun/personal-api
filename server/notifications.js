import { exec } from 'child_process';
import cron from 'node-cron';
import notifier from 'node-notifier';
import { appendLog, getWindowStatus, shouldShowMinimumOnly } from './engine/storage.js';

let scheduledJobs = [];

function timeToMinutes(time) {
  const [hours, minutes] = String(time).split(':').map(Number);
  return hours * 60 + minutes;
}

export function stopRoutineNotifications() {
  for (const job of scheduledJobs) {
    if (job && typeof job.stop === 'function') {
      job.stop();
    }
  }
  scheduledJobs = [];
}

export function markPassedWindowsAsNoData(vaultPath, routine, now = new Date()) {
  if (!vaultPath || !routine || !Array.isArray(routine.check_ins)) {
    return [];
  }

  const today = new Date(now);
  const currentMinutes = timeToMinutes(
    `${String(today.getHours()).padStart(2, '0')}:${String(today.getMinutes()).padStart(2, '0')}`
  );

  const updated = [];
  for (const time of [...routine.check_ins].sort((a, b) => timeToMinutes(a) - timeToMinutes(b))) {
    if (timeToMinutes(time) > currentMinutes) {
      break;
    }

    const existingStatus = getWindowStatus(vaultPath, today, time);
    if (existingStatus === 'no_data') {
      appendLog(vaultPath, today, time, 'no_data');
      updated.push(time);
    }
  }

  return updated;
}

export function openRoutinePage(url) {
  const target = typeof url === 'string' && url ? url : 'http://127.0.0.1:3737/now';

  try {
    if (process.platform === 'win32') {
      exec(`cmd /c start "" "${target}"`);
      return;
    }

    if (process.platform === 'darwin') {
      exec(`open "${target}"`);
      return;
    }

    exec(`xdg-open "${target}"`);
  } catch (error) {
    console.warn('Unable to open routine page automatically:', error.message);
  }
}

export function scheduleRoutineNotifications(routine, runtimeConfig) {
  if (!routine || !Array.isArray(routine.check_ins) || !runtimeConfig) {
    return [];
  }

  stopRoutineNotifications();

  const jobs = routine.check_ins.map((time) => {
    const [hours, minutes] = String(time).split(':').map(Number);
    const cronExpression = `${minutes} ${hours} * * *`;
    const targetUrl = `http://127.0.0.1:${runtimeConfig.port}/now`;

    return cron.schedule(
      cronExpression,
      () => {
        const now = new Date();
        const windowData = routine.windows[time];
        const minimumOnly = shouldShowMinimumOnly(runtimeConfig.vaultPath, time, now);
        const task = minimumOnly ? windowData.minimum : windowData.full;

        try {
          notifier.notify(
            {
              title: `Routine check-in • ${time}`,
              message: task,
              wait: true,
              open: targetUrl
            },
            (error, response) => {
              if (error) {
                console.warn('Routine notification error:', error.message);
                return;
              }

              if (response && response !== 'timeout') {
                openRoutinePage(targetUrl);
              }
            }
          );
        } catch (error) {
          console.warn('Unable to trigger routine notification:', error.message);
        }
      }
    );
  });

  scheduledJobs = jobs;
  return jobs;
}
