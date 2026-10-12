import { describe, expect, it, vi } from 'vitest';
import { createLlmClient, llmTimeouts } from '../../server/llm/client.js';

function jsonResponse(value, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => value
  };
}

describe('LLM client', () => {
  it('uses only the configured OmniRoute endpoint and private combo', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({
      choices: [{ message: { content: '{"text":"local"}' } }]
    }));
    const client = createLlmClient({
      baseUrl: 'http://omniroute.test/v1/',
      model: 'private-qwen3-combo',
      apiKey: 'local-key',
      fetchImpl
    });

    const result = await client.generateJson({
      feature: 'nudge',
      systemPrompt: 'Write one short nudge.',
      userPrompt: 'Task: read. Status counts: 2 done.',
      schema: {
        type: 'object',
        properties: { text: { type: 'string' } },
        required: ['text'],
        additionalProperties: false
      }
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][0]).toBe('http://omniroute.test/v1/chat/completions');
    expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBe('Bearer local-key');
    const request = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(request.model).toBe('private-qwen3-combo');
    expect(request.response_format).toEqual({ type: 'json_object' });
    expect(request.messages.every(({ content }) => content.endsWith('/no_think'))).toBe(true);
    expect(result.value).toEqual({ text: 'local' });
  });

  it('rejects invalid JSON and schema-invalid responses', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ choices: [{ message: { content: 'not json' } }] }))
      .mockResolvedValueOnce(jsonResponse({ choices: [{ message: { content: '{"wrong":true}' } }] }));
    const client = createLlmClient({ baseUrl: 'http://local.test/v1', model: 'local-combo', fetchImpl });
    const params = {
      feature: 'review',
      systemPrompt: 'Return JSON.',
      userPrompt: 'Summarize.',
      schema: {
        type: 'object',
        properties: { commentary: { type: 'string' } },
        required: ['commentary'],
        additionalProperties: false
      }
    };

    await expect(client.generateJson(params)).rejects.toThrow('invalid JSON');
    await expect(client.generateJson(params)).rejects.toThrow('is required');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('uses a 30-second abort signal and treats timeout as failure', async () => {
    let signal;
    let timeoutCallback;
    const timers = {
      setTimeout: vi.fn((callback, delay) => {
        expect(delay).toBe(30_000);
        timeoutCallback = callback;
        return 1;
      }),
      clearTimeout: vi.fn()
    };
    const fetchImpl = vi.fn((_url, options) => {
      signal = options.signal;
      return new Promise((resolve, reject) => {
        signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
      });
    });
    const client = createLlmClient({
      baseUrl: 'http://local.test/v1',
      model: 'local-combo',
      fetchImpl,
      timers
    });

    const result = client.generateJson({
      feature: 'reflection',
      systemPrompt: 'Return JSON.',
      userPrompt: 'Private note goes in the request body only.',
      schema: { type: 'object' }
    });
    timeoutCallback();

    await expect(result).rejects.toThrow('aborted');
    expect(signal.aborted).toBe(true);
    expect(timers.clearTimeout).toHaveBeenCalledWith(1);
    expect(llmTimeouts).toEqual({ healthMs: 3_000, generationMs: 30_000 });
  });

  it('uses the 3-second timeout for health checks and disables an unconfigured model', async () => {
    const timers = {
      setTimeout: vi.fn((_callback, delay) => delay),
      clearTimeout: vi.fn()
    };
    const fetchImpl = vi.fn(async () => jsonResponse({ data: [] }));
    const client = createLlmClient({
      baseUrl: 'http://local.test/v1',
      model: 'desktop-combo',
      fetchImpl,
      timers
    });
    const unconfigured = createLlmClient({ baseUrl: 'http://local.test/v1', model: '', fetchImpl });

    expect(await client.healthCheck()).toBe(true);
    expect(fetchImpl.mock.calls[0][0]).toBe('http://local.test/v1/models');
    expect(timers.setTimeout).toHaveBeenCalledWith(expect.any(Function), 3_000);
    expect(await unconfigured.healthCheck()).toBe(false);
    await expect(unconfigured.generateJson({
      feature: 'review',
      systemPrompt: '',
      userPrompt: '',
      schema: { type: 'object' }
    })).rejects.toThrow('OMNIROUTE_PRIVATE_COMBO is not configured');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
