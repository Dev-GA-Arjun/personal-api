import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadRoutine, getCurrentWindow } from '../../server/engine/routine.js';
import { readFileSync } from 'fs';
import { join } from 'path';

// Mock fs and process.env
vi.mock('fs');
vi.mock('path');

describe('loadRoutine', () => {
  const mockVaultPath = '/mock/vault/path';
  const mockRoutinePath = join(mockVaultPath, 'Routine', 'routine.yaml');

  beforeEach(() => {
    process.env.VAULT_PATH = mockVaultPath;
    vi.clearAllMocks();
  });

  it('should throw an error if VAULT_PATH is not set', () => {
    delete process.env.VAULT_PATH;
    expect(() => loadRoutine()).toThrow('VAULT_PATH environment variable is not set');
  });

  it('should throw an error if file cannot be read', () => {
    vi.mocked(readFileSync).mockImplementation(() => {
      throw new Error('ENOENT: no such file or directory');
    });

    expect(() => loadRoutine()).toThrow(`Failed to read routine.yaml at ${mockRoutinePath}`);
  });

  it('should throw an error if YAML is invalid', () => {
    vi.mocked(readFileSync).mockReturnValue('invalid: yaml: :');
    expect(() => loadRoutine()).toThrow('Failed to parse routine.yaml');
  });

  it('should validate and return a valid routine object', () => {
    const validYAML = `
week_theme: "Test Theme"
check_ins: ["09:00", "12:00", "15:00", "18:00", "21:00"]
days:
  mon: { focus: "test" }
  tue: { focus: "test" }
  wed: { focus: "test" }
  thu: { focus: "test" }
  fri: { focus: "test" }
  sat: { focus: "test" }
  sun: { focus: "test" }
windows:
  "09:00":
    full: "Full morning task"
    minimum: "Min morning task"
  "12:00":
    full: "Full noon task"
    minimum: "Min noon task"
  "15:00":
    full: "Full afternoon task"
    minimum: "Min afternoon task"
  "18:00":
    full: "Full evening task"
    minimum: "Min evening task"
  "21:00":
    full: "Full night task"
    minimum: "Min night task"
`;
    vi.mocked(readFileSync).mockReturnValue(validYAML);

    const routine = loadRoutine();
    expect(routine).toBeDefined();
    expect(routine.week_theme).toBe("Test Theme");
    expect(Array.isArray(routine.check_ins)).toBe(true);
    expect(routine.check_ins.length).toBe(5);
    expect(routine.days.mon.focus).toBe("test");
    expect(routine.windows["09:00"].full).toBe("Full morning task");
  });

  it('should throw an error for missing week_theme', () => {
    const invalidYAML = `
check_ins: ["09:00"]
days:
  mon: { focus: "test" }
  tue: { focus: "test" }
  wed: { focus: "test" }
  thu: { focus: "test" }
  fri: { focus: "test" }
  sat: { focus: "test" }
  sun: { focus: "test" }
windows:
  "09:00":
    full: "Full"
    minimum: "Min"
`;
    vi.mocked(readFileSync).mockReturnValue(invalidYAML);
    expect(() => loadRoutine()).toThrow('routine.yaml must have a string week_theme');
  });

  it('should throw an error for invalid time format', () => {
    const invalidYAML = `
week_theme: "Test"
check_ins:
  - "9:00"  # Invalid: missing leading zero for hour
days:
  mon: { focus: "test" }
  tue: { focus: "test" }
  wed: { focus: "test" }
  thu: { focus: "test" }
  fri: { focus: "test" }
  sat: { focus: "test" }
  sun: { focus: "test" }
windows:
  "9:00":
    full: "Full"
    minimum: "Min"
`;
    vi.mocked(readFileSync).mockReturnValue(invalidYAML);
    expect(() => loadRoutine()).toThrow('Invalid time format in check_ins');
  });

  it('should throw an error for missing window definition', () => {
    const invalidYAML = `
week_theme: "Test"
check_ins:
  - "09:00"
  - "12:00"
days:
  mon: { focus: "test" }
  tue: { focus: "test" }
  wed: { focus: "test" }
  thu: { focus: "test" }
  fri: { focus: "test" }
  sat: { focus: "test" }
  sun: { focus: "test" }
windows:
  "09:00":
    full: "Full"
    minimum: "Min"
    # Note: "12:00" window is intentionally missing
`;
    vi.mocked(readFileSync).mockReturnValue(invalidYAML);
    expect(() => loadRoutine()).toThrow('Missing window definition for time 12:00');
  });
});

describe('getCurrentWindow', () => {
  const mockRoutine = {
    week_theme: "Test Theme",
    check_ins: ["09:00", "12:00", "15:00", "18:00", "21:00"],
    days: {
      mon: { focus: "test" },
      tue: { focus: "test" },
      wed: { focus: "test" },
      thu: { focus: "test" },
      fri: { focus: "test" },
      sat: { focus: "test" },
      sun: { focus: "test" }
    },
    windows: {
      "09:00": { full: "Full morning", minimum: "Min morning" },
      "12:00": { full: "Full noon", minimum: "Min noon" },
      "15:00": { full: "Full afternoon", minimum: "Min afternoon" },
      "18:00": { full: "Full evening", minimum: "Min evening" },
      "21:00": { full: "Full night", minimum: "Min night" }
    }
  };

  it('should return null before first check-in', () => {
    const date = new Date(2026, 9, 12, 8, 59); // 8:59 AM
    expect(getCurrentWindow(mockRoutine, date)).toBeNull();
  });

  it('should return the first window at exact check-in time', () => {
    const date = new Date(2026, 9, 12, 9, 0); // 9:00 AM
    const window = getCurrentWindow(mockRoutine, date);
    expect(window).not.toBeNull();
    expect(window.time).toBe("09:00");
    expect(window.full).toBe("Full morning");
    expect(window.minimum).toBe("Min morning");
  });

  it('should return the first window after check-in time', () => {
    const date = new Date(2026, 9, 12, 9, 30); // 9:30 AM
    const window = getCurrentWindow(mockRoutine, date);
    expect(window.time).toBe("09:00");
    expect(window.full).toBe("Full morning");
  });

  it('should return the correct window for midday', () => {
    const date = new Date(2026, 9, 12, 12, 0); // 12:00 PM
    const window = getCurrentWindow(mockRoutine, date);
    expect(window.time).toBe("12:00");
    expect(window.full).toBe("Full noon");
  });

  it('should return the correct window in the afternoon', () => {
    const date = new Date(2026, 9, 12, 15, 30); // 3:30 PM
    const window = getCurrentWindow(mockRoutine, date);
    expect(window.time).toBe("15:00");
    expect(window.full).toBe("Full afternoon");
  });

  it('should return the last window after final check-in', () => {
    const date = new Date(2026, 9, 12, 22, 0); // 10:00 PM
    const window = getCurrentWindow(mockRoutine, date);
    expect(window.time).toBe("21:00");
    expect(window.full).toBe("Full night");
  });

  it('should handle unsorted check_ins by sorting internally', () => {
    const routineWithUnsortedTimes = {
      ...mockRoutine,
      check_ins: ["21:00", "09:00", "18:00", "12:00", "15:00"] // Unsorted
    };

    const date = new Date(2026, 9, 12, 14, 0); // 2:00 PM
    const window = getCurrentWindow(routineWithUnsortedTimes, date);
    expect(window.time).toBe("12:00"); // Should still find 12:00 as most recent <= 14:00
  });
});