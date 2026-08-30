import {
  ATTACHMENT_KIND_LABEL,
  EVIDENCE_LABEL,
  GROWTH_STAGES,
  PROJECT_STAGE_LABEL,
} from "@/lib/domain/constants";
import type { AttachmentKind, EvidenceType, ProjectStage } from "@/lib/types/database";

export interface AnsweredQuestion {
  question: string;
  answer: string;
}

export interface AttachmentSummary {
  kind: AttachmentKind;
  fileName: string | null;
  note: string | null;
}

export interface DiagnosisContext {
  project: {
    name: string;
    problem: string;
    target_customer: string;
    solution: string;
    stage: ProjectStage;
    evidence: EvidenceType[];
  };
  answers: AnsweredQuestion[];
  attachments: AttachmentSummary[];
}

/** Rules every agent shares, so the stage model is stated exactly once. */
export const SHARED_RULES = `# Growth Stage Model
진단 단계는 순서가 있다: ${GROWTH_STAGES.map((s) => s.label).join(" → ")}
${GROWTH_STAGES.map((s) => `- ${s.label}: ${s.description}`).join("\n")}

# 판단 원칙
- 점수가 가장 낮은 항목을 병목이라고 부르지 않는다.
- 병목은 "현재 사업이 다음 단계로 진행되는 것을 막고 있는 가장 중요한 미검증 가설 또는 제약"이다.
- 선행 단계의 Evidence가 충분하지 않으면, 후행 단계의 문제보다 그 선행 단계를 우선하여 병목 후보로 본다.
- 데이터가 없다는 것은 실패나 감점이 아니다. "해당 가설을 판단할 Evidence가 아직 부족하다"고 기술하고, 그 부족함 자체를 다음 실험의 근거로 삼는다.
- 사용자가 이미 제공한 정보를 추측으로 바꾸지 않는다. 모르는 것은 모른다고 쓴다.
- 모든 출력은 한국어로 쓴다. 과장하지 않고, 컨설턴트가 쓰는 담백한 문장으로 쓴다.`;

export function formatProject(context: DiagnosisContext): string {
  const { project } = context;
  const evidence =
    project.evidence.length === 0
      ? "선택 없음"
      : project.evidence.map((item) => EVIDENCE_LABEL[item]).join(", ");

  return `# 프로젝트
- 프로젝트명: ${project.name}
- 해결하려는 문제: ${project.problem}
- 타깃 고객: ${project.target_customer}
- 해결 방법: ${project.solution}
- 사용자가 선택한 현재 진행 단계: ${PROJECT_STAGE_LABEL[project.stage]}
- 사용자가 확보했다고 밝힌 Evidence: ${evidence}`;
}

export function formatAnswers(context: DiagnosisContext): string {
  if (context.answers.length === 0) {
    return "# 진단 대화\n(아직 추가 질문에 대한 답변이 없다)";
  }

  return `# 진단 대화\n${context.answers
    .map((item, index) => `Q${index + 1}. ${item.question}\nA${index + 1}. ${item.answer}`)
    .join("\n\n")}`;
}

export function formatAttachments(context: DiagnosisContext): string {
  if (context.attachments.length === 0) {
    return "# 첨부 자료\n(업로드된 자료 없음)";
  }

  return `# 첨부 자료\n${context.attachments
    .map((item, index) => {
      const label = ATTACHMENT_KIND_LABEL[item.kind];
      const file = item.fileName ? ` (파일: ${item.fileName})` : "";
      const note = item.note ? `\n  ${item.note}` : "";
      return `${index + 1}. [${label}]${file}${note}`;
    })
    .join("\n")}`;
}

export function formatContext(context: DiagnosisContext): string {
  return `${formatProject(context)}\n\n${formatAttachments(context)}\n\n${formatAnswers(context)}`;
}
