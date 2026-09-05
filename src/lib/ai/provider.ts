import "server-only";

import { GoogleGenAI, FinishReason, ThinkingLevel } from "@google/genai";
import { z } from "zod";
import { geminiApiKey, geminiModel } from "@/lib/env";
import { mockProvider } from "@/lib/ai/mock-provider";

/**
 * Identifies which agent step a request belongs to (used for logging + mocks).
 * `question` is shared by v1 and v2 (the schema is unchanged — see
 * schemas-v2.ts). The other v2 steps get their own kind because their
 * schemas differ from v1's and a mock fixture must never be parsed against
 * the wrong shape.
 */
export type AgentKind =
  | "question"
  | "evidence"
  | "stage"
  | "bottleneck"
  | "red_team"
  | "synthesis"
  | "resource"
  | "evidence_v2"
  | "stage_v2"
  | "bottleneck_v2"
  | "red_team_v2"
  | "synthesis_v2"
  | "resource_v2"
  | "evidence_record_v2";

/** "none" asks for the fastest available thinking setting — see `resolveThinkingConfig`. */
export type Effort = "none" | "low" | "medium" | "high";

/** A file read inline by the model — base64 data, not a stored reference. */
export interface InlineFile {
  mimeType: string;
  base64: string;
}

export interface StructuredRequest<T> {
  kind: AgentKind;
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  maxTokens?: number;
  effort?: Effort;
  /** Uploaded attachments (business plan, financials, photos, …) to read alongside the prompt. */
  files?: InlineFile[];
}

/**
 * The only surface the diagnosis engine knows about. Swapping providers means
 * writing one more implementation of this interface — nothing above it changes.
 */
export interface AIProvider {
  readonly name: string;
  generateStructured<T>(request: StructuredRequest<T>): Promise<T>;
}

export class AIProviderError extends Error {
  constructor(
    message: string,
    readonly kind: AgentKind,
    readonly code: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "AIProviderError";
  }
}

// ---------------------------------------------------------------------------
// Thinking config
//
// https://ai.google.dev/gemini-api/docs/generate-content/thinking (fetched
// 2026-09-05): `thinkingLevel` is the Gemini 3 API; `thinkingBudget` is the
// Gemini 2.5 API. They are not interchangeable — 2.5 Pro cannot disable
// thinking at all (thinkingBudget: 0 is silently ignored), and Gemini 3
// models don't expose thinkingBudget the same way. Mapping "none" effort to
// `{ thinkingBudget: 0 }` unconditionally (the old behavior) is exactly the
// bug the spec warned about: it is meaningless — not merely suboptimal — for
// any model outside the 2.5 family.
//
// Only models actually verified against that page are listed here. An
// unrecognised GEMINI_MODEL does NOT fall back to a name-prefix guess (a
// "gemini-3.x" name is not proof of Gemini-3 API support); it omits
// thinkingConfig entirely and logs a warning. That is the documented-safe
// default the spec asks for: a missed latency optimization, never a
// malformed or silently-ignored request.
// ---------------------------------------------------------------------------

type ThinkingConfigValue = { thinkingLevel: ThinkingLevel } | { thinkingBudget: number } | undefined;

interface ModelThinkingProfile {
  resolve: (effort: Effort) => ThinkingConfigValue;
}

/**
 * `none` maps to LOW, not MINIMAL: gemini-3.8-flash rejects MINIMAL outright
 * ("Thinking level MINIMAL is not supported for this model", 400
 * INVALID_ARGUMENT), and LOW is the lowest level it actually accepts. That
 * rejection hit every `effort: "none"` call — which is the whole question
 * -generation step (see diagnosis/service.ts), i.e. the first model call of
 * every diagnosis. A model that does support MINIMAL can be given its own
 * entry in KNOWN_MODEL_THINKING rather than changing this mapping.
 */
const GEMINI_3_LEVEL_BY_EFFORT: Record<Effort, ThinkingLevel> = {
  none: ThinkingLevel.LOW,
  low: ThinkingLevel.LOW,
  medium: ThinkingLevel.MEDIUM,
  high: ThinkingLevel.HIGH,
};

/** Token budgets for the 2.5 family, per the fetched doc's "safe low-effort" guidance (1024 for low-effort). */
const GEMINI_25_FLASH_BUDGET_BY_EFFORT: Record<Effort, number> = {
  none: 0,
  low: 1024,
  medium: 4096,
  high: 16384,
};

const KNOWN_MODEL_THINKING: Record<string, ModelThinkingProfile> = {
  // Gemini 3 family — thinkingLevel only. Every model this app has actually
  // shipped with is in this family.
  "gemini-3.8-flash": { resolve: (effort) => ({ thinkingLevel: GEMINI_3_LEVEL_BY_EFFORT[effort] }) },
  // 2.5 Flash / 2.5 Flash Preview support disabling thinking via budget 0.
  "gemini-2.5-flash": { resolve: (effort) => ({ thinkingBudget: GEMINI_25_FLASH_BUDGET_BY_EFFORT[effort] }) },
  // 2.5 Pro cannot disable thinking at all; sending a budget has no
  // documented effect either way, so the config is omitted rather than
  // sending a value that looks meaningful but isn't.
  "gemini-2.5-pro": { resolve: () => undefined },
};

