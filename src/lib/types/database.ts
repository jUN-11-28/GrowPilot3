/**
 * Hand-maintained mirror of supabase/migrations. Keep in sync when the schema
 * changes (or regenerate with `supabase gen types typescript`).
 */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type ProjectStage =
  | "idea"
  | "problem_validation"
  | "mvp_building"
  | "mvp_launched"
  | "users"
  | "revenue"
  | "growth";

export type EvidenceType =
  | "customer_interviews"
  | "surveys"
  | "mvp"
  | "real_users"
  | "signup_data"
  | "payment_data"
  | "revenue"
  | "retention"
  | "customer_feedback"
  | "none";

export type GrowthStage = "problem" | "solution" | "validation" | "pmf" | "growth";

export type SessionStatus = "questioning" | "analyzing" | "completed" | "failed";

/** v2 — question-batch generation status, decoupled from `SessionStatus`. */
export type QuestionGenerationStatus = "pending" | "generating" | "completed" | "failed";

/** v2 — 1인 기술 창업자의 기술 유형. 마지막 값은 항상 모름/기타다. */
export type TechnologyType =
  | "software"
  | "ai_ml"
  | "hardware"
  | "robotics"
  | "biotech_medtech"
  | "other_unknown";

export type BusinessModel = "b2b" | "b2c" | "b2b2c" | "unknown";

export type TechnicalMaturity =
  | "concept"
  | "prototype"
  | "pilot_tested"
  | "shipped"
  | "scaled"
  | "unknown";

/**
 * v2 — `projects.technical_context`. Server-validated JSONB; every field is
 * nullable because "모른다"는 0이나 기본값이 아니라 null로 남는다.
 */
export type TechnicalContext = {
  technology_type: TechnologyType | null;
  business_model: BusinessModel | null;
  user_role: string | null;
  buyer_role: string | null;
  technical_maturity: TechnicalMaturity | null;
  sales_cycle_days: number | null;
  usage_cycle_days: number | null;
};

/** v2 — `projects.execution_constraints`. */
export type ExecutionConstraints = {
  hours_per_week: number | null;
  budget_amount: number | null;
  budget_currency: string | null;
  customer_access: string | null;
  test_environment_access: string | null;
  hard_constraints: string[];
};

export type QuestionType = "text" | "single_choice";

export type ResourceType =
  | "book"
  | "article"
  | "framework"
  | "template"
  | "video"
  | "tool"
  | "expert";

export type AttachmentKind =
  | "business_plan"
  | "financials"
  | "concern"
  | "verification"
  | "other";

export type ProfileRow = {
  id: string;
  email: string;
  display_name: string | null;
  created_at: string;
  updated_at: string;
}

export type ProjectRow = {
  id: string;
  user_id: string;
  name: string;
  problem: string;
  target_customer: string;
  solution: string;
  stage: ProjectStage;
  evidence: EvidenceType[];
  /**
   * v2. Nullable JSONB — a project created before v2, or one whose founder
   * skipped the optional fields, reads back as null, not as zeroed-out values.
   */
  technical_context: TechnicalContext | null;
  execution_constraints: ExecutionConstraints | null;
  created_at: string;
  updated_at: string;
}

export type DiagnosisSessionRow = {
  id: string;
  project_id: string;
  user_id: string;
  status: SessionStatus;
  max_questions: number;
  error_message: string | null;
  /**
   * v2 — lets `advanceDiagnosis` tell "no batch generated yet" apart from "a
   * batch was generated and it happened to contain zero questions", and lets
   * a second concurrent request see that generation is already in flight
   * instead of calling the model again.
   */
  question_status: QuestionGenerationStatus;
  question_run_id: string | null;
  question_started_at: string | null;
  /**
   * v2 — analysis-run lease. Set when a run claims the right to call the
   * model; a second POST to the run route while this is unexpired must not
   * start a second pipeline run.
   */
  analysis_run_id: string | null;
  analysis_lock_expires_at: string | null;
  created_at: string;
  completed_at: string | null;
}

