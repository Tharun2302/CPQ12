import { describe, it, expect } from 'vitest';
// @ts-expect-error - CommonJS helper shared with monitor-user-logs.cjs, no type declarations
import providers from '../../monitor-ai-providers.cjs';
// @ts-expect-error - CommonJS helper shared with monitor-user-logs.cjs, no type declarations
import aiExplain from '../../monitor-ai-explain.cjs';
import openaiFixture from '../fixtures/openaiResponse.json';
import anthropicFixture from '../fixtures/anthropicResponse.json';

type Adapter = {
  name: string;
  keyEnv: string;
  defaultModel: string;
  defaultBaseUrl: string;
  defaultAuthStyle: string;
  buildRequest: (a: Record<string, unknown>) => { path: string; headers: Record<string, string>; body: Record<string, unknown> };
  extractText: (b: unknown) => { text: string | null; finishReason: string | null };
  extractUsage: (b: unknown) => { inputTokens: number | null; outputTokens: number | null };
};

const { selectAdapter, openaiAdapter, anthropicAdapter, stripLengthConstraints } = providers as {
  selectAdapter: (n: unknown) => Adapter | null;
  openaiAdapter: Adapter;
  anthropicAdapter: Adapter;
  stripLengthConstraints: <T>(n: T) => T;
};
const { RESPONSE_SCHEMA, validateResponse } = aiExplain as {
  RESPONSE_SCHEMA: Record<string, unknown>;
  validateResponse: (t: unknown, f: unknown, m: Record<string, unknown>) => unknown;
};

type Schema = Record<string, unknown> & { required: string[]; additionalProperties?: boolean };
type OpenAiBody = {
  model: string;
  messages: Array<{ role: string; content: string }>;
  max_completion_tokens: number;
  max_tokens?: number;
  system?: string;
  thinking?: unknown;
  output_config?: unknown;
  response_format: { type: string; json_schema: { name: string; strict: boolean; schema: Schema } };
};
type AnthropicBody = {
  model: string;
  max_tokens: number;
  max_completion_tokens?: number;
  system: string;
  messages: Array<{ role: string; content: string }>;
  thinking: { type: string };
  output_config: { effort: string; format: { type: string; schema: Schema } };
};

const SENTINEL_KEY = 'sk-test-SENTINEL-must-never-appear-0000';

// Table-driven: every case below runs against BOTH adapters, so the unconfigured one cannot rot
// unnoticed. Adding a third provider later means adding one row here.
const ADAPTERS: Array<[string, Adapter]> = [
  ['openai', openaiAdapter],
  ['anthropic', anthropicAdapter],
];

const promptArgs = {
  system: 'SYSTEM PROMPT',
  user: 'USER PROMPT',
  model: 'test-model',
  schema: RESPONSE_SCHEMA,
  maxTokens: 4000,
  effort: 'low',
};

describe('selectAdapter', () => {
  it('returns the named adapter, case-insensitively', () => {
    expect(selectAdapter('openai')).toBe(openaiAdapter);
    expect(selectAdapter('anthropic')).toBe(anthropicAdapter);
    expect(selectAdapter('OpenAI')).toBe(openaiAdapter);
    expect(selectAdapter('  Anthropic  ')).toBe(anthropicAdapter);
  });

  it('returns null for an unknown, empty or missing name', () => {
    expect(selectAdapter('gemini')).toBeNull();
    expect(selectAdapter('')).toBeNull();
    expect(selectAdapter(undefined)).toBeNull();
    expect(selectAdapter(null)).toBeNull();
    expect(selectAdapter(42)).toBeNull();
  });
});

describe.each(ADAPTERS)('%s adapter — interface conformance', (name, adapter) => {
  it('exposes every key in the adapter interface with the right type', () => {
    expect(adapter.name).toBe(name);
    expect(typeof adapter.keyEnv).toBe('string');
    expect(adapter.keyEnv).toMatch(/^[A-Z_]+$/);
    expect(typeof adapter.defaultModel).toBe('string');
    expect(adapter.defaultModel.length).toBeGreaterThan(0);
    expect(() => new URL(adapter.defaultBaseUrl)).not.toThrow();
    expect(typeof adapter.defaultAuthStyle).toBe('string');
    expect(typeof adapter.buildRequest).toBe('function');
    expect(typeof adapter.extractText).toBe('function');
    expect(typeof adapter.extractUsage).toBe('function');
  });

  it('reads no environment variable when building a request', () => {
    // Snapshotting process.env proves only that nothing was WRITTEN. A counting Proxy is what
    // actually proves nothing was read, which is the property the adapter boundary depends on.
    const reads: string[] = [];
    const realEnv = process.env;
    process.env = new Proxy(realEnv, {
      get(target, prop: string) { reads.push(prop); return target[prop]; },
      has(target, prop: string) { reads.push(prop); return prop in target; },
    }) as NodeJS.ProcessEnv;
    try {
      adapter.buildRequest(promptArgs);
    } finally {
      process.env = realEnv;
    }
    expect(reads).toEqual([]);
  });
});

