import { z } from "zod";
import { MAX_QUESTIONS } from "@/lib/domain/constants";

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

/** 1. Evidence Analyst */
export const EvidenceAnalysisSchema = z.object({
  available_evidence: z.array(
    z.object({
      label: z.string(),
      summary: z.string(),
      strength: z.enum(["strong", "moderate", "weak"]),
    }),
  ),
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

/** 2. Stage Diagnoser */
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

/** 3. Bottleneck Analyst */
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

/** 5. Strategy Synthesizer — the shape the report renders. */
export const SynthesisSchema = z.object({
  current_stage: growthStage,
  stage_confidence: confidence,
  evidence_confidence: confidence,
  critical_bottleneck: z.string(),
  bottleneck_reason: z.string(),
  supporting_evidence: z.array(z.string()),
  missing_evidence: z.array(z.string()),
  lean_analyst_opinion: z.string(),
  red_team_counterargument: z.string(),
  next_experiment: z.object({
    title: z.string(),
    hypothesis: z.string(),
    method: z.array(z.string()).describe("실행 순서대로의 단계"),
    success_criteria: z.array(z.string()).describe("측정 가능한 성공 기준"),
    duration: z.string().describe("예: 2주"),
  }),
  recommended_resource_numbers: z
    .array(z.number().int())
    .describe(
      "실험을 실행하는 데 필요한 리소스 목록 번호. 전문가·도구·자원을 통틀어 최대 5개.",
    ),
});
export type Synthesis = z.infer<typeof SynthesisSchema>;
