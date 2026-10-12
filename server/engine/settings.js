import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'fs';
import { randomUUID } from 'crypto';
import { join } from 'path';

const timePattern = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;

export function validateCheckInTimes(times, expectedCount) {
  if (!Array.isArray(times) || times.length !== expectedCount) {
    throw new RangeError(`checkIns must contain exactly ${expectedCount} times`);
  }

  let previousMinutes = -1;
  for (const time of times) {
    if (typeof time !== 'string' || !timePattern.test(time)) {
      throw new RangeError('Each check-in time must use 24-hour HH:mm format');
    }

    const [hours, minutes] = time.split(':').map(Number);
    const totalMinutes = hours * 60 + minutes;
    if (totalMinutes <= previousMinutes) {
      throw new RangeError('Check-in times must be unique and in chronological order');
    }
    previousMinutes = totalMinutes;
  }
}

function settingsPath(vaultPath) {
  return join(vaultPath, 'Routine', 'check-in-times.json');
}

export function loadCheckInTimes(vaultPath, routine) {
  const path = settingsPath(vaultPath);
  let settings;
  try {
    settings = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [...routine.check_ins];
    }
    throw new Error(`Failed to read check-in settings at ${path}: ${error.message}`);
  }

  validateCheckInTimes(settings.checkIns, routine.check_ins.length);
  return [...settings.checkIns];
}

export function saveCheckInTimes(vaultPath, routine, times) {
  validateCheckInTimes(times, routine.check_ins.length);
  const path = settingsPath(vaultPath);
  const temporaryPath = `${path}.${randomUUID()}.tmp`;

  mkdirSync(join(vaultPath, 'Routine'), { recursive: true });
  try {
    writeFileSync(temporaryPath, `${JSON.stringify({ checkIns: times }, null, 2)}\n`, 'utf8');
    renameSync(temporaryPath, path);
  } catch (error) {
    if (existsSync(temporaryPath)) {
      unlinkSync(temporaryPath);
    }
    throw new Error(`Failed to save check-in settings at ${path}: ${error.message}`);
  }

  return [...times];
}
