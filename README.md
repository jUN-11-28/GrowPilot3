# GrowPilot

창업 프로젝트의 현재 단계를 진단하고, 다음 단계로 가는 것을 막고 있는 **병목(Critical Bottleneck)** 과
그것을 검증할 **다음 실험(Next Experiment)** 을 리포트로 만들어 주는 도구입니다.

핵심 가치 제안은 **"1인 창업자가 지금 무엇부터 해야 하는지 결정해주는 AI"** 이며,
리포트는 항상 세 가지를 순서대로 답합니다.

1. **Bottleneck** — 지금 가장 먼저 풀어야 할 병목
2. **Next Experiment** — 그 병목을 검증할 실험 하나
3. **Resource** — 그 실험을 실행하는 데 필요한 자원 · 전문가 · 도구

- Next.js 16 (App Router, Server Components 기본, `proxy.ts`) · React 19 · TypeScript strict
- Tailwind CSS v4 · Lucide Icons
- Supabase (Auth · PostgreSQL · Row Level Security · `@supabase/ssr`)
- Google Gemini `gemini-3.7-flash` (structured JSON output, Zod 검증)

## 설정

```bash
npm install
cp .env.example .env.local   # 값을 채운다
```

| 변수 | 설명 |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | publishable key (`sb_publishable_...`). legacy anon JWT를 쓰지 않는다. |
| `GEMINI_API_KEY` | 서버에서만 사용. 브라우저 번들에 포함되지 않는다. |
| `GEMINI_MODEL` | 선택. 기본값 `gemini-3.7-flash` |
| `AI_PROVIDER` | `gemini`(기본) 또는 `mock` |

secret key / service role key는 이 앱 어디에서도 읽지 않습니다.

### 데이터베이스

`supabase/migrations/` 의 SQL을 순서대로 적용합니다.

```bash
supabase db reset          # 로컬
# 또는 Supabase Studio의 SQL Editor에 0001 → 0002 순서로 붙여넣기
```

- `0001_init.sql` — 테이블, 트리거, **모든 사용자 데이터에 대한 RLS 정책**
- `0002_resources_seed.sql` — 추천 카탈로그 (자원 16 · 전문가 6 · 도구 6)

### 실행

```bash
npm run dev
npm run typecheck
npm run lint
npm run build
```

`AI_PROVIDER=mock` 으로 두면 Gemini 호출 없이 UI를 개발할 수 있습니다.
목 데이터는 `src/lib/ai/mock-provider.ts` 한 파일에만 존재하며, 모든 값에 `[MOCK]` 접두어가 붙습니다.

## 구조

```
src/
  app/
    (auth)/                    로그인 · 회원가입
    (app)/                     로그인이 필요한 화면
      dashboard/               프로젝트 목록
      projects/new/            프로젝트 생성
      projects/[projectId]/    프로젝트 상세 · 진단 기록
        diagnosis/[sessionId]/        adaptive 질문 UI
        diagnosis/[sessionId]/result/ 진단 리포트
    api/diagnosis/[sessionId]/run/    5단계 파이프라인 실행(NDJSON 진행 스트리밍)
  lib/
    ai/
      provider.ts              AI provider 추상화 (Gemini / mock)
      schemas.ts               모든 에이전트 출력의 Zod 스키마
      pipeline.ts              순차 오케스트레이션
      prompts/                 evidence · stage · bottleneck · red-team · synthesizer · question
    domain/                    단계 모델, 병목 우선순위 규칙
    supabase/                  browser · server · proxy 클라이언트
    actions/                   Server Actions
    data/                      읽기 전용 데이터 접근
  proxy.ts                     세션 갱신 + 낙관적 리다이렉트
supabase/migrations/           스키마 + RLS + 시드
```

## 진단 엔진

```
User Input → Evidence Analyst → Stage Diagnoser → Bottleneck Analyst → Red Team → Strategy Synthesizer → Final Result
```

각 역할은 독립된 프롬프트 + Zod 스키마이며, `pipeline.ts` 가 서버에서 순차적으로 실행합니다.
프레임워크 없이 평범한 함수 호출로 구성되어 있어, 단계를 추가하거나 provider를 바꾸는 데 다른 코드가 영향을 받지 않습니다.

### 단계 모델

`Problem → Solution → Validation → PMF → Growth`

- 점수가 가장 낮은 항목을 병목으로 삼지 않습니다.
- 선행 단계의 Evidence가 부족하면 후행 단계보다 **먼저** 병목 후보가 됩니다.
  이 우선순위는 프롬프트에만 맡기지 않고 `src/lib/domain/bottleneck.ts` 에서 코드로 계산해
  Bottleneck Analyst에게 제약으로 전달합니다.
- 데이터가 없는 것은 감점이 아니라 "판단할 Evidence가 아직 부족하다"로 처리되며,
  그 부족 자체가 다음 실험의 근거가 됩니다.

## 보안

- 모든 테이블에 RLS가 켜져 있고, 사용자는 자신의 행만 읽고 쓸 수 있습니다.
- 자식 테이블(`diagnosis_*`)의 INSERT 정책은 부모 리소스의 소유권까지 확인합니다.
- 모든 Server Action과 Route Handler는 `requireUser()` 로 로그인 여부를,
  `user_id` 필터로 소유권을 **서버에서 다시** 검증합니다. `proxy.ts` 의 리다이렉트는 UX 보조 수단일 뿐입니다.
- `ANTHROPIC_API_KEY` 는 서버 모듈(`import "server-only"`)에서만 참조됩니다.
