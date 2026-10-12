import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';

/**
 * Log model - represents a single window check-in log entry
 * Status can be: 'done', 'minimum', 'skip', or 'no_data'
 */

/**
 * Get the daily note path for a given date
 * @param {string} vaultPath - Path to the vault
 * @param {Date} date - The date for the daily note
 * @returns {string} Path to the daily note file
 */
function getDailyNotePath(vaultPath, date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const filename = `${year}-${month}-${day}.md`;
  return join(vaultPath, 'Daily', filename);
}

/**
 * Parse logs from a daily note
 * @param {string} notePath - Path to the daily note
 * @returns {Array} Array of log entries
 */
function parseLogsFromNote(notePath) {
  if (!existsSync(notePath)) {
    return [];
  }

  const content = readFileSync(notePath, 'utf8');
  const logs = [];

  // Look for the logs table section
  const tableRegex = /\| Time \| Status \| Note \|\n\|---\|---\|---\|\n((?:\|[^\n]+\|\n)*)/;
  const match = content.match(tableRegex);

  if (!match) {
    return [];
  }

  const rows = match[1].trim().split('\n');
  for (const row of rows) {
    const cells = row.split('|').map(cell => cell.trim()).filter(cell => cell);
    if (cells.length >= 2) {
      logs.push({
        time: cells[0],
        status: cells[1],
        note: cells[2] || ''
      });
    }
  }

  return logs;
}

/**
 * Append a log entry to the daily note
 * @param {string} vaultPath - Path to the vault
 * @param {Date} date - Date of the log
 * @param {string} time - Check-in time (HH:mm)
 * @param {string} status - Status: 'done', 'minimum', 'skip', or 'no_data'
 * @param {string} note - Optional note
 */
export function appendLog(vaultPath, date, time, status, note = '') {
  const notePath = getDailyNotePath(vaultPath, date);
  const noteDir = dirname(notePath);

  // Ensure the Daily directory exists
  if (!existsSync(noteDir)) {
    mkdirSync(noteDir, { recursive: true });
  }

  let content = '';
  let hasLogsSection = false;

  if (existsSync(notePath)) {
    content = readFileSync(notePath, 'utf8');
    hasLogsSection = content.includes('## Routine Logs');
  }

  if (!hasLogsSection) {
    // Create new note with logs section
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;

    content = `# ${dateStr}\n\n## Routine Logs\n\n| Time | Status | Note |\n|---|---|---|\n`;
  }

  // Append the new log entry
  const noteCell = note ? note : '';
  const logLine = `| ${time} | ${status} | ${noteCell} |\n`;

  content += logLine;

  writeFileSync(notePath, content, 'utf8');
}

/**
 * Get logs for a specific date
 * @param {string} vaultPath - Path to the vault
 * @param {Date} date - Date to get logs for
 * @returns {Array} Array of log entries
 */
export function getLogsForDate(vaultPath, date) {
  const notePath = getDailyNotePath(vaultPath, date);
  return parseLogsFromNote(notePath);
}

/**
 * Get the status for a specific window on a specific date
 * @param {string} vaultPath - Path to the vault
 * @param {Date} date - Date to check
 * @param {string} time - Window time (HH:mm)
 * @returns {string} Status: 'done', 'minimum', 'skip', or 'no_data'
 */
export function getWindowStatus(vaultPath, date, time) {
  const logs = getLogsForDate(vaultPath, date);
  const log = logs.find(l => l.time === time);
  return log ? log.status : 'no_data';
}

/**
 * Check if a status counts as "done" (done or minimum both count)
 * @param {string} status - The status to check
 * @returns {boolean} True if the status counts as done
 */
export function countsAsDone(status) {
  return status === 'done' || status === 'minimum';
}

/**
 * Get logs for the past N days
 * @param {string} vaultPath - Path to the vault
 * @param {number} days - Number of days to look back
 * @param {Date} fromDate - Date to count back from (defaults to today)
 * @returns {Array} Array of {date, logs} objects
 */
export function getLogsForPastDays(vaultPath, days, fromDate = new Date()) {
  const result = [];

  for (let i = 0; i < days; i++) {
    const date = new Date(fromDate);
    date.setDate(date.getDate() - i);

    result.push({
      date: new Date(date),
      logs: getLogsForDate(vaultPath, date)
    });
  }

  return result;
}

/**
 * Calculate weekly consistency: days with at least one "done" or "minimum" out of 7
 * @param {string} vaultPath - Path to the vault
 * @param {Date} fromDate - Date to count back from (defaults to today)
 * @returns {Object} { completedDays, totalDays }
 */
export function calculateWeeklyConsistency(vaultPath, fromDate = new Date()) {
  const weekLogs = getLogsForPastDays(vaultPath, 7, fromDate);

  let completedDays = 0;

  for (const { logs } of weekLogs) {
    // A day counts if at least one window was done or minimum
    const hasDone = logs.some(log => countsAsDone(log.status));
    if (hasDone) {
      completedDays++;
    }
  }

  return {
    completedDays,
    totalDays: 7
  };
}

/**
 * Check if we should show minimum version only for a window
 * (Never miss twice: if yesterday was skipped, today shows minimum only)
 * @param {string} vaultPath - Path to the vault
 * @param {string} time - Window time (HH:mm)
 * @param {Date} today - Today's date
 * @returns {boolean} True if should show minimum version only
 */
export function shouldShowMinimumOnly(vaultPath, time, today = new Date()) {
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const yesterdayStatus = getWindowStatus(vaultPath, yesterday, time);
  return yesterdayStatus === 'skip';
}

/**
 * Check if reset mode should be enabled
 * (Reset mode after 2 or more fully missed days)
 * @param {string} vaultPath - Path to the vault
 * @param {Date} fromDate - Date to check from
 * @returns {boolean} True if reset mode should be enabled
 */
export function shouldEnterResetMode(vaultPath, fromDate = new Date()) {
  const recentLogs = getLogsForPastDays(vaultPath, 3, fromDate);

  let consecutiveMissedDays = 0;

  for (const { logs } of recentLogs) {
    // A day is fully missed if all logged windows are 'skip' or all are 'no_data'
    const allSkipped = logs.length > 0 && logs.every(log => log.status === 'skip');
    const allNoData = logs.length === 0 || logs.every(log => log.status === 'no_data');

    if (allSkipped || allNoData) {
      consecutiveMissedDays++;
    } else {
      break; // Stop counting at the first non-missed day
    }
  }

  return consecutiveMissedDays >= 2;
}