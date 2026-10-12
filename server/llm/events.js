import { appendFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';

export function createEventLogger({
  filePath = join(process.cwd(), 'events.jsonl')
} = {}) {
  function append(event) {
    mkdirSync(dirname(filePath), { recursive: true });
    appendFileSync(filePath, `${JSON.stringify(event)}\n`, 'utf8');
  }

  return {
    modelCall(feature, ok, durationMs) {
      append({
        event: 'model_call',
        feature,
        ok: Boolean(ok),
        durationMs: Number.isFinite(durationMs) ? Math.max(0, Math.round(durationMs)) : 0
      });
    },
    fallbackUsed(feature, reason) {
      append({ event: 'fallback_used', feature, reason });
    },
    queued({ id, type }) {
      append({ event: 'queued', id, type });
    },
    processed({ id, type, status, attempts }) {
      append({ event: 'processed', id, type, status, attempts });
    }
  };
}
