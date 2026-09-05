import type {
  AttachmentKind,
  BusinessModel,
  EvidenceType,
  GrowthStage,
  ProjectStage,
  ResourceType,
  TechnicalMaturity,
  TechnologyType,
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
 * 진단 단계 모델.
 *
 * 성장 단계는 사업자 등록 연차나 창업자의 자기 선언이 아니라 "확보된 Evidence
 * 수준"으로 판정한다. 각 단계는 다음 단계로 넘어가기 위해 필요한 최소 증거
 * (exitCriteria)를 가지며, 창업자가 확보한 증거와 이 기준의 차이가 Evidence Gap이다.
 * 병목은 그 Gap이 가장 크게 벌어진 가장 이른 단계에서 고른다.
 */
export interface GrowthStageSpec extends Option<GrowthStage> {
  /** 이 단계가 답해야 하는 질문 */
  keyQuestion: string;
  /** 이 단계에서 볼 수 있는 대표 Evidence */
  representativeEvidence: string[];
  /** 다음 단계로 넘어가기 위한 최소 증거 */
  exitCriteria: string;
}

export const GROWTH_STAGES: GrowthStageSpec[] = [
  {
    value: "problem",
    label: "Problem",
    description: "풀 만한 가치가 있는 문제가 실재하는가",
    keyQuestion: "실제 고객 문제가 존재하는가?",
    representativeEvidence: ["고객 인터뷰", "문제 발생 빈도"],
    exitCriteria:
      "타깃 고객 다수가 최근에 실제로 그 문제를 겪었다는 1차 기록(인터뷰·관찰)과 문제 발생 빈도",
  },
  {
    value: "solution",
    label: "Solution",
    description: "이 해결책이 그 문제를 실제로 해소하는가",
    keyQuestion: "이 해결책을 고객이 원하는가?",
    representativeEvidence: ["MVP 반응", "사용 의향"],
    exitCriteria:
      "이 해결책을 본 고객의 실제 반응 — 사용 시도, 사전 등록, 사용 의향 표명",
  },
  {
    value: "validation",
    label: "Validation",
    description: "고객이 행동(사용·지불)으로 증명했는가",
    keyQuestion: "실제 사용·구매 행동이 나타나는가?",
    representativeEvidence: ["가입 전환", "결제", "반복 사용"],
    exitCriteria: "말이 아닌 행동 데이터 — 가입 전환율, 결제, 반복 사용 기록",
  },
  {
    value: "pmf",
    label: "PMF",
    description: "재사용·잔존이 스스로 유지되는가",
    keyQuestion: "반복적으로 선택하고 유지하는가?",
    representativeEvidence: ["리텐션", "재구매", "Churn"],
    exitCriteria:
      "코호트 리텐션이 평평해지거나 재구매·갱신이 유지된다는 데이터",
  },
  {
    value: "growth",
    label: "Growth",
    description: "반복 가능한 획득 경로가 있는가",
    keyQuestion: "확장 가능한 성장 구조가 있는가?",
    representativeEvidence: ["CAC", "LTV", "Referral"],
    exitCriteria: "획득 비용과 고객 가치가 계산되고, 반복 가능한 채널이 특정됨",
  },
];

export const GROWTH_STAGE_ORDER: GrowthStage[] = GROWTH_STAGES.map((s) => s.value);

export const MAX_QUESTIONS = 8;

/**
 * 실험은 항상 14일 단위다. 모델이 기간을 고르지 않는다 — 기간은 고정 제약이고,
 * 모델이 맞춰야 하는 것은 "14일 안에 끝낼 수 있는 범위"다.
 */
export const EXPERIMENT_DURATION_DAYS = 14;
export const EXPERIMENT_DURATION_LABEL = `${EXPERIMENT_DURATION_DAYS}일`;

/**
 * 자원 검색에 쓰는 병목 태그 어휘. `resources.bottleneck_tags` 에 실제로 저장된
 * 값과 1:1로 맞춰져 있다 — 여기 없는 태그로 검색하면 아무것도 걸리지 않는다.
 */
export const BOTTLENECK_TAGS = [
  { value: "problem_evidence", label: "문제 존재 근거 부재" },
  { value: "customer_definition", label: "타깃 고객 정의 불명확" },
  { value: "interview_quality", label: "고객 대화의 질" },
  { value: "solution_fit", label: "해결책 적합성 미검증" },
  { value: "mvp_scope", label: "MVP 범위·미구현" },
  { value: "positioning", label: "메시지·포지셔닝" },
  { value: "willingness_to_pay", label: "지불 의사 미검증" },
  { value: "pricing", label: "가격 결정" },
  { value: "monetization", label: "수익화 구조" },
  { value: "acquisition", label: "고객 확보·유입" },
  { value: "channel", label: "채널 탐색" },
  { value: "activation", label: "첫 사용 활성화" },
  { value: "retention", label: "리텐션 저하" },
  { value: "pmf_signal", label: "PMF 신호 확인" },
  { value: "customer_feedback", label: "사용 후 피드백 수집" },
  { value: "measurement", label: "지표 계측 부재" },
  { value: "experiment_design", label: "실험 설계" },
] as const;

export type BottleneckTag = (typeof BOTTLENECK_TAGS)[number]["value"];

export const BOTTLENECK_TAG_VALUES = BOTTLENECK_TAGS.map((t) => t.value) as [
  BottleneckTag,
  ...BottleneckTag[],
];

/**
 * v2 전용 추가 병목 태그. 기존 17개(BOTTLENECK_TAGS)는 v1 파이프라인이 그대로
 * 쓰므로 건드리지 않는다 — 1인 기술 창업자(하드웨어·로보틱스 등)에게 필요한
 * 태그만 더한다. 이 태그로 검색했을 때 실제로 걸리는 자원은 아직 없을 수 있고,
 * 그 경우 Resource Agent는 no_match를 반환해야 한다 — 가짜 자원을 만들어
 * 채우지 않는다.
 */
export const BOTTLENECK_TAGS_V2_EXTRA = [
  { value: "technical_feasibility", label: "기술 실현 가능성 미검증" },
  { value: "prototype_reliability", label: "프로토타입 신뢰성·재현성" },
  { value: "pilot_access", label: "파일럿·시험 환경 접근" },
  { value: "delivery_scalability", label: "생산·공급 확장성" },
  { value: "operational_reliability", label: "운영 안정성" },
  { value: "cash_runway", label: "자금 소진 기한" },
] as const;

export type BottleneckTagV2 = BottleneckTag | (typeof BOTTLENECK_TAGS_V2_EXTRA)[number]["value"];

export const BOTTLENECK_TAGS_V2 = [...BOTTLENECK_TAGS, ...BOTTLENECK_TAGS_V2_EXTRA] as ReadonlyArray<{
  value: BottleneckTagV2;
  label: string;
}>;

export const BOTTLENECK_TAG_VALUES_V2 = BOTTLENECK_TAGS_V2.map((t) => t.value) as [
  BottleneckTagV2,
  ...BottleneckTagV2[],
];

/**
 * v2 TechnicalContext — 1인 기술 창업자의 기술 유형·판매 방식을 서버가 구조화해
 * 프롬프트에 전달하기 위한 값 목록. "MVP를 출시한 SaaS 창업자"만을 전제하지
 * 않도록 소프트웨어 외 유형을 동등하게 다룬다. 마지막 옵션은 항상 모름/기타다.
 */
export const TECHNOLOGY_TYPES: Option<TechnologyType>[] = [
  { value: "software", label: "소프트웨어", description: "웹·앱·백엔드 등 코드로 동작하는 제품" },
  { value: "ai_ml", label: "AI·ML", description: "모델·데이터 파이프라인이 핵심인 제품" },
  { value: "hardware", label: "하드웨어", description: "물리적 장치·전자·기구 설계가 핵심인 제품" },
  { value: "robotics", label: "로보틱스", description: "센서·구동·제어가 결합된 자율/반자율 장치" },
  { value: "biotech_medtech", label: "바이오·의료기기", description: "임상·인허가 절차가 관여하는 제품" },
  { value: "other_unknown", label: "기타/모름", description: "위에 해당하지 않거나 아직 정하지 못함" },
];

export const BUSINESS_MODELS: Option<BusinessModel>[] = [
  { value: "b2b", label: "B2B", description: "기업·조직이 구매를 결정" },
  { value: "b2c", label: "B2C", description: "개인 소비자가 구매를 결정" },
  { value: "b2b2c", label: "B2B2C", description: "기업을 통해 최종 개인 사용자에게 도달" },
  { value: "unknown", label: "모름", description: "아직 판매 구조를 정하지 못함" },
];

export const TECHNICAL_MATURITIES: Option<TechnicalMaturity>[] = [
  { value: "concept", label: "개념 단계", description: "설계·시뮬레이션만 있고 실물/코드가 없음" },
  { value: "prototype", label: "프로토타입", description: "동작하는 시제품이 있으나 반복 검증 전" },
  { value: "pilot_tested", label: "파일럿 테스트", description: "제한된 환경·인원으로 실제 시험을 마침" },
  { value: "shipped", label: "출시됨", description: "실제 사용자에게 전달되어 쓰이고 있음" },
  { value: "scaled", label: "양산·확장", description: "반복 생산 또는 다수 배포 체계를 갖춤" },
  { value: "unknown", label: "모름", description: "아직 판단하기 이름" },
];

/**
 * v2 readiness dimensions (StageDiagnosisV2 / SynthesisV2 §2.3). Replaces v1's
 * linear GROWTH_STAGES exitCriteria as the thing evidence is checked against —
 * v2 reports readiness per dimension instead of a single stage-gap score, and
 * none of these six is inherently "earlier" than another.
 */
export const READINESS_DIMENSIONS_V2 = [
  { value: "technical_feasibility", label: "기술 실현 가능성" },
  { value: "customer_problem", label: "고객 문제 실재성" },
  { value: "solution_value", label: "해결책 가치" },
  { value: "commercial_validation", label: "구매·도입 검증" },
  { value: "repeat_use", label: "반복 사용" },
  { value: "delivery_scalability", label: "공급·운영 확장성" },
] as const;

export type ReadinessDimensionV2 = (typeof READINESS_DIMENSIONS_V2)[number]["value"];

export const READINESS_DIMENSION_VALUES_V2 = READINESS_DIMENSIONS_V2.map((d) => d.value) as [
  ReadinessDimensionV2,
  ...ReadinessDimensionV2[],
];

export const READINESS_DIMENSION_LABEL_V2 = Object.fromEntries(
  READINESS_DIMENSIONS_V2.map((d) => [d.value, d.label]),
) as Record<ReadinessDimensionV2, string>;

export const READINESS_STATUS_LABEL_V2: Record<string, string> = {
  supported: "근거로 뒷받침됨",
  partial: "부분적으로 뒷받침됨",
  not_supported: "반대 근거 있음",
  unknown: "모름",
  not_applicable: "해당 없음",
};

/**
 * v2 replaces "Critical Bottleneck" (a label that implies certainty) with one
 * of these three, chosen by `diagnosis_status` — see prompt doc §2.4/§2.6.
 */
export const DIAGNOSIS_STATUS_LABEL_V2: Record<string, string> = {
  observed_issue: "확인된 문제",
  suspected_cause: "의심되는 원인",
  insufficient_information: "우선 확인할 과제",
};

export const ACTION_TYPE_LABEL_V2: Record<string, string> = {
  customer_experiment: "고객 실험",
  technical_test: "기술 시험",
  measurement_setup: "측정 준비",
  operational_fix: "운영 수정",
  clarification: "추가 확인",
};

export const CRITERIA_STATUS_LABEL_V2: Record<string, string> = {
  user_provided: "창업자가 제시한 기준",
  source_supported: "자료로 뒷받침된 기준",
  proposed: "이번에 제안하는 잠정 기준",
};

export const FEASIBILITY_STATUS_LABEL_V2: Record<string, string> = {
  fits: "현재 여건에 맞음",
  needs_confirmation: "핵심 제약 확인 필요",
};

export const RED_TEAM_VERDICT_LABEL_V2: Record<string, string> = {
  holds: "판단 유지",
  revise: "범위 수정",
  replace: "과제 교체",
  insufficient_evidence: "판단 보류",
};

export const RESOURCE_STATUS_LABEL_V2: Record<string, string> = {
  available: "바로 활용 가능",
  not_needed: "외부 도움 불필요",
  no_match: "맞는 자원 없음",
  needs_verification: "이용 조건 확인 필요",
  lookup_failed: "자원 조회 실패",
};

export const TECHNOLOGY_TYPE_LABEL = labelMap(TECHNOLOGY_TYPES);
export const BUSINESS_MODEL_LABEL = labelMap(BUSINESS_MODELS);
export const TECHNICAL_MATURITY_LABEL = labelMap(TECHNICAL_MATURITIES);

export const TECHNOLOGY_TYPE_VALUES = TECHNOLOGY_TYPES.map((t) => t.value) as [
  TechnologyType,
  ...TechnologyType[],
];
export const BUSINESS_MODEL_VALUES = BUSINESS_MODELS.map((b) => b.value) as [
  BusinessModel,
  ...BusinessModel[],
];
export const TECHNICAL_MATURITY_VALUES = TECHNICAL_MATURITIES.map((m) => m.value) as [
  TechnicalMaturity,
  ...TechnicalMaturity[],
];

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

/**
 * Below this many bottleneck-tag matches the search widens to the stage, so the
 * Resource Agent is never forced to choose out of one or two rows.
 */
export const MIN_RESOURCE_CANDIDATES = 6;

/** Hard cap on how many candidates a search hands the Resource Agent, even after widening. */
export const MAX_RESOURCE_CANDIDATES_RETURNED = 30;

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
