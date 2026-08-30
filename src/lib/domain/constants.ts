import type {
  AttachmentKind,
  EvidenceType,
  GrowthStage,
  ProjectStage,
  ResourceType,
} from "@/lib/types/database";

export interface Option<T extends string> {
  value: T;
  label: string;
  description: string;
}

/** 사용자가 프로젝트 생성 시 직접 고르는 "현재 진행 단계". */
export const PROJECT_STAGES: Option<ProjectStage>[] = [
  { value: "idea", label: "아이디어", description: "문제와 해결책을 구상 중" },
  {
    value: "problem_validation",
    label: "문제 검증 중",
    description: "고객을 만나 문제가 실재하는지 확인 중",
  },
  { value: "mvp_building", label: "MVP 개발 중", description: "첫 제품을 만드는 중" },
  { value: "mvp_launched", label: "MVP 출시", description: "제품을 공개했고 초기 반응을 보는 중" },
  { value: "users", label: "사용자 확보", description: "실제 사용자가 반복적으로 쓰고 있음" },
  { value: "revenue", label: "매출 발생", description: "돈을 내는 고객이 있음" },
  { value: "growth", label: "성장", description: "획득·잔존을 키우는 데 집중" },
];

/** 이미 확보한 Evidence. "none"은 실패가 아니라 출발점이다. */
export const EVIDENCE_TYPES: Option<EvidenceType>[] = [
  { value: "customer_interviews", label: "고객 인터뷰", description: "잠재 고객과 직접 대화한 기록" },
  { value: "surveys", label: "설문", description: "정량 설문 응답" },
  { value: "mvp", label: "MVP", description: "동작하는 최소 제품" },
  { value: "real_users", label: "실사용자", description: "실제로 쓰는 사용자" },
  { value: "signup_data", label: "가입 데이터", description: "가입 전환/유입 수치" },
  { value: "payment_data", label: "결제 데이터", description: "결제 시도·전환 기록" },
  { value: "revenue", label: "매출", description: "실제 발생한 매출" },
  { value: "retention", label: "리텐션", description: "재방문·재사용 데이터" },
  { value: "customer_feedback", label: "고객 피드백", description: "사용 후 정성 피드백" },
  { value: "none", label: "아직 없음", description: "아직 확보한 근거가 없음" },
];

/**
 * 진단 단계 모델. 선행 단계의 Evidence가 부족하면 후행 단계보다 먼저 병목 후보가 된다.
 */
export const GROWTH_STAGES: Option<GrowthStage>[] = [
  { value: "problem", label: "Problem", description: "풀 만한 가치가 있는 문제가 실재하는가" },
  { value: "solution", label: "Solution", description: "이 해결책이 그 문제를 실제로 해소하는가" },
  { value: "validation", label: "Validation", description: "고객이 행동(사용·지불)으로 증명했는가" },
  { value: "pmf", label: "PMF", description: "재사용·잔존이 스스로 유지되는가" },
  { value: "growth", label: "Growth", description: "반복 가능한 획득 경로가 있는가" },
];

export const GROWTH_STAGE_ORDER: GrowthStage[] = GROWTH_STAGES.map((s) => s.value);

export const MAX_QUESTIONS = 8;

/** 사업기획서·재무제표·고민 등 첨부 자료의 분류. */
export const ATTACHMENT_KINDS: Option<AttachmentKind>[] = [
  { value: "business_plan", label: "사업기획서", description: "사업 개요, 전략, 로드맵 문서" },
  { value: "financials", label: "재무제표", description: "매출, 비용, 자금 현황 자료" },
  { value: "concern", label: "고민되는 점", description: "지금 판단이 어려운 상황이나 질문" },
  { value: "verification", label: "검증 결과", description: "이전 실험을 실행한 결과" },
  { value: "other", label: "기타", description: "위에 해당하지 않는 참고 자료" },
];

export const ATTACHMENT_KIND_LABEL = labelMap(ATTACHMENT_KINDS);
export const ATTACHMENT_KIND_VALUES = ATTACHMENT_KINDS.map((k) => k.value);

/** Gemini가 파일 내용을 그대로 읽을 수 있는 형식만 받는다. */
export const ALLOWED_ATTACHMENT_MIME_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/heic",
  "image/heif",
  "text/plain",
  "text/csv",
] as const;

export const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;

function labelMap<T extends string>(options: Option<T>[]): Record<T, string> {
  return Object.fromEntries(options.map((o) => [o.value, o.label])) as Record<
    T,
    string
  >;
}

export const PROJECT_STAGE_LABEL = labelMap(PROJECT_STAGES);
export const EVIDENCE_LABEL = labelMap(EVIDENCE_TYPES);
export const GROWTH_STAGE_LABEL = labelMap(GROWTH_STAGES);

export const PROJECT_STAGE_VALUES = PROJECT_STAGES.map((s) => s.value);
export const EVIDENCE_VALUES = EVIDENCE_TYPES.map((e) => e.value);

/**
 * The product promises three things after the experiment is named: 자원, 전문가,
 * 도구. The report groups recommendations the same way.
 */
export const RESOURCE_GROUPS = [
  {
    key: "expert",
    label: "전문가",
    description: "이 실험을 실행하는 데 빌릴 수 있는 사람",
    types: ["expert"],
  },
  {
    key: "tool",
    label: "도구",
    description: "실험을 굴리는 데 필요한 도구",
    types: ["tool"],
  },
  {
    key: "knowledge",
    label: "자원",
    description: "방법을 잡을 때 참고할 것",
    types: ["book", "article", "framework", "template", "video"],
  },
] as const satisfies ReadonlyArray<{
  key: string;
  label: string;
  description: string;
  types: readonly ResourceType[];
}>;

export const RESOURCE_TYPE_LABEL: Record<ResourceType, string> = {
  book: "책",
  article: "아티클",
  framework: "프레임워크",
  template: "템플릿",
  video: "영상",
  tool: "도구",
  expert: "전문가",
};

export const MAX_RECOMMENDED_RESOURCES = 5;

export function groupResources<T extends { resource_type: ResourceType }>(
  resources: T[],
) {
  return RESOURCE_GROUPS.map((group) => ({
    ...group,
    items: resources.filter((resource) =>
      (group.types as readonly ResourceType[]).includes(resource.resource_type),
    ),
  })).filter((group) => group.items.length > 0);
}