export type DiagnosisAnswerRow = {
  id: string;
  session_id: string;
  user_id: string;
  order_index: number;
  question: string;
  question_reason: string | null;
  question_type: QuestionType;
  options: string[];
  answer: string | null;
  answered_at: string | null;
  created_at: string;
}

export type DiagnosisResultRow = {
  id: string;
  session_id: string;
  project_id: string;
  user_id: string;
  /**
   * v1 rows always have a concrete stage/confidence. v2 rows may have
   * `current_stage: null` when no evidence supports ranking a stage at all —
   * that is a valid diagnosis, not missing data, and must never be displayed
   * as an earliest/default stage. `stage_confidence` / `evidence_confidence`
   * are v1-only; v2 has no percentage-confidence field (see `report_v2`).
   */
  current_stage: GrowthStage | null;
  stage_confidence: number | null;
  evidence_confidence: number | null;
  critical_bottleneck: string;
  bottleneck_reason: string;
  supporting_evidence: string[];
  missing_evidence: string[];
  lean_analyst_opinion: string;
  red_team_counterargument: string;
  next_experiment: NextExperiment;
  recommended_resource_ids: string[];
  agent_trace: Json;
  /**
   * v2. `1` (default) for every row written by the pre-v2 pipeline; those
   * rows have `report_v2: null` and are read through the v1 path only.
   * `2` means `report_v2` holds the canonical SynthesisV2 report and the
   * columns above are a display-only serialization of it (see serialize-v2.ts).
   */
  schema_version: 1 | 2;
  report_v2: Json | null;
  /** v2. The exact context object sent to the model, for reproducibility. */
  input_snapshot: Json | null;
  prompt_version: string | null;
  model_version: string | null;
  created_at: string;
}

/** v2 — a founder's report of running a previously issued `next_experiment`. */
export type ExperimentExecutionStatus = "not_started" | "in_progress" | "completed" | "stopped";

/**
 * v2 — whether the *system* can tell the experiment supported, contradicted,
 * or left inconclusive the hypothesis it was testing. Kept separate from the
 * founder's own `interpretation`, which is a claim, not a verified fact.
 */
export type ExperimentOutcome = "supports" | "does_not_support" | "inconclusive" | "incomplete";

