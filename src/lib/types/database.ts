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
  current_stage: GrowthStage;
  stage_confidence: number;
  evidence_confidence: number;
  critical_bottleneck: string;
  bottleneck_reason: string;
  supporting_evidence: string[];
  missing_evidence: string[];
  lean_analyst_opinion: string;
  red_team_counterargument: string;
  next_experiment: NextExperiment;
  recommended_resource_ids: string[];
  agent_trace: Json;
  created_at: string;
}

export type NextExperiment = {
  title: string;
  hypothesis: string;
  method: string[];
  success_criteria: string[];
  duration: string;
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

export type ResourceRow = {
  id: string;
  title: string;
  description: string;
  url: string | null;
  resource_type: ResourceType;
  stage_tags: string[];
  bottleneck_tags: string[];
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
        Omit<ProjectRow, "id" | "created_at" | "updated_at"> &
          Partial<Pick<ProjectRow, "id" | "created_at" | "updated_at">>,
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
        Omit<DiagnosisResultRow, "id" | "created_at"> &
          Partial<Pick<DiagnosisResultRow, "id" | "created_at">>,
        Partial<DiagnosisResultRow>
      >;
      resources: Table<ResourceRow, never, never>;
      project_attachments: Table<
        ProjectAttachmentRow,
        Pick<ProjectAttachmentRow, "project_id" | "user_id" | "kind"> &
          Partial<ProjectAttachmentRow>,
        Partial<ProjectAttachmentRow>
      >;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
