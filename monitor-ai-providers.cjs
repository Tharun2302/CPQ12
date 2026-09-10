'use strict';

// The ONLY file that knows an OpenAI request differs from an Anthropic one. Everything else in
// the AI explanation layer is provider-agnostic, so keeping this module tiny and pure (no https,
// no process.env, no API key access) is what stops the unused adapter rotting unnoticed.

const VALID_PROVIDERS = ['openai', 'anthropic'];
const SCHEMA_NAME = 'cpq_explanations';

/**
 * Deep copy of a JSON Schema with string/array length constraints removed.
 * OpenAI's `strict: true` support for `maxLength` is undocumented, and a rejected keyword is a
 * 400 that costs us the whole explanation. Shared validation re-applies the limits by truncating,
 * so the internal object is identical whether or not the constraint was sent.
 * @param {*} node any JSON Schema fragment
 * @returns {*} the fragment without maxLength/minLength/minItems/maxItems
 */
function stripLengthConstraints(node) {
  if (Array.isArray(node)) return node.map(stripLengthConstraints);
  if (!node || typeof node !== 'object') return node;
  const out = {};
  for (const key of Object.keys(node)) {
    if (key === 'maxLength' || key === 'minLength' || key === 'minItems' || key === 'maxItems') continue;
    out[key] = stripLengthConstraints(node[key]);
  }
  return out;
}

function firstString(value) {
  return typeof value === 'string' && value.length ? value : null;
}

function normaliseFinish(raw, map) {
  if (typeof raw !== 'string' || !raw.length) return null;
  return Object.prototype.hasOwnProperty.call(map, raw) ? map[raw] : 'other';
}

function normaliseUsage(usage, inKey, outKey) {
  const source = usage && typeof usage === 'object' ? usage : {};
  const inputTokens = typeof source[inKey] === 'number' ? source[inKey] : null;
  const outputTokens = typeof source[outKey] === 'number' ? source[outKey] : null;
  return { inputTokens, outputTokens };
}

const OPENAI_FINISH = { stop: 'complete', length: 'truncated', content_filter: 'refused' };
const ANTHROPIC_FINISH = { end_turn: 'complete', max_tokens: 'truncated', refusal: 'refused' };

const openaiAdapter = {
  name: 'openai',
  keyEnv: 'OPENAI_API_KEY',
  defaultModel: 'gpt-5.6-terra',
  defaultBaseUrl: 'https://api.openai.com',
  defaultAuthStyle: 'bearer',
  defaultPath: '/v1/chat/completions',

  /**
   * @returns {{path: string, headers: object, body: object}} headers deliberately EXCLUDE the key
   */
  buildRequest({ system, user, model, schema, maxTokens }) {
    return {
      path: '/v1/chat/completions',
      headers: { 'Content-Type': 'application/json' },
      body: {
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        max_completion_tokens: maxTokens,
        response_format: {
          type: 'json_schema',
          json_schema: { name: SCHEMA_NAME, strict: true, schema: stripLengthConstraints(schema) },
        },
      },
    };
  },

  extractText(body) {
    const empty = { text: null, finishReason: null };
    if (!body || typeof body !== 'object' || Array.isArray(body)) return empty;
    const choice = Array.isArray(body.choices) ? body.choices[0] : null;
    if (!choice || typeof choice !== 'object') return empty;
    const message = choice.message && typeof choice.message === 'object' ? choice.message : {};
    return { text: firstString(message.content), finishReason: normaliseFinish(choice.finish_reason, OPENAI_FINISH) };
  },

  extractUsage(body) {
    if (!body || typeof body !== 'object') return { inputTokens: null, outputTokens: null };
    return normaliseUsage(body.usage, 'prompt_tokens', 'completion_tokens');
  },
};

const anthropicAdapter = {
  name: 'anthropic',
  keyEnv: 'ANTHROPIC_API_KEY',
  defaultModel: 'claude-opus-5',
  defaultBaseUrl: 'https://api.anthropic.com',
  defaultAuthStyle: 'x-api-key',
  defaultPath: '/v1/messages',

  buildRequest({ system, user, model, schema, maxTokens, effort }) {
    return {
      path: '/v1/messages',
      // budget_tokens, temperature and top_p all return 400 on current models — do not add them.
      headers: { 'Content-Type': 'application/json', 'anthropic-version': '2023-06-01' },
      body: {
        model,
        max_tokens: maxTokens,
        system,
        messages: [{ role: 'user', content: user }],
        thinking: { type: 'adaptive' },
        output_config: { effort, format: { type: 'json_schema', schema } },
      },
    };
  },

  extractText(body) {
    const empty = { text: null, finishReason: null };
    if (!body || typeof body !== 'object' || Array.isArray(body)) return empty;
    if (!Array.isArray(body.content)) return empty;
    const block = body.content.find((b) => b && typeof b === 'object' && b.type === 'text');
    return {
      text: block ? firstString(block.text) : null,
      finishReason: normaliseFinish(body.stop_reason, ANTHROPIC_FINISH),
    };
  },

  extractUsage(body) {
    if (!body || typeof body !== 'object') return { inputTokens: null, outputTokens: null };
    return normaliseUsage(body.usage, 'input_tokens', 'output_tokens');
  },
};

/**
 * @param {string} name value of AI_PROVIDER
 * @returns {object|null} the adapter, or null for an unknown or empty name
 */
function selectAdapter(name) {
  const key = typeof name === 'string' ? name.trim().toLowerCase() : '';
  if (key === 'openai') return openaiAdapter;
  if (key === 'anthropic') return anthropicAdapter;
  return null;
}

module.exports = { selectAdapter, openaiAdapter, anthropicAdapter, stripLengthConstraints, VALID_PROVIDERS };