export function resolveThinkingConfig(model: string, effort: Effort): ThinkingConfigValue {
  const profile = KNOWN_MODEL_THINKING[model];
  if (profile) return profile.resolve(effort);

  console.warn(
    `[gemini] unknown model "${model}" — thinking config left unset rather than guessed from the name. ` +
      `Add it to KNOWN_MODEL_THINKING in provider.ts once its thinking API is confirmed.`,
  );
  return undefined;
}

// ---------------------------------------------------------------------------
// JSON Schema for Gemini's `responseJsonSchema`
//
// https://ai.google.dev/gemini-api/docs/generate-content/structured-output
// (fetched 2026-09-05): the supported keyword set does not include `$schema`.
// It explicitly documents nullable fields as `{"type": ["string", "null"]}`
// — a type array — even though the page separately shows `anyOf` is
// supported for genuine multi-shape unions. Zod's default 2020-12 output
// represents every `.nullable()` as `anyOf: [<branch>, {type:"null"}]`, which
// is not wrong per that support statement, but doesn't match the documented
// form for this specific (extremely common, in these schemas) case. This
// normalizes the common "one non-null branch + null" shape into the
// documented type-array form; a genuine multi-branch anyOf (none exist in
// this codebase's schemas today) is left untouched.
// ---------------------------------------------------------------------------

export function normalizeNullableAnyOf(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(normalizeNullableAnyOf);
  if (node === null || typeof node !== "object") return node;

  const obj = node as Record<string, unknown>;
  const anyOf = obj.anyOf;

  if (Array.isArray(anyOf) && anyOf.length === 2) {
    const [a, b] = anyOf as Record<string, unknown>[];
    const nullBranch = a?.type === "null" ? a : b?.type === "null" ? b : null;
    const otherBranch = nullBranch === a ? b : a;
    const otherIsSimple =
      nullBranch &&
      otherBranch &&
      typeof otherBranch === "object" &&
      "type" in otherBranch &&
      typeof otherBranch.type !== "undefined" &&
      Object.keys(nullBranch).length === 1; // the null branch carries nothing but {type:"null"}

    if (otherIsSimple) {
      const { anyOf: _drop, ...rest } = obj;
      void _drop;
      const merged = normalizeNullableAnyOf(otherBranch) as Record<string, unknown>;
      const existingType = merged.type;
      return {
        ...rest,
        ...merged,
        type: Array.isArray(existingType) ? [...existingType, "null"] : [existingType, "null"],
      };
    }
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) result[key] = normalizeNullableAnyOf(value);
  return result;
}

/**
 * Strips every `maxItems` from a converted JSON Schema.
 *
 * Gemini compiles `responseJsonSchema` into a constrained-decoding grammar and
 * *unrolls* bounded arrays: an array with `maxItems: N` whose items are objects
 * with P fields costs on the order of N×P grammar states, summed across the
 * whole schema. Past a threshold (measured against gemini-3.8-flash at roughly
 * 300 of those units) the API rejects the request outright with a bare
 * `400 INVALID_ARGUMENT / "Request contains an invalid argument."` — no
 * indication of which argument, and it fails before generating a single token.
 * `EvidenceAnalysisV2Schema` and `SynthesisV2Schema` were both over that line;
 * dropping their `maxItems` puts them comfortably under it with no other change.
 *
 * The caps themselves are not lost: the Zod schema still carries `.max(n)` and
 * still enforces it when the *response* is parsed (see `tryParse`), which is
 * the only place the bound actually protects anything. `minItems` is left in
 * place — a lower bound forces no unrolling, and it is what keeps
 * `method`/`success_criteria` from coming back empty.
 */
export function stripMaxItems(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(stripMaxItems);
  if (node === null || typeof node !== "object") return node;
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (key === "maxItems") continue;
    result[key] = stripMaxItems(value);
  }
  return result;
}

export function toResponseSchema(schema: z.ZodType<unknown>): unknown {
  const jsonSchema = z.toJSONSchema(schema) as Record<string, unknown>;
  delete jsonSchema.$schema;
  return stripMaxItems(normalizeNullableAnyOf(jsonSchema));
}

// ---------------------------------------------------------------------------
// Failure classification — kept distinct so callers (and logs) can tell a
// transient formatting slip from an actual API error from a validation
// mismatch, per the spec's "JSON 파싱·Zod·근거 참조 의미 검증을 구분해라".
// Reference/semantic validation (V2ValidationError) happens one layer up, in
// pipeline-v2.ts — this module only ever sees JSON-parse and Zod failures.
// ---------------------------------------------------------------------------

type ParseOutcome<T> = { ok: true; value: T } | { ok: false; code: "json_parse" | "schema_validation"; message: string };

export function tryParse<T>(schema: z.ZodType<T>, text: string): ParseOutcome<T> {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    return {
      ok: false,
      code: "json_parse",
      message: error instanceof Error ? error.message : "JSON 파싱 실패",
    };
  }
  const result = schema.safeParse(raw);
  if (result.success) return { ok: true, value: result.data };
  return { ok: false, code: "schema_validation", message: result.error.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
}

