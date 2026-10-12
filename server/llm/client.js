const HEALTH_TIMEOUT_MS = 3_000;
const GENERATION_TIMEOUT_MS = 30_000;

export class LlmClientError extends Error {
  constructor(message, { feature = null, durationMs = 0, cause } = {}) {
    super(message, { cause });
    this.name = 'LlmClientError';
    this.feature = feature;
    this.durationMs = durationMs;
  }
}

function endpoint(baseUrl, path) {
  if (typeof baseUrl !== 'string' || !baseUrl.trim()) {
    throw new Error('OMNIROUTE_URL is not configured');
  }

  return `${baseUrl.replace(/\/+$/, '')}${path}`;
}

function validateSchema(value, schema, path = '$') {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
    throw new Error('A JSON schema is required');
  }

  const type = schema.type;
  const matchesType = {
    object: () => value !== null && typeof value === 'object' && !Array.isArray(value),
    array: () => Array.isArray(value),
    string: () => typeof value === 'string',
    number: () => typeof value === 'number' && Number.isFinite(value),
    integer: () => Number.isInteger(value),
    boolean: () => typeof value === 'boolean',
    null: () => value === null
  }[type];

  if (!matchesType || !matchesType()) {
    throw new Error(`${path} must be ${type || 'a supported JSON type'}`);
  }

  if (schema.enum && !schema.enum.some((item) => Object.is(item, value))) {
    throw new Error(`${path} must match one of the allowed values`);
  }

  if (type === 'object') {
    for (const key of schema.required || []) {
      if (!Object.hasOwn(value, key)) {
        throw new Error(`${path}.${key} is required`);
      }
    }

    for (const [key, propertySchema] of Object.entries(schema.properties || {})) {
      if (Object.hasOwn(value, key)) {
        validateSchema(value[key], propertySchema, `${path}.${key}`);
      }
    }

    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!Object.hasOwn(schema.properties || {}, key)) {
          throw new Error(`${path}.${key} is not allowed`);
        }
      }
    }
  }

  if (type === 'array' && schema.items) {
    value.forEach((item, index) => validateSchema(item, schema.items, `${path}[${index}]`));
  }
}

function requestHeaders(apiKey) {
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }
  return headers;
}

async function fetchWithTimeout(fetchImpl, url, options, timeoutMs, timers) {
  const controller = new AbortController();
  const timeout = timers.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...options, signal: controller.signal });
  } finally {
    timers.clearTimeout(timeout);
  }
}

export function createLlmClient({
  baseUrl = process.env.OMNIROUTE_URL,
  model = process.env.OMNIROUTE_PRIVATE_COMBO,
  apiKey = process.env.OMNIROUTE_KEY || '',
  fetchImpl = globalThis.fetch,
  now = Date.now,
  timers = { setTimeout, clearTimeout }
} = {}) {
  const privateModel = typeof model === 'string' ? model.trim() : '';
  const configured = Boolean(privateModel);

  async function healthCheck() {
    if (!configured) {
      return false;
    }

    try {
      const response = await fetchWithTimeout(
        fetchImpl,
        endpoint(baseUrl, '/models'),
        { method: 'GET', headers: requestHeaders(apiKey) },
        HEALTH_TIMEOUT_MS,
        timers
      );
      return response.ok;
    } catch {
      return false;
    }
  }

  async function generateJson({ feature, systemPrompt, userPrompt, schema }) {
    if (!configured) {
      throw new LlmClientError('OMNIROUTE_PRIVATE_COMBO is not configured', { feature });
    }

    const startedAt = now();
    const isQwen3 = /qwen3/i.test(privateModel);
    const suffix = isQwen3 ? '\n/no_think' : '';
    const messages = [
      { role: 'system', content: `${systemPrompt}${suffix}` },
      { role: 'user', content: `${userPrompt}${suffix}` }
    ];

    try {
      const response = await fetchWithTimeout(
        fetchImpl,
        endpoint(baseUrl, '/chat/completions'),
        {
          method: 'POST',
          headers: requestHeaders(apiKey),
          body: JSON.stringify({
            model: privateModel,
            messages,
            response_format: { type: 'json_object' }
          })
        },
        GENERATION_TIMEOUT_MS,
        timers
      );

      if (!response.ok) {
        throw new Error(`OmniRoute returned HTTP ${response.status}`);
      }

      const completion = await response.json();
      const content = completion?.choices?.[0]?.message?.content;
      if (typeof content !== 'string') {
        throw new Error('OmniRoute response did not contain JSON message content');
      }

      let value;
      try {
        value = JSON.parse(content);
      } catch (cause) {
        throw new Error('OmniRoute returned invalid JSON', { cause });
      }

      validateSchema(value, schema);
      return { value, durationMs: Math.max(0, now() - startedAt) };
    } catch (cause) {
      const error = new LlmClientError(cause.message || 'OmniRoute request failed', {
        feature,
        durationMs: Math.max(0, now() - startedAt),
        cause
      });
      throw error;
    }
  }

  return {
    configured,
    healthCheck,
    generateJson
  };
}

export const llmTimeouts = Object.freeze({
  healthMs: HEALTH_TIMEOUT_MS,
  generationMs: GENERATION_TIMEOUT_MS
});
