import { z } from "zod";
import { BOTTLENECK_TAGS, MAX_QUESTIONS } from "@/lib/domain/constants";

const confidence = z.number().int().min(0).max(100);

export const growthStage = z.enum([
  "problem",
  "solution",
  "validation",
  "pmf",
  "growth",
]);

/** Interviewer: the full question set, planned up front in one call. */
export const QuestionBatchSchema = z.object({
  questions: z
    .array(
      z.object({
        reason: z.string().describe("이 질문을 던지는 이유. 사용자에게 보여진다."),
        question: z.string(),
        question_type: z.enum(["text", "single_choice"]),
        options: z
          .array(z.string())
          .describe("question_type이 single_choice일 때 2~5개. 아니면 빈 배열."),
      }),
    )
    .max(MAX_QUESTIONS)
    .describe(
      "판별력 높은 순서대로 정렬된 질문 목록. 병목을 판단할 근거가 이미 충분하면 빈 배열.",
    ),
});
export type QuestionBatch = z.infer<typeof QuestionBatchSchema>;
export type PlannedQuestion = QuestionBatch["questions"][number];

/** 1. Evidence Agent — 사실 / 가설 / 누락을 세 갈래로 가른다. */
export const EvidenceAnalysisSchema = z.object({
  available_evidence: z
    .array(
      z.object({
        label: z.string(),
        summary: z.string(),
        strength: z.enum(["strong", "moderate", "weak"]),
      }),
    )
    .describe("이미 관찰된 사실. 창업자의 의견이나 계획은 여기 들어가지 않는다."),
  unverified_hypotheses: z
    .array(
      z.object({
        statement: z.string().describe("창업자가 사실처럼 말했지만 아직 검증되지 않은 주장"),
        why_unverified: z.string().describe("무엇이 관찰되지 않아 가설로 남아 있는지"),
      }),
    )
    .describe("입력에 등장한 진술 중 근거 없이 참으로 가정된 것들."),
  missing_evidence: z.array(
    z.object({
      label: z.string(),
      stage: growthStage,
      why_it_matters: z.string(),
    }),
  ),
  evidence_confidence: confidence.describe(
    "현재 근거만으로 사업 상태를 판단할 수 있는 정도",
  ),
  summary: z.string(),
});
export type EvidenceAnalysis = z.infer<typeof EvidenceAnalysisSchema>;

/** 2. Lean Analyst (a) — Stage Diagnoser */
export const StageDiagnosisSchema = z.object({
  current_stage: growthStage,
  stage_confidence: confidence,
  reasoning: z.string(),
  unmet_prerequisites: z.array(
    z.object({
      stage: growthStage,
      missing: z.string(),
    }),
  ),
});
export type StageDiagnosis = z.infer<typeof StageDiagnosisSchema>;

/** 3. Lean Analyst (b) — Bottleneck Analyst */
export const BottleneckAnalysisSchema = z.object({
  candidates: z.array(
    z.object({
      statement: z.string(),
      stage: growthStage,
      why_blocking: z.string(),
      evidence_gap: z.string(),
    }),
  ),
  critical_bottleneck: z.object({
    statement: z.string().describe("다음 단계를 막고 있는 가장 중요한 미검증 가설 또는 제약"),
    stage: growthStage,
    reason: z.string(),
    evidence_gap: z
      .string()
      .describe("이 단계의 최소 증거와 실제 확보한 증거 사이에 벌어진 공백"),
    supporting_evidence: z.array(z.string()),
    missing_evidence: z.array(z.string()),
  }),
  lean_analyst_opinion: z.string(),
});
export type BottleneckAnalysis = z.infer<typeof BottleneckAnalysisSchema>;

/** 4. Red Team */
export const RedTeamSchema = z.object({
  counterargument: z.string(),
  challenged_assumptions: z.array(z.string()),
  alternative_bottleneck: z.string().describe("더 시급할 수 있는 다른 병목. 없으면 빈 문자열."),
  verdict: z.enum(["holds", "revise", "replace"]),
  revision_note: z.string(),
});
export type RedTeamReview = z.infer<typeof RedTeamSchema>;

/**
 * 14일 검증 미션. 기간은 모델이 고르지 않는다 — 항상 14일이고, 모델이 맞춰야
 * 하는 것은 그 안에 끝낼 수 있는 범위다.
 */
export const NextExperimentSchema = z.object({
  title: z.string(),
  hypothesis: z.string().describe("14일 뒤 참/거짓을 가릴 수 있는 문장"),
  method: z.array(z.string()).describe("창업자가 그대로 따라 할 실행 순서"),
  verification_method: z
    .string()
    .describe("무엇을 어떻게 세어서 성공/실패를 판정하는지. 측정 대상과 기록 방법."),
  success_criteria: z.array(z.string()).describe("숫자나 관찰 가능한 사건으로 쓴 성공 기준"),
  stop_condition: z
    .string()
    .describe("이 조건이 나오면 14일을 채우지 말고 실험을 멈추고 가설을 바꾼다"),
});
export type NextExperimentOutput = z.infer<typeof NextExperimentSchema>;

/** 5. Strategy Synthesizer — 병목 1개와 실험 1개를 확정한다. */
export const SynthesisSchema = z.object({
  current_stage: growthStage,
  stage_confidence: confidence,
  evidence_confidence: confidence,
  critical_bottleneck: z.string(),
  bottleneck_reason: z.string(),
  evidence_gap: z
    .string()
    .describe("이 병목을 만든 검증 공백. 무엇이 있어야 했는데 없는지 한 문장으로."),
  // Not a z.enum: an unrecognised tag would fail the whole five-call pipeline
  // over a spelling. The allowed values are enumerated in the system prompt and
  // unknown tags are dropped in code, where the worst case is a wider search.
  bottleneck_tags: z
    .array(z.string())
    .describe(
      `확정된 병목을 자원 검색용 태그로 옮긴 것. 1~3개. 다음 값만 사용한다: ${BOTTLENECK_TAGS.map((t) => t.value).join(", ")}`,
    ),
  supporting_evidence: z.array(z.string()),
  missing_evidence: z.array(z.string()),
  lean_analyst_opinion: z.string(),
  red_team_counterargument: z.string(),
  next_experiment: NextExperimentSchema,
});
export type Synthesis = z.infer<typeof SynthesisSchema>;

/**
 * 6. Resource Agent — 확정된 병목과 실험을 받아 실행에 필요한 자원만 고른다.
 * 병목 → 필요 전략 → 구체 자원 순서로 답하므로 추천 근거를 설명할 수 있다.
 */
export const ResourceSelectionSchema = z.object({
  strategy: z
    .string()
    .describe("이 병목을 풀기 위해 필요한 전략 한 문장. 자원은 이 전략에서 도출된다."),
  picks: z
    .array(
      z.object({
        number: z.number().int().describe("후보 목록의 번호"),
        reason: z.string().describe("이번 실험의 어느 지점에서 이것이 필요한지"),
      }),
    )
    .describe("실험 실행에 실제로 쓰이는 것만. 최대 5개. 없으면 빈 배열."),
});
export type ResourceSelection = z.infer<typeof ResourceSelectionSchema>;
