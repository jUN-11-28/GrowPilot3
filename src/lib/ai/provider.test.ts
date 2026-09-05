import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { ThinkingLevel } from "@google/genai";
import { normalizeNullableAnyOf, resolveThinkingConfig, toResponseSchema, tryParse } from "./provider";

// --- thinking config: model-family aware, not a name-prefix guess ----------
// https://ai.google.dev/gemini-api/docs/generate-content/thinking (fetched
// 2026-09-05) — see provider.ts's comment for the full citation.

test("resolveThinkingConfig maps every effort level to thinkingLevel (not thinkingBudget) for the shipped Gemini-3 model", () => {
  for (const effort of ["none", "low", "medium", "high"] as const) {
    const config = resolveThinkingConfig("gemini-3.8-flash", effort);
    assert.ok(config && "thinkingLevel" in config, `effort=${effort} should resolve to thinkingLevel`);
  }
});

// gemini-3.8-flash rejects MINIMAL outright ("Thinking level MINIMAL is not
// supported for this model", 400 INVALID_ARGUMENT), so "none" resolves to the
// lowest level it actually accepts. Every `effort: "none"` call — the whole
// question-generation step — 400'd until this mapping changed.
test('resolveThinkingConfig maps "none" to LOW (the lowest level this model accepts), never to a Gemini-2.5-style disabled budget', () => {
  const config = resolveThinkingConfig("gemini-3.8-flash", "none");
  assert.deepEqual(config, { thinkingLevel: ThinkingLevel.LOW });
});

test("resolveThinkingConfig never emits MINIMAL for the shipped model at any effort level", () => {
  for (const effort of ["none", "low", "medium", "high"] as const) {
    const config = resolveThinkingConfig("gemini-3.8-flash", effort);
    assert.notDeepEqual(config, { thinkingLevel: ThinkingLevel.MINIMAL });
  }
});

test("resolveThinkingConfig uses thinkingBudget for a known Gemini-2.5 model instead", () => {
  const config = resolveThinkingConfig("gemini-2.5-flash", "none");
  assert.ok(config && "thinkingBudget" in config);
  assert.equal((config as { thinkingBudget: number }).thinkingBudget, 0);
});

test("resolveThinkingConfig omits the config for a model that cannot disable thinking, rather than sending a no-op value", () => {
  const config = resolveThinkingConfig("gemini-2.5-pro", "none");
  assert.equal(config, undefined);
});

test("resolveThinkingConfig does NOT guess from a name prefix for an unrecognised model — it degrades to no config", () => {
  // "gemini-3.9-ultra" looks like a Gemini-3 model by name, but is not in the
  // verified table; the spec explicitly forbids assuming API support from
  // the name alone.
  const config = resolveThinkingConfig("gemini-3.9-ultra", "low");
  assert.equal(config, undefined);
});

// --- nullable JSON Schema normalization -------------------------------------
// https://ai.google.dev/gemini-api/docs/generate-content/structured-output
// (fetched 2026-09-05): nullable fields are documented as {"type": [X, "null"]}.

test("normalizeNullableAnyOf converts a simple nullable-string anyOf into the documented type-array form", () => {
  const input = { anyOf: [{ type: "string" }, { type: "null" }] };
  assert.deepEqual(normalizeNullableAnyOf(input), { type: ["string", "null"] });
});

test("normalizeNullableAnyOf preserves sibling keywords (enum) on the non-null branch", () => {
  const input = { anyOf: [{ type: "string", enum: ["a", "b"] }, { type: "null" }] };
  assert.deepEqual(normalizeNullableAnyOf(input), { type: ["string", "null"], enum: ["a", "b"] });
});

test("normalizeNullableAnyOf works with the null branch listed first", () => {
  const input = { anyOf: [{ type: "null" }, { type: "number", minimum: 0 }] };
  assert.deepEqual(normalizeNullableAnyOf(input), { type: ["number", "null"], minimum: 0 });
});

test("normalizeNullableAnyOf recurses into nested object properties and array items", () => {
  const input = {
    type: "object",
    properties: {
      x: { anyOf: [{ type: "string" }, { type: "null" }] },
    },
    items: { anyOf: [{ type: "boolean" }, { type: "null" }] },
  };
  const result = normalizeNullableAnyOf(input) as Record<string, unknown>;
  assert.deepEqual((result.properties as Record<string, unknown>).x, { type: ["string", "null"] });
  assert.deepEqual(result.items, { type: ["boolean", "null"] });
});

test("normalizeNullableAnyOf leaves a genuine multi-branch anyOf untouched (Gemini documents anyOf as supported for real unions)", () => {
  const input = { anyOf: [{ type: "string" }, { type: "number" }, { type: "boolean" }] };
  assert.deepEqual(normalizeNullableAnyOf(input), input);
});

test("toResponseSchema strips $schema and applies the nullable normalization end to end", () => {
  const schema = z.object({ maybe: z.string().nullable() });
  const result = toResponseSchema(schema) as Record<string, unknown>;
  assert.equal("$schema" in result, false);
  assert.deepEqual((result.properties as Record<string, unknown>).maybe, { type: ["string", "null"] });
});

// --- maxItems must never reach the API -------------------------------------
// Gemini unrolls bounded arrays into its decoding grammar; a schema whose
// maxItems values add up past its budget is rejected as a bare
// 400 INVALID_ARGUMENT before a token is generated. See toResponseSchema.

function findKeyDeep(node: unknown, key: string): boolean {
  if (Array.isArray(node)) return node.some((n) => findKeyDeep(n, key));
  if (node === null || typeof node !== "object") return false;
  return Object.entries(node as Record<string, unknown>).some(
    ([k, v]) => k === key || findKeyDeep(v, key),
  );
}

test("toResponseSchema removes every maxItems, however deeply nested", () => {
  const schema = z.object({
    outer: z
      .array(
        z.object({
          inner: z.array(z.object({ deep: z.array(z.string()).max(9) })).max(5),
        }),
      )
      .max(30),
  });
  assert.equal(findKeyDeep(z.toJSONSchema(schema), "maxItems"), true, "zod emits maxItems");
  assert.equal(findKeyDeep(toResponseSchema(schema), "maxItems"), false, "but it never reaches the API");
});

test("toResponseSchema keeps minItems — a lower bound costs nothing and is what stops empty arrays", () => {
  const schema = z.object({ method: z.array(z.string()).min(1).max(8) });
  assert.equal(findKeyDeep(toResponseSchema(schema), "minItems"), true);
});

test("the Zod schema still enforces the cap when parsing a response, even though the model was never told it", () => {
  const schema = z.object({ tags: z.array(z.string()).max(2) });
  assert.equal(findKeyDeep(toResponseSchema(schema), "maxItems"), false);
  assert.equal(tryParse(schema, JSON.stringify({ tags: ["a", "b", "c"] })).ok, false);
  assert.equal(tryParse(schema, JSON.stringify({ tags: ["a", "b"] })).ok, true);
});

// --- failure classification: JSON parse vs Zod validation -------------------

test("tryParse reports json_parse for text that isn't valid JSON", () => {
  const result = tryParse(z.object({ a: z.string() }), "{not json");
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "json_parse");
});

test("tryParse reports schema_validation for valid JSON that doesn't match the schema", () => {
  const result = tryParse(z.object({ a: z.string() }), JSON.stringify({ a: 123 }));
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "schema_validation");
});

test("tryParse succeeds for valid JSON matching the schema", () => {
  const result = tryParse(z.object({ a: z.string() }), JSON.stringify({ a: "x" }));
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.value.a, "x");
});
