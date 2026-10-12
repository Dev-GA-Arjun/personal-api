import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { appendLog, getLogsForDate, getWindowStatus, countsAsDone, calculateWeeklyConsistency, shouldShowMinimumOnly, shouldEnterResetMode } from '../../server/engine/storage.js';
import { rmSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

describe('Storage and Engine Rules', () => {
  const testVaultPath = join(process.cwd(), 'test-vault-temp');
  const testDate = new Date(2026, 9, 12); // Oct 12, 2026

  beforeEach(() => {
    // Clean up and create test vault
    if (existsSync(testVaultPath)) {
      rmSync(testVaultPath, { recursive: true, force: true });
    }
    mkdirSync(join(testVaultPath, 'Daily'), { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testVaultPath)) {
      rmSync(testVaultPath, { recursive: true, force: true });
    }
  });

  it('should append logs and retrieve them correctly', () => {
    appendLog(testVaultPath, testDate, '09:00', 'done', 'Great start');
    appendLog(testVaultPath, testDate, '12:00', 'minimum', 'Drank water');

    const logs = getLogsForDate(testVaultPath, testDate);
    expect(logs.length).toBe(2);
    expect(logs[0]).toEqual({ time: '09:00', status: 'done', note: 'Great start' });
    expect(logs[1]).toEqual({ time: '12:00', status: 'minimum', note: 'Drank water' });
  });

  it('should return no_data for unlogged windows', () => {
    const status = getWindowStatus(testVaultPath, testDate, '09:00');
    expect(status).toBe('no_data');
  });

  it('should evaluate countsAsDone correctly', () => {
    expect(countsAsDone('done')).toBe(true);
    expect(countsAsDone('minimum')).toBe(true);
    expect(countsAsDone('skip')).toBe(false);
    expect(countsAsDone('no_data')).toBe(false);
  });

  it('should calculate weekly consistency correctly', () => {
    // Log today as done
    appendLog(testVaultPath, testDate, '09:00', 'done');

    // Log 2 days ago as minimum
    const twoDaysAgo = new Date(testDate);
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
    appendLog(testVaultPath, twoDaysAgo, '09:00', 'minimum');

    const consistency = calculateWeeklyConsistency(testVaultPath, testDate);
    expect(consistency.completedDays).toBe(2);
    expect(consistency.totalDays).toBe(7);
  });

  it('should implement never-miss-twice rule (skip yesterday -> minimum only today)', () => {
    const yesterday = new Date(testDate);
    yesterday.setDate(yesterday.getDate() - 1);

    // Skip yesterday at 09:00
    appendLog(testVaultPath, yesterday, '09:00', 'skip');

    const minOnly = shouldShowMinimumOnly(testVaultPath, '09:00', testDate);
    expect(minOnly).toBe(true);

    // If yesterday was done, should not show minimum only
    const yesterday2 = new Date(testDate);
    yesterday2.setDate(yesterday2.getDate() - 1);

    // Clear and log 'done' yesterday
    rmSync(testVaultPath, { recursive: true, force: true });
    mkdirSync(join(testVaultPath, 'Daily'), { recursive: true });
    appendLog(testVaultPath, yesterday2, '09:00', 'done');

    const minOnly2 = shouldShowMinimumOnly(testVaultPath, '09:00', testDate);
    expect(minOnly2).toBe(false);
  });

  it('should detect reset mode after 2 or more fully missed days', () => {
    const yesterday = new Date(testDate);
    yesterday.setDate(yesterday.getDate() - 1);

    const twoDaysAgo = new Date(testDate);
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

    // Miss yesterday and two days ago (skipped or no_data)
    appendLog(testVaultPath, yesterday, '09:00', 'skip');
    appendLog(testVaultPath, twoDaysAgo, '09:00', 'skip');

    const reset = shouldEnterResetMode(testVaultPath, testDate);
    expect(reset).toBe(true);
  });
});