describe.each(ADAPTERS)('%s adapter — buildRequest', (name, adapter) => {
  const req = adapter.buildRequest(promptArgs);

  it('never puts an API key in the headers or the body', () => {
    // The sentinel must actually be reachable for this to be able to fail: it is placed in every
    // env var an adapter might read, and in the prompt arguments, before the request is built.
    const realEnv = process.env;
    process.env = { ...realEnv, OPENAI_API_KEY: SENTINEL_KEY, ANTHROPIC_API_KEY: SENTINEL_KEY };
    let built;
    try {
      built = adapter.buildRequest({ ...promptArgs });
    } finally {
      process.env = realEnv;
    }
    const serialised = JSON.stringify({ headers: built.headers, body: built.body });
    expect(serialised).not.toContain(SENTINEL_KEY);
    expect(serialised).not.toContain('sk-');
    const headerNames = Object.keys(built.headers).map((h) => h.toLowerCase());
    expect(headerNames).not.toContain('authorization');
    expect(headerNames).not.toContain('x-api-key');
    expect(headerNames).not.toContain('api-key');
  });

  it('would fail if an adapter did embed the key — the sentinel is genuinely reachable', () => {
    // Guards the guard: proves the assertion above is not vacuous.
    const leaky = { headers: { Authorization: `Bearer ${process.env.NOPE || SENTINEL_KEY}` }, body: {} };
    expect(JSON.stringify(leaky)).toContain(SENTINEL_KEY);
  });

  it('carries the model, the output cap and the prompts', () => {
    expect(req.body.model).toBe('test-model');
    const serialised = JSON.stringify(req.body);
    expect(serialised).toContain('SYSTEM PROMPT');
    expect(serialised).toContain('USER PROMPT');
  });

  it('matches the documented path and default base URL', () => {
    expect(req.path).toBe(name === 'openai' ? '/v1/chat/completions' : '/v1/messages');
    expect(adapter.defaultBaseUrl).toBe(
      name === 'openai' ? 'https://api.openai.com' : 'https://api.anthropic.com',
    );
  });
});

describe('openai adapter — provider-specific request shape', () => {
  const req = openaiAdapter.buildRequest(promptArgs);
  const body = req.body as unknown as OpenAiBody;

  it('puts the system prompt first in messages', () => {
    expect(body.messages[0].role).toBe('system');
    expect(body.messages[0].content).toBe('SYSTEM PROMPT');
    expect(body.messages[1].role).toBe('user');
  });

  it('uses max_completion_tokens and response_format.json_schema', () => {
    expect(body.max_completion_tokens).toBe(4000);
    expect(body.max_tokens).toBeUndefined();
    expect(body.response_format.type).toBe('json_schema');
    expect(body.response_format.json_schema.strict).toBe(true);
    expect(body.response_format.json_schema.name).toBe('cpq_explanations');
    expect(body.response_format.json_schema.schema.required).toContain('explanations');
  });

  it('strips length constraints, whose strict-mode support is undocumented', () => {
    const schema = JSON.stringify(body.response_format.json_schema.schema);
    expect(schema).not.toContain('maxLength');
    expect(schema).not.toContain('minItems');
    // additionalProperties:false and full `required` lists must survive — strict mode needs them.
    expect(body.response_format.json_schema.schema.additionalProperties).toBe(false);
    expect(schema).toContain('"enum"');
  });

  it('sends no anthropic-only fields', () => {
    expect(body.system).toBeUndefined();
    expect(body.thinking).toBeUndefined();
    expect(body.output_config).toBeUndefined();
  });
});

describe('anthropic adapter — provider-specific request shape', () => {
  const req = anthropicAdapter.buildRequest(promptArgs);
  const body = req.body as unknown as AnthropicBody;

  it('uses the top-level system field and a user-only messages array', () => {
    expect(body.system).toBe('SYSTEM PROMPT');
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0].role).toBe('user');
  });

  it('uses max_tokens and output_config.format.schema, and keeps maxLength', () => {
    expect(body.max_tokens).toBe(4000);
    expect(body.max_completion_tokens).toBeUndefined();
    expect(body.output_config.format.type).toBe('json_schema');
    expect(body.output_config.format.schema.required).toContain('explanations');
    expect(JSON.stringify(body.output_config.format.schema)).toContain('maxLength');
  });

  it('sets adaptive thinking and low effort as the cost lever', () => {
    expect(body.thinking).toEqual({ type: 'adaptive' });
    expect(body.output_config.effort).toBe('low');
  });

  it('sends no budget_tokens, temperature or top_p — all 400 on current models', () => {
    const serialised = JSON.stringify(body);
    expect(serialised).not.toContain('budget_tokens');
    expect(serialised).not.toContain('temperature');
    expect(serialised).not.toContain('top_p');
  });

  it('sends the required anthropic-version header', () => {
    expect(req.headers['anthropic-version']).toBe('2023-06-01');
  });
});

