import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { getLogsForDate } from '../server/engine/storage.js';
import { markPassedWindowsAsNoData, scheduleRoutineNotifications, stopRoutineNotifications } from '../server/notifications.js';

describe('notification startup and scheduling', () => {
  const testVaultPath = join(process.cwd(), 'test-vault-temp-notify');
  const routine = {
    week_theme: 'Test Theme',
    check_ins: ['09:00', '12:00', '15:00', '18:00', '21:00'],
    days: {
      mon: { focus: 'test' },
      tue: { focus: 'test' },
      wed: { focus: 'test' },
      thu: { focus: 'test' },
      fri: { focus: 'test' },
      sat: { focus: 'test' },
      sun: { focus: 'test' }
    },
    windows: {
      '09:00': { full: 'Full morning', minimum: 'Min morning' },
      '12:00': { full: 'Full noon', minimum: 'Min noon' },
      '15:00': { full: 'Full afternoon', minimum: 'Min afternoon' },
      '18:00': { full: 'Full evening', minimum: 'Min evening' },
      '21:00': { full: 'Full night', minimum: 'Min night' }
    }
  };

  beforeEach(() => {
    if (existsSync(testVaultPath)) {
      rmSync(testVaultPath, { recursive: true, force: true });
    }
    mkdirSync(join(testVaultPath, 'Daily'), { recursive: true });
  });

  afterEach(() => {
    stopRoutineNotifications();
    if (existsSync(testVaultPath)) {
      rmSync(testVaultPath, { recursive: true, force: true });
    }
  });

  it('marks already-passed windows as no_data on startup', () => {
    const today = new Date(2026, 9, 12, 13, 30);
    const updated = markPassedWindowsAsNoData(testVaultPath, routine, today);

    expect(updated).toEqual(['09:00', '12:00']);

    const logs = getLogsForDate(testVaultPath, today);
    expect(logs.map(({ time, status }) => ({ time, status }))).toEqual([
      { time: '09:00', status: 'no_data' },
      { time: '12:00', status: 'no_data' }
    ]);
  });

  it('uses edited reminder times while recording no_data against stable routine windows', () => {
    const today = new Date(2026, 9, 12, 13, 30);
    const schedule = ['08:00', '10:00', '14:00', '18:00', '22:00'];
    const updated = markPassedWindowsAsNoData(testVaultPath, routine, today, schedule);

    expect(updated).toEqual(['09:00', '12:00']);
    const logs = getLogsForDate(testVaultPath, today);
    expect(logs.map(({ time }) => time)).toEqual(['09:00', '12:00']);
  });

  it('creates one scheduled cron job for each check-in time', () => {
    const jobs = scheduleRoutineNotifications(routine, {
      port: 3737,
      vaultPath: testVaultPath
    });

    expect(jobs).toHaveLength(routine.check_ins.length);
    jobs.forEach((job) => expect(job).toBeDefined());
    jobs.forEach((job) => expect(job.cronExpression).toBeTruthy());
  });

  it('schedules notification jobs at the edited reminder times', () => {
    const schedule = ['08:30', '11:45', '14:30', '17:30', '20:30'];
    const jobs = scheduleRoutineNotifications(routine, {
      port: 3737,
      vaultPath: testVaultPath
    }, schedule);

    expect(jobs.map((job) => job.cronExpression)).toEqual([
      '30 8 * * *',
      '45 11 * * *',
      '30 14 * * *',
      '30 17 * * *',
      '30 20 * * *'
    ]);
  });
});
