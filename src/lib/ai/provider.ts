import "server-only";

import { GoogleGenAI, FinishReason, ThinkingLevel } from "@google/genai";
import { z } from "zod";
import { geminiApiKey, geminiModel } from "@/lib/env";
import { mockProvider } from "@/lib/ai/mock-provider";

/** Identifies which agent step a request belongs to (used for logging + mocks). */
export type AgentKind =
  | "question"
  | "evidence"
  | "stage"
  | "bottleneck"
  | "red_team"
  | "synthesis"
  | "resource";

/**
 * "none" disables Gemini's thinking pass entirely (thinkingBudget: 0), which
 * cuts latency roughly 5x in testing — worth it for steps that don't need
 * deep reasoning, like planning the question list.
 */
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
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "AIProviderError";
  }
}

const THINKING_LEVEL: Record<Exclude<Effort, "none">, ThinkingLevel> = {
  low: ThinkingLevel.LOW,
  medium: ThinkingLevel.MEDIUM,
  high: ThinkingLevel.HIGH,
};

/**
 * Gemini accepts JSON Schema on `responseJsonSchema`, but only a subset of
 * keywords. Zod 4 emits `$schema`, which is not in that subset — strip it.
 */
function toResponseSchema(schema: z.ZodType<unknown>): unknown {
  const jsonSchema = z.toJSONSchema(schema) as Record<string, unknown>;
  delete jsonSchema.$schema;
  return jsonSchema;
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

  async generateStructured<T>(request: StructuredRequest<T>): Promise<T> {
    const startedAt = Date.now();
    // Each call can take tens of seconds (the model "thinks" even at low
    // effort) — log start/finish so a hang is visible in the server terminal
    // instead of looking like a frozen page.
    console.log(`[gemini] ${request.kind} → start`);

    try {
      const contents = request.files?.length
        ? [
            request.prompt,
            ...request.files.map((file) => ({
              inlineData: { mimeType: file.mimeType, data: file.base64 },
            })),
          ]
        : request.prompt;

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
          thinkingConfig:
            request.effort === "none"
              ? { thinkingBudget: 0 }
              : { thinkingLevel: THINKING_LEVEL[request.effort ?? "medium"] },
          // Fail loudly instead of hanging if the API stalls.
          httpOptions: { timeout: 120_000 },
        },
      });

      console.log(`[gemini] ${request.kind} → done in ${Date.now() - startedAt}ms`);

      const finishReason = response.candidates?.[0]?.finishReason;
      if (finishReason === FinishReason.MAX_TOKENS) {
        throw new Error("응답이 최대 길이에서 잘렸습니다.");
      }
      if (finishReason && finishReason !== FinishReason.STOP) {
        throw new Error(`모델이 응답을 중단했습니다 (${finishReason}).`);
      }

      const text = response.text;
      if (!text) throw new Error("모델이 빈 응답을 반환했습니다.");

      // Structured output is requested, but never trusted: every field reaching
      // the database has been through the Zod schema.
      return request.schema.parse(JSON.parse(text));
    } catch (error) {
      console.error(
        `[gemini] ${request.kind} → failed after ${Date.now() - startedAt}ms`,
        error,
      );
      throw new AIProviderError(
        `AI 분석에 실패했습니다 (${request.kind}).`,
        request.kind,
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