class GeminiProvider implements AIProvider {
  readonly name = "gemini";
  private readonly client: GoogleGenAI;

  constructor(
    apiKey: string,
    private readonly model: string,
  ) {
    this.client = new GoogleGenAI({ apiKey });
  }

  /** One raw call. No retry logic here — that lives in generateStructured, which is the only place that knows *why* a retry might help. */
  private async callOnce(
    request: StructuredRequest<unknown>,
    promptText: string,
  ): Promise<{ text: string; usage?: { prompt?: number; candidates?: number; thoughts?: number; total?: number } }> {
    const contents = request.files?.length
      ? [
          promptText,
          ...request.files.map((file) => ({
            inlineData: { mimeType: file.mimeType, data: file.base64 },
          })),
        ]
      : promptText;

    const thinkingConfig = resolveThinkingConfig(this.model, request.effort ?? "medium");

    const response = await this.client.models.generateContent({
      model: this.model,
      contents,
      config: {
        systemInstruction: request.system,
        responseMimeType: "application/json",
        responseJsonSchema: toResponseSchema(request.schema),
        // Thinking tokens count against this budget, so it is set well above
        // the size of the JSON we actually want back.
        maxOutputTokens: request.maxTokens ?? 12000,
        ...(thinkingConfig ? { thinkingConfig } : {}),
        // Fail loudly instead of hanging if the API stalls.
        httpOptions: { timeout: 120_000 },
      },
    });

    const finishReason = response.candidates?.[0]?.finishReason;
    if (finishReason === FinishReason.MAX_TOKENS) {
      throw new AIProviderError("응답이 최대 길이에서 잘렸습니다.", request.kind, "max_tokens");
    }
    if (finishReason && finishReason !== FinishReason.STOP) {
      throw new AIProviderError(`모델이 응답을 중단했습니다 (${finishReason}).`, request.kind, "non_stop_finish");
    }

    const text = response.text;
    if (!text) throw new AIProviderError("모델이 빈 응답을 반환했습니다.", request.kind, "empty_response");

    const u = response.usageMetadata;
    return {
      text,
      usage: u
        ? {
            prompt: u.promptTokenCount,
            candidates: u.candidatesTokenCount,
            thoughts: u.thoughtsTokenCount,
            total: u.totalTokenCount,
          }
        : undefined,
    };
  }

  async generateStructured<T>(request: StructuredRequest<T>): Promise<T> {
    const startedAt = Date.now();
    // Each call can take tens of seconds (the model "thinks" even at low
    // effort) — log start/finish so a hang is visible in the server terminal
    // instead of looking like a frozen page. Never logs the prompt, files, or
    // API key — only identifiers and sizes.
    console.log(`[gemini] ${request.kind} model=${this.model} → start`);

    const logDone = (attempt: number, usage?: { total?: number }) => {
      console.log(
        `[gemini] ${request.kind} model=${this.model} attempt=${attempt} → done in ${Date.now() - startedAt}ms` +
          (usage?.total !== undefined ? ` tokens=${usage.total}` : ""),
      );
    };
    const logFailed = (attempt: number, code: string) => {
      console.error(
        `[gemini] ${request.kind} model=${this.model} attempt=${attempt} → failed after ${Date.now() - startedAt}ms code=${code}`,
      );
    };

    try {
      const first = await this.callOnce(request, request.prompt);
      const firstParsed = tryParse(request.schema, first.text);
      if (firstParsed.ok) {
        logDone(1, first.usage);
        return firstParsed.value;
      }
      logFailed(1, firstParsed.code);

      // Exactly one repair attempt, ever — never a retry loop. The retry
      // prompt tells the model what specifically failed rather than just
      // resending the same request and hoping for a different sample.
      const repairPrompt = `${request.prompt}\n\n---\n이전 응답이 다음 이유로 반려되었습니다: ${firstParsed.message}\nJSON Schema를 정확히 지켜 유효한 JSON만 다시 반환하라.`;
      const second = await this.callOnce(request, repairPrompt);
      const secondParsed = tryParse(request.schema, second.text);
      if (secondParsed.ok) {
        logDone(2, second.usage);
        return secondParsed.value;
      }
      logFailed(2, secondParsed.code);
      throw new AIProviderError(
        `AI 응답이 예상한 형식을 따르지 않았습니다 (${request.kind}).`,
        request.kind,
        secondParsed.code,
      );
    } catch (error) {
      if (error instanceof AIProviderError) {
        logFailed(0, error.code);
        throw error;
      }
      logFailed(0, "unknown");
      throw new AIProviderError(
        `AI 분석에 실패했습니다 (${request.kind}).`,
        request.kind,
        "unknown",
        error,
      );
    }
  }
}

let cached: AIProvider | null = null;

export function getAIProvider(): AIProvider {
  if (cached) return cached;

  if (process.env.AI_PROVIDER === "mock") {
    cached = mockProvider;
    return cached;
  }

  cached = new GeminiProvider(geminiApiKey(), geminiModel());
  return cached;
}
