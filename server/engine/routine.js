import yaml from 'yaml';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Load and validate the routine.yaml file from the vault
 * @returns {Object} Parsed and validated routine object
 * @throws {Error} If the file is missing, invalid, or fails validation
 */
export function loadRoutine(vaultPathOverride = process.env.VAULT_PATH) {
  const vaultPath = vaultPathOverride || process.env.VAULT_PATH;
  if (!vaultPath) {
    throw new Error('VAULT_PATH environment variable is not set');
  }

  const routinePath = join(vaultPath, 'Routine', 'routine.yaml');

  let routineContent;
  try {
    routineContent = readFileSync(routinePath, 'utf8');
  } catch (err) {
    throw new Error(`Failed to read routine.yaml at ${routinePath}: ${err.message}`);
  }

  let routine;
  try {
    routine = yaml.parse(routineContent);
  } catch (err) {
    throw new Error(`Failed to parse routine.yaml: ${err.message}`);
  }

  validateRoutine(routine);
  return routine;
}

/**
 * Validate the routine object structure
 * @param {Object} routine - The parsed routine object
 * @throws {Error} If validation fails
 */
function validateRoutine(routine) {
  // Check required top-level keys
  if (!routine.week_theme || typeof routine.week_theme !== 'string') {
    throw new Error('routine.yaml must have a string week_theme');
  }

  if (!Array.isArray(routine.check_ins)) {
    throw new Error('routine.yaml must have an array check_ins');
  }

  if (routine.check_ins.length === 0) {
    throw new Error('routine.yaml check_ins array must not be empty');
  }

  // Validate each check-in time format
  const timeRegex = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
  for (const time of routine.check_ins) {
    if (typeof time !== 'string' || !timeRegex.test(time)) {
      throw new Error(`Invalid time format in check_ins: ${time}. Expected HH:mm in 24-hour format`);
    }
  }

  if (!routine.days || typeof routine.days !== 'object') {
    throw new Error('routine.yaml must have a days object');
  }

  const dayKeys = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  for (const day of dayKeys) {
    if (!routine.days[day] || typeof routine.days[day] !== 'object' || !routine.days[day].focus || typeof routine.days[day].focus !== 'string') {
      throw new Error(`routine.yaml days.${day} must be an object with a string focus`);
    }
  }

  if (!routine.windows || typeof routine.windows !== 'object') {
    throw new Error('routine.yaml must have a windows object');
  }

  // Check that every check-in time has a corresponding window
  for (const time of routine.check_ins) {
    if (!routine.windows[time]) {
      throw new Error(`Missing window definition for time ${time} in check_ins`);
    }
    const window = routine.windows[time];
    if (!window.full || typeof window.full !== 'string' || !window.minimum || typeof window.minimum !== 'string') {
      throw new Error(`Window for time ${time} must have string full and minimum properties`);
    }
  }

  // Check that check_ins are sorted chronologically (sort a copy for comparison)
  const sortedCheckIns = [...routine.check_ins].sort((a, b) => {
    const [aHours, aMinutes] = a.split(':').map(Number);
    const [bHours, bMinutes] = b.split(':').map(Number);
    return aHours * 60 + aMinutes - (bHours * 60 + bMinutes);
  });

  // If not already sorted, we'll sort them in the loader (but we warn about it)
  const isAlreadySorted = routine.check_ins.every((time, index) => time === sortedCheckIns[index]);
  if (!isAlreadySorted) {
    // This is not an error, but we could log a warning. For now, we'll just note it.
    // The window logic will sort internally anyway.
  }
}

/**
 * Get the current window based on time
 * @param {Object} routine - The validated routine object
 * @param {Date|number} date - Date object or timestamp
 * @returns {Object|null} The window object with full and minimum tasks, or null if before first check-in
 */
export function getCurrentWindow(routine, date, scheduledTimes = routine.check_ins) {
  const now = date instanceof Date ? date : new Date(date);
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const totalMinutes = hours * 60 + minutes;

  const sortedSlots = scheduledTimes
    .map((scheduledTime, index) => ({
      scheduledTime,
      routineTime: routine.check_ins[index]
    }))
    .sort((a, b) => {
      const [aHours, aMinutes] = a.scheduledTime.split(':').map(Number);
      const [bHours, bMinutes] = b.scheduledTime.split(':').map(Number);
      return aHours * 60 + aMinutes - (bHours * 60 + bMinutes);
    });

  // Find the most recent check-in time that is <= current time
  let currentSlot = null;
  for (const slot of sortedSlots) {
    const [timeHours, timeMinutes] = slot.scheduledTime.split(':').map(Number);
    const timeTotalMinutes = timeHours * 60 + timeMinutes;

    if (timeTotalMinutes <= totalMinutes) {
      currentSlot = slot;
    } else {
      // Since sorted, we can break early
      break;
    }
  }

  // If no window time found (before first check-in), return null
  if (currentSlot === null) {
    return null;
  }

  // Return the window object for this time
  return {
    full: routine.windows[currentSlot.routineTime].full,
    minimum: routine.windows[currentSlot.routineTime].minimum,
    time: currentSlot.routineTime,
    scheduledTime: currentSlot.scheduledTime
  };
}