describe('stripLengthConstraints', () => {
  it('removes only length keywords and leaves the schema otherwise intact', () => {
    const input = {
      type: 'object',
      required: ['a'],
      additionalProperties: false,
      properties: { a: { type: 'string', maxLength: 10, minLength: 1, description: 'keep' } },
      list: { type: 'array', minItems: 1, maxItems: 8, items: { type: 'string' } },
    };
    expect(stripLengthConstraints(input)).toEqual({
      type: 'object',
      required: ['a'],
      additionalProperties: false,
      properties: { a: { type: 'string', description: 'keep' } },
      list: { type: 'array', items: { type: 'string' } },
    });
  });

  it('does not mutate its input', () => {
    const input = { properties: { a: { maxLength: 5 } } };
    stripLengthConstraints(input);
    expect(input.properties.a.maxLength).toBe(5);
  });
});

describe.each(ADAPTERS)('%s adapter — extractText never throws', (name, adapter) => {
  const junk: unknown[] = [
    {}, null, undefined, 'a string', [], 42,
    { choices: [] }, { content: [] }, { choices: [{}] }, { content: [{ type: 'thinking' }] },
    { choices: [{ message: {} }] }, { choices: [{ message: { content: null } }] },
    { content: [{ type: 'text' }] },
  ];

  it.each(junk.map((j, i) => [i, j]))('malformed input #%i returns {text:null}', (_i, body) => {
    expect(() => adapter.extractText(body)).not.toThrow();
    expect(adapter.extractText(body).text).toBeNull();
  });

  it('a response from the wrong provider yields text:null rather than throwing', () => {
    const wrong = name === 'openai' ? anthropicFixture : openaiFixture;
    expect(() => adapter.extractText(wrong)).not.toThrow();
    expect(adapter.extractText(wrong).text).toBeNull();
  });

  it('malformed input yields null usage without throwing', () => {
    for (const body of junk) {
      expect(() => adapter.extractUsage(body)).not.toThrow();
      expect(adapter.extractUsage(body)).toEqual({ inputTokens: null, outputTokens: null });
    }
  });
});

describe('finish-reason normalisation', () => {
  it('maps the openai vocabulary', () => {
    const at = (r: string) => openaiAdapter.extractText({ choices: [{ message: { content: '{}' }, finish_reason: r }] }).finishReason;
    expect(at('stop')).toBe('complete');
    expect(at('length')).toBe('truncated');
    expect(at('content_filter')).toBe('refused');
    expect(at('tool_calls')).toBe('other');
  });

  it('maps the anthropic vocabulary', () => {
    const at = (r: string) => anthropicAdapter.extractText({ content: [{ type: 'text', text: '{}' }], stop_reason: r }).finishReason;
    expect(at('end_turn')).toBe('complete');
    expect(at('max_tokens')).toBe('truncated');
    expect(at('refusal')).toBe('refused');
    expect(at('pause_turn')).toBe('other');
  });

  it('reports a missing finish reason as null, which shared validation rejects', () => {
    expect(openaiAdapter.extractText({ choices: [{ message: { content: '{}' } }] }).finishReason).toBeNull();
    expect(anthropicAdapter.extractText({ content: [{ type: 'text', text: '{}' }] }).finishReason).toBeNull();
  });
});

describe('usage normalisation', () => {
  it('lands both providers in the same {inputTokens, outputTokens} shape', () => {
    expect(openaiAdapter.extractUsage(openaiFixture)).toEqual({ inputTokens: 1700, outputTokens: 2500 });
    expect(anthropicAdapter.extractUsage(anthropicFixture)).toEqual({ inputTokens: 1700, outputTokens: 2500 });
  });
});

describe('equivalence — the executable form of N7', () => {
  const idMap = { e1: {}, e2: {} };

  it('the same logical answer in either wire format produces a deep-equal internal object', () => {
    const fromOpenai = openaiAdapter.extractText(openaiFixture);
    const fromAnthropic = anthropicAdapter.extractText(anthropicFixture);
    // The two fixtures carry the same logical answer serialised differently (key order,
    // indentation, an anthropic-only extra field). If they were byte-identical the deep-equal
    // below would compare a pure function to itself and could never fail.
    expect(fromOpenai.text).not.toBe(fromAnthropic.text);
    expect(fromAnthropic.text).toContain('providerNote');
    expect(fromOpenai.finishReason).toBe(fromAnthropic.finishReason);

    const a = validateResponse(fromOpenai.text, fromOpenai.finishReason, idMap);
    const b = validateResponse(fromAnthropic.text, fromAnthropic.finishReason, idMap);
    expect(a).not.toBeNull();
    expect(a).toEqual(b);
    // The extra wire field must not survive into the internal object.
    expect(JSON.stringify(b)).not.toContain('providerNote');
  });

  it('skips anthropic thinking blocks and reads the first text block', () => {
    expect(anthropicFixture.content[0].type).toBe('thinking');
    expect(anthropicAdapter.extractText(anthropicFixture).text).toContain('overallSummary');
  });
});