export type ExperimentRunRow = {
  id: string;
  /** The diagnosis_results row whose next_experiment this run reports on. */
  source_result_id: string;
  project_id: string;
  user_id: string;
  /** Frozen copy of next_experiment at issue time — later edits to the report never retarget an in-flight run. */
  experiment_snapshot: Json;
  execution_status: ExperimentExecutionStatus;
  outcome: ExperimentOutcome | null;
  /** What the founder observed — numbers, quotes, events. Not the founder's reading of what it means. */
  observed_result: Json | null;
  /** The founder's own reading of observed_result. Never conflated with observed_result itself. */
  interpretation: string | null;
  evidence_refs: Json | null;
  new_concern: string | null;
  /** Scoped to (source_result_id, idempotency_key) — see migration unique constraint. */
  idempotency_key: string;
  /** Set once this run's submission has started the next diagnosis session, so a retry reuses it instead of creating a duplicate. */
  next_session_id: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * The 14-day mission. `duration` is not part of it: the period is a fixed
 * product constraint (EXPERIMENT_DURATION_DAYS), not something the model picks.
 *
 * `verification_method` / `stop_condition` were added after the first reports
 * were written, and `next_experiment` is JSONB, so rows created before that
 * lack them. They stay optional here and the report renders them conditionally
 * — reading an old report must not throw.
 */
export type NextExperiment = {
  title: string;
  hypothesis: string;
  method: string[];
  verification_method?: string;
  success_criteria: string[];
  stop_condition?: string;
  /** Legacy rows only. New results have no model-chosen duration. */
  duration?: string;
}

export type ProjectAttachmentRow = {
  id: string;
  project_id: string;
  user_id: string;
  kind: AttachmentKind;
  note: string | null;
  file_name: string | null;
  mime_type: string | null;
  storage_path: string | null;
  byte_size: number | null;
  created_at: string;
}

export type ResourceAvailability = "actionable" | "reference_only" | "needs_verification";

export type ResourceRow = {
  id: string;
  title: string;
  description: string;
  url: string | null;
  resource_type: ResourceType;
  stage_tags: string[];
  bottleneck_tags: string[];
  /** v2. Null on every pre-v2 row — "not classified yet", not a guessed value. See domain/resource-display.ts for the display-only fallback. */
  availability: ResourceAvailability | null;
  cost_info: Json | null;
  eligibility: string | null;
  last_verified_at: string | null;
  created_at: string;
}

type Table<Row, Insert, Update> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      profiles: Table<
        ProfileRow,
        Pick<ProfileRow, "id" | "email"> & Partial<ProfileRow>,
        Partial<ProfileRow>
      >;
      projects: Table<
        ProjectRow,
        Omit<
          ProjectRow,
          "id" | "created_at" | "updated_at" | "technical_context" | "execution_constraints"
        > &
          Partial<
            Pick<
              ProjectRow,
              "id" | "created_at" | "updated_at" | "technical_context" | "execution_constraints"
            >
          >,
        Partial<ProjectRow>
      >;
      diagnosis_sessions: Table<
        DiagnosisSessionRow,
        Pick<DiagnosisSessionRow, "project_id" | "user_id"> &
          Partial<DiagnosisSessionRow>,
        Partial<DiagnosisSessionRow>
      >;
      diagnosis_answers: Table<
        DiagnosisAnswerRow,
        Pick<
          DiagnosisAnswerRow,
          "session_id" | "user_id" | "order_index" | "question"
        > &
          Partial<DiagnosisAnswerRow>,
        Partial<DiagnosisAnswerRow>
      >;
      diagnosis_results: Table<
        DiagnosisResultRow,
        Omit<
          DiagnosisResultRow,
          | "id"
          | "created_at"
          | "schema_version"
          | "report_v2"
          | "input_snapshot"
          | "prompt_version"
          | "model_version"
        > &
          Partial<
            Pick<
              DiagnosisResultRow,
              | "id"
              | "created_at"
              | "schema_version"
              | "report_v2"
              | "input_snapshot"
              | "prompt_version"
              | "model_version"
            >
          >,
        Partial<DiagnosisResultRow>
      >;
      resources: Table<ResourceRow, never, never>;
      project_attachments: Table<
        ProjectAttachmentRow,
        Pick<ProjectAttachmentRow, "project_id" | "user_id" | "kind"> &
          Partial<ProjectAttachmentRow>,
        Partial<ProjectAttachmentRow>
      >;
      experiment_runs: Table<
        ExperimentRunRow,
        Pick<
          ExperimentRunRow,
          "source_result_id" | "project_id" | "user_id" | "experiment_snapshot" | "idempotency_key"
        > &
          Partial<ExperimentRunRow>,
        Partial<ExperimentRunRow>
      >;
    };
    Views: Record<string, never>;
    Functions: {
      submit_experiment_result: {
        Args: {
          p_source_result_id: string;
          p_project_id: string;
          p_user_id: string;
          p_experiment_snapshot: Json;
          p_execution_status: ExperimentExecutionStatus;
          p_outcome: ExperimentOutcome | null;
          p_observed_result: Json | null;
          p_interpretation: string | null;
          p_evidence_refs: Json | null;
          p_new_concern: string | null;
          p_idempotency_key: string;
          p_max_questions: number;
          p_start_next_session?: boolean;
        };
        Returns: { run_id: string; next_session_id: string | null; created: boolean }[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
