import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { createHash } from 'crypto';
import {
  getLogsForPastDays,
  countsAsDone
} from '../engine/storage.js';

const nudgeSchema = {
  type: 'object',
  properties: { text: { type: 'string' } },
  required: ['text'],
  additionalProperties: false
};

const reflectionSchema = {
  type: 'object',
  properties: { reflection: { type: 'string' } },
  required: ['reflection'],
  additionalProperties: false
};

const reviewSchema = {
  type: 'object',
  properties: {
    commentary: { type: 'string' },
    suggestions: {
      type: 'array',
      items: { type: 'string' }
    }
  },
  required: ['commentary', 'suggestions'],
  additionalProperties: false
};

function formatDate(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-');
}

function addDays(date, amount) {
  const result = new Date(date);
  result.setDate(result.getDate() + amount);
  return result;
}

function readJson(filePath, fallback) {
  if (!existsSync(filePath)) {
    return fallback;
  }
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  mkdirSync(dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(value)}\n`, 'utf8');
  renameSync(temporaryPath, filePath);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function appendSection(filePath, heading, body) {
  mkdirSync(dirname(filePath), { recursive: true });
  const content = existsSync(filePath) ? readFileSync(filePath, 'utf8') : '';
  const sectionHeader = `## ${heading}`;
  const headerPattern = new RegExp(`^${escapeRegExp(sectionHeader)}\\s*$`, 'm');
  const match = headerPattern.exec(content);

  if (!match) {
    const prefix = content.trimEnd();
    writeFileSync(filePath, `${prefix ? `${prefix}\n\n` : ''}${sectionHeader}\n\n${body.trim()}\n`, 'utf8');
    return;
  }

  const bodyStart = match.index + match[0].length;
  const remainder = content.slice(bodyStart);
  const nextSectionOffset = remainder.search(/^## /m);
  const bodyEnd = nextSectionOffset === -1 ? content.length : bodyStart + nextSectionOffset;
  const previousSection = content.slice(0, bodyEnd).trimEnd();
  const nextSection = content.slice(bodyEnd).trimStart();
  writeFileSync(
    filePath,
    `${previousSection}\n\n${body.trim()}\n\n${nextSection}`,
    'utf8'
  );
}

function appendNote(vaultPath, date, note) {
  const notePath = join(vaultPath, 'Daily', `${formatDate(date)}.md`);
  const quote = note.trim().split(/\r?\n/).map((line) => `> ${line}`).join('\n');
  appendSection(notePath, 'Notes', `### ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}\n\n${quote}`);
  return notePath;
}

function replaceReflection(vaultPath, date, jobId, reflection) {
  const notePath = join(vaultPath, 'Daily', `${formatDate(date)}.md`);
  const heading = `## Reflections`;
  const content = existsSync(notePath) ? readFileSync(notePath, 'utf8') : `# ${formatDate(date)}\n`;
  const sectionPattern = /^## Reflections\s*$/m;
  const sectionMatch = sectionPattern.exec(content);
  const entryHeading = `### ${jobId}`;
  const entryPattern = new RegExp(`^${escapeRegExp(entryHeading)}\\s*$`, 'm');
  const entryMatch = entryPattern.exec(content);

  if (entryMatch) {
    const start = entryMatch.index + entryMatch[0].length;
    const remainder = content.slice(start);
    const nextHeading = remainder.search(/^#{2,3} /m);
    const end = nextHeading === -1 ? content.length : start + nextHeading;
    writeFileSync(notePath, `${content.slice(0, start)}\n\n${reflection.trim()}\n\n${content.slice(end).trimStart()}`, 'utf8');
    return;
  }

  if (!sectionMatch) {
    const prefix = content.trimEnd();
    writeFileSync(notePath, `${prefix}\n\n${heading}\n\n${entryHeading}\n\n${reflection.trim()}\n`, 'utf8');
    return;
  }

  const sectionStart = sectionMatch.index + sectionMatch[0].length;
  const remainder = content.slice(sectionStart);
  const nextSection = remainder.search(/^## /m);
  const insertAt = nextSection === -1 ? content.length : sectionStart + nextSection;
  writeFileSync(
    notePath,
    `${content.slice(0, insertAt).trimEnd()}\n\n${entryHeading}\n\n${reflection.trim()}\n\n${content.slice(insertAt).trimStart()}`,
    'utf8'
  );
}

function fallbackNudge(windowTime, task) {
  return `A small step counts for ${windowTime}: ${task}.`;
}

function statusCounts(vaultPath, windowTime, fromDate) {
  const counts = { done: 0, minimum: 0, skip: 0, no_data: 0 };
  for (const { logs } of getLogsForPastDays(vaultPath, 7, fromDate)) {
    const log = logs.find((entry) => entry.time === windowTime);
    const status = log?.status || 'no_data';
    if (Object.hasOwn(counts, status)) {
      counts[status] += 1;
    } else {
      counts.no_data += 1;
    }
  }
  return counts;
}

function buildWeeklyReview(vaultPath, routine, fromDate) {
  const days = getLogsForPastDays(vaultPath, 7, fromDate);
  const completedDays = days.filter(({ logs }) => logs.some((log) => countsAsDone(log.status))).length;
  const missesByWindow = routine.check_ins.map((window) => ({
    window,
    misses: days.reduce((misses, { logs }) => {
      const status = logs.find((log) => log.time === window)?.status || 'no_data';
      return misses + (status === 'skip' || status === 'no_data' ? 1 : 0);
    }, 0)
  }));
  const weekStart = formatDate(addDays(fromDate, -6));

  return {
    weekStart,
    consistency: {
      completedDays,
      totalDays: 7,
      percent: Math.round((completedDays / 7) * 100)
    },
    missesByWindow
  };
}

function formatWeeklyReview(review, commentary = null) {
  const misses = review.missesByWindow
    .map(({ window, misses: count }) => `- ${window}: ${count}`)
    .join('\n');
  const modelCommentary = commentary || 'Pending; deterministic summary is available.';
  return [
    `# Weekly review — ${review.weekStart}`,
    '',
    '## Deterministic summary',
    `Consistency: ${review.consistency.percent}% (${review.consistency.completedDays}/${review.consistency.totalDays} days)`,
    '',
    '## Misses per window',
    misses,
    '',
    '## Model commentary',
    modelCommentary,
    ''
  ].join('\n');
}

export function createLlmFeatures({
  vaultPath,
  routine,
  queue,
  client,
  events,
  now = () => new Date(),
  cacheDirectory = join(process.cwd(), 'queue', 'cache')
} = {}) {
  if (!vaultPath || !routine || !queue || !client || !events) {
    throw new TypeError('LLM features require vault, routine, queue, client, and event logger');
  }

  const nudgeCachePath = join(cacheDirectory, 'nudges.json');
  const reviewCachePath = join(cacheDirectory, 'reviews.json');
  const suggestionsPath = join(cacheDirectory, 'suggestions.json');

  function queueJob(type, payload, idempotencyKey) {
    return queue.enqueue(type, payload, { idempotencyKey });
  }

  function prepareNudgeWeek() {
    const today = now();
    const countsByWindow = Object.fromEntries(routine.check_ins.map((window) => [
      window,
      statusCounts(vaultPath, window, today)
    ]));
    let queuedCount = 0;

    for (let dayOffset = 0; dayOffset < 7; dayOffset += 1) {
      const date = formatDate(addDays(today, dayOffset));
      for (const window of routine.check_ins) {
        const tasks = routine.windows[window];
        queueJob('nudge', {
          date,
          window,
          fullTask: tasks.full,
          minimumTask: tasks.minimum,
          counts: countsByWindow[window]
        }, `${date}:${window}`);
        queuedCount += 1;
      }
    }
    return queuedCount;
  }

  function getNudge(window, date = now()) {
    if (!routine.check_ins.includes(window)) {
      throw new RangeError(`Unknown routine window: ${window}`);
    }

    const key = `${formatDate(date)}:${window}`;
    const cache = readJson(nudgeCachePath, {});
    const cachedText = cache[key];
    if (typeof cachedText === 'string' && cachedText.trim()) {
      return { date: formatDate(date), window, text: cachedText, cached: true };
    }

    const task = routine.windows[window].minimum;
    events.fallbackUsed('nudge', 'cache_miss');
    return {
      date: formatDate(date),
      window,
      text: fallbackNudge(window, task),
      cached: false
    };
  }

  function addNote(note) {
    if (typeof note !== 'string' || !note.trim()) {
      throw new TypeError('Note must be a non-empty string');
    }

    const createdAt = now();
    const date = formatDate(createdAt);
    appendNote(vaultPath, createdAt, note);
    const job = queueJob('reflection', { date, note: note.trim() }, `${date}:${note.trim()}`);
    return { ok: true, date, queued: true, jobId: job.id };
  }

  function getWeeklyReview(fromDate = now()) {
    const review = buildWeeklyReview(vaultPath, routine, fromDate);
    const cachedReviews = readJson(reviewCachePath, {});
    const commentary = typeof cachedReviews[review.weekStart] === 'string'
      ? cachedReviews[review.weekStart]
      : null;
    const reviewPath = join(vaultPath, 'Routine', 'Reviews', `${review.weekStart}.md`);
    mkdirSync(dirname(reviewPath), { recursive: true });
    writeFileSync(reviewPath, formatWeeklyReview(review, commentary), 'utf8');

    if (commentary === null) {
      events.fallbackUsed('weekly_review', 'commentary_pending');
      queueJob('review', review, review.weekStart);
    }
    return { ...review, commentary };
  }

  function getSuggestions() {
    const suggestions = readJson(suggestionsPath, []);
    if (!Array.isArray(suggestions)) {
      throw new Error('Stored template suggestions are invalid');
    }
    return suggestions.filter((suggestion) => suggestion.status === 'pending');
  }

  function callModel(feature, systemPrompt, userPrompt, schema) {
    const startedAt = Date.now();
    return client.generateJson({ feature, systemPrompt, userPrompt, schema }).then((result) => {
      events.modelCall(feature, true, result.durationMs);
      return result.value;
    }).catch((error) => {
      const durationMs = Number.isFinite(error.durationMs)
        ? error.durationMs
        : Math.max(0, Date.now() - startedAt);
      events.modelCall(feature, false, durationMs);
      throw error;
    });
  }

  async function processJob(job) {
    if (job.type === 'nudge') {
      const { date, window, fullTask, minimumTask, counts } = job.payload;
      const result = await callModel(
        'nudge',
        'Write one concise, encouraging check-in nudge. Return JSON with a single text string.',
        `Full task: ${fullTask}\nMinimum task: ${minimumTask}\nStatus counts: ${JSON.stringify(counts)}`,
        nudgeSchema
      );
      const cache = readJson(nudgeCachePath, {});
      cache[`${date}:${window}`] = result.text;
      writeJson(nudgeCachePath, cache);
      return;
    }

    if (job.type === 'reflection') {
      const { date, note } = job.payload;
      const result = await callModel(
        'reflection',
        'Write a brief, supportive reflection on the provided private note. Do not give medical or financial advice. Return JSON with a single reflection string.',
        note,
        reflectionSchema
      );
      replaceReflection(vaultPath, new Date(`${date}T12:00:00`), job.id, result.reflection);
      return;
    }

    if (job.type === 'review') {
      const review = job.payload;
      const result = await callModel(
        'weekly_review',
        'Comment on the deterministic routine summary. Suggest only optional template changes; do not apply them. Return JSON with commentary and a suggestions array of strings.',
        JSON.stringify({
          weekStart: review.weekStart,
          consistency: review.consistency,
          missesByWindow: review.missesByWindow
        }),
        reviewSchema
      );
      const reviews = readJson(reviewCachePath, {});
      reviews[review.weekStart] = result.commentary;
      writeJson(reviewCachePath, reviews);

      const suggestions = readJson(suggestionsPath, []);
      const existingIds = new Set(suggestions.map((suggestion) => suggestion.id));
      for (const text of result.suggestions) {
        const id = createHash('sha256')
          .update(`${review.weekStart}\0${text}`)
          .digest('hex');
        if (!existingIds.has(id)) {
          suggestions.push({ id, text, status: 'pending', createdAt: now().toISOString() });
          existingIds.add(id);
        }
      }
      writeJson(suggestionsPath, suggestions);
      const reviewPath = join(vaultPath, 'Routine', 'Reviews', `${review.weekStart}.md`);
      mkdirSync(dirname(reviewPath), { recursive: true });
      writeFileSync(reviewPath, formatWeeklyReview(review, result.commentary), 'utf8');
      return;
    }

    throw new Error(`Unsupported LLM queue job type: ${job.type}`);
  }

  return {
    prepareNudgeWeek,
    getNudge,
    addNote,
    getWeeklyReview,
    getSuggestions,
    processJob
  };
}
