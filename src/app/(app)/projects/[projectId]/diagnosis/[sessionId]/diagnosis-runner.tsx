"use client";

import { ArrowRight, Check } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { Alert, ProgressBar, Spinner } from "@/components/ui/feedback";
import {
  advanceDiagnosis,
  submitAnswer,
  type DiagnosisStep,
} from "@/lib/actions/diagnosis";
import { PIPELINE_STEPS, STEP_LABEL, type PipelineStep } from "@/lib/ai/steps";
import { cn } from "@/lib/utils";
import type { SessionStatus } from "@/lib/types/database";

type Phase = "loading" | "question" | "analyzing" | "error";

interface RunEvent {
  type: "step" | "done" | "error" | "in_progress";
  step?: PipelineStep;
  phase?: "start" | "done";
  detail?: string;
  resultId?: string;
  message?: string;
}

interface FeedEntry {
  step: PipelineStep;
  text: string;
}

export function DiagnosisRunner({
  sessionId,
  projectId,
  projectName,
  maxQuestions,
  initialAskedCount,
  initialStep,
  sessionStatus,
  sessionError,
}: {
  sessionId: string;
  projectId: string;
  projectName: string;
  maxQuestions: number;
  initialAskedCount: number;
  initialStep: DiagnosisStep | null;
  sessionStatus: SessionStatus;
  sessionError: string | null;
}) {
  const router = useRouter();
  const [step, setStep] = useState<DiagnosisStep | null>(initialStep);
  const [phase, setPhase] = useState<Phase>(() => {
    if (sessionStatus === "analyzing") return "analyzing";
    if (sessionStatus === "failed") return "error";
    return initialStep ? "question" : "loading";
  });
  const [askedCount, setAskedCount] = useState(initialAskedCount);
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState<string | null>(
    sessionStatus === "failed"
      ? (sessionError ?? "이전 분석이 완료되지 못했습니다. 다시 시도해 주세요.")
      : null,
  );
  const [pending, setPending] = useState(false);
  const [completedSteps, setCompletedSteps] = useState<PipelineStep[]>([]);
  const [activeStep, setActiveStep] = useState<PipelineStep | null>(null);
  const [feed, setFeed] = useState<FeedEntry[]>([]);
  const analysisStarted = useRef(false);
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);
    };
  }, []);

  const runAnalysis = useCallback(async () => {
    if (analysisStarted.current) return;
    analysisStarted.current = true;
    setPhase("analyzing");
    setError(null);
    setFeed([]);
    setCompletedSteps([]);

    try {
      const response = await fetch(`/api/diagnosis/${sessionId}/run`, {
        method: "POST",
      });
      if (!response.ok || !response.body) {
        throw new Error("분석 요청이 실패했습니다.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as RunEvent;

          if (event.type === "step" && event.step) {
            if (event.phase === "start") setActiveStep(event.step);
            else {
              const finished = event.step;
              setCompletedSteps((current) => [...current, finished]);
              setActiveStep(null);
              if (event.detail) {
                setFeed((current) => [...current, { step: finished, text: event.detail! }]);
              }
            }
          } else if (event.type === "done") {
            router.replace(`/projects/${projectId}/diagnosis/${sessionId}/result`);
            router.refresh();
            return;
          } else if (event.type === "error") {
            throw new Error(event.message ?? "분석에 실패했습니다.");
          } else if (event.type === "in_progress") {
            // Another request already holds the analysis claim (a concurrent
            // tab, or this session's own earlier request that hasn't
            // finished yet) — stay on the "analyzing" screen and check again
            // shortly, rather than treating this as success or failure.
            analysisStarted.current = false;
            pollTimeoutRef.current = setTimeout(() => void runAnalysis(), 3000);
            return;
          }
        }
      }
      throw new Error("분석이 완료되지 않았습니다.");
    } catch (caught) {
      analysisStarted.current = false;
      setPhase("error");
      setError(
        caught instanceof Error ? caught.message : "분석 중 오류가 발생했습니다.",
      );
    }
  }, [projectId, router, sessionId]);

  const applyStep = useCallback(
    (next: DiagnosisStep) => {
      setStep(next);
      if (next.type === "question") {
        setAskedCount(next.askedCount);
        setAnswer("");
        setPhase("question");
      } else if (next.type === "ready") {
        setAskedCount(next.askedCount);
        void runAnalysis();
      } else if (next.type === "generating_questions") {
        // Another request (this tab reloaded mid-flight, or a second tab)
        // holds the claim on generating this session's questions — wait and
        // check again rather than calling the model ourselves.
        setPhase("loading");
        pollTimeoutRef.current = setTimeout(() => {
          void advanceDiagnosis(sessionId).then(applyStep);
        }, 1500);
      } else if (next.type === "completed") {
        router.replace(`/projects/${projectId}/diagnosis/${sessionId}/result`);
      } else {
        setPhase("error");
        setError(next.message);
      }
    },
    [projectId, router, runAnalysis, sessionId],
  );

  // Boots the session once on mount: either resume the analysis that was already
  // running, or ask the interviewer for the first question.
  useEffect(() => {
    let cancelled = false;

    async function boot() {
      // A failed run is not retried automatically — the user asks for it.
      if (sessionStatus === "failed") return;
      if (sessionStatus === "analyzing") {
        await runAnalysis();
        return;
      }
      if (initialStep) return;

      const next = await advanceDiagnosis(sessionId);
      if (!cancelled) applyStep(next);
    }

    void boot();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(value: string) {
    if (!step || step.type !== "question" || !value.trim()) return;
    setPending(true);
    setError(null);
    try {
      const next = await submitAnswer({
        sessionId,
        answerId: step.question.id,
        answer: value.trim(),
      });
      applyStep(next);
    } catch {
      setError("답변을 저장하지 못했습니다. 다시 시도해 주세요.");
    } finally {
      setPending(false);
    }
  }

  const questionNumber =
    step?.type === "question" ? step.question.orderIndex : askedCount;

  return (
    <div className="space-y-10 py-6">
      <header className="space-y-4">
        <p className="text-[13px] text-ink-muted">{projectName}</p>
        <ProgressBar
          value={phase === "analyzing" ? maxQuestions : Math.max(questionNumber - 1, 0)}
          max={maxQuestions}
          label={phase === "analyzing" ? "질문 완료" : "질문"}
        />
      </header>

      {phase === "loading" ? (
        <div className="flex items-center gap-3 py-16 text-sm text-ink-secondary">
          <Spinner />
          첫 질문을 준비하고 있습니다…
        </div>
      ) : null}

      {phase === "question" && step?.type === "question" ? (
        <QuestionCard
          key={step.question.id}
          question={step.question}
          value={answer}
          onValueChange={setAnswer}
          onSubmit={handleSubmit}
          pending={pending}
        />
      ) : null}

      {phase === "analyzing" ? (
        <AnalysisProgress active={activeStep} completed={completedSteps} feed={feed} />
      ) : null}

      {error ? (
        <div className="space-y-4">
          <Alert>{error}</Alert>
          <Button
            variant="secondary"
            onClick={() => {
              setError(null);
              if (phase === "error" && step?.type !== "question") {
                void runAnalysis();
              } else {
                setPhase("loading");
                void advanceDiagnosis(sessionId).then(applyStep);
              }
            }}
          >
            다시 시도
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function QuestionCard({
  question,
  value,
  onValueChange,
  onSubmit,
  pending,
}: {
  question: Extract<DiagnosisStep, { type: "question" }>["question"];
  value: string;
  onValueChange: (value: string) => void;
  onSubmit: (value: string) => void;
  pending: boolean;
}) {
  return (
    <section className="space-y-7">
      <div className="space-y-3">
        <span className="text-[13px] tabular-nums text-ink-muted">
          질문 {question.orderIndex}
        </span>
        <h1 className="text-[22px] font-semibold leading-snug tracking-tight sm:text-[26px]">
          {question.question}
        </h1>
        {question.reason ? (
          <p className="border-l-2 border-line pl-3 text-[13px] leading-relaxed text-ink-secondary">
            {question.reason}
          </p>
        ) : null}
      </div>

      {question.questionType === "single_choice" ? (
        <div className="space-y-2">
          {question.options.map((option) => (
            <button
              key={option}
              type="button"
              disabled={pending}
              onClick={() => onSubmit(option)}
              className={cn(
                "group flex w-full items-center justify-between rounded-md border border-line bg-surface px-4 py-3.5 text-left text-sm",
                "transition-colors hover:border-ink hover:bg-surface-muted disabled:opacity-60",
              )}
            >
              <span>{option}</span>
              <ArrowRight
                aria-hidden
                className="size-4 shrink-0 text-ink-muted transition-transform group-hover:translate-x-0.5"
              />
            </button>
          ))}
        </div>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit(value);
          }}
        >
          <Textarea
            autoFocus
            rows={4}
            value={value}
            onChange={(event) => onValueChange(event.target.value)}
            placeholder="아는 만큼만 적어 주세요. 모르면 '모르겠다'도 답이 됩니다."
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                event.preventDefault();
                onSubmit(value);
              }
            }}
          />
          <div className="flex items-center gap-3">
            <Button type="submit" size="lg" disabled={pending || !value.trim()}>
              {pending ? <Spinner /> : null}
              {pending ? "다음 질문 준비 중" : "답변하고 계속"}
            </Button>
            <span className="text-xs text-ink-muted">⌘ + Enter</span>
          </div>
        </form>
      )}
    </section>
  );
}

function AnalysisProgress({
  active,
  completed,
  feed,
}: {
  active: PipelineStep | null;
  completed: PipelineStep[];
  feed: FeedEntry[];
}) {
  const feedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = feedRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [feed]);

  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-[22px] font-semibold tracking-tight">진단을 분석하고 있습니다</h1>
        <p className="text-sm leading-relaxed text-ink-secondary">
          역할이 다른 {PIPELINE_STEPS.length}개의 에이전트가 차례로 검토합니다. 1~2분 정도 걸립니다.
        </p>
      </div>
      <ol className="overflow-hidden rounded-xl border border-line bg-surface">
        {PIPELINE_STEPS.map((step) => {
          const isDone = completed.includes(step);
          const isActive = active === step;
          return (
            <li
              key={step}
              className="flex items-center gap-3 border-b border-line px-5 py-4 last:border-b-0"
            >
              <span
                aria-hidden
                className={cn(
                  "grid size-5 shrink-0 place-items-center rounded-full border",
                  isDone
                    ? "border-ink bg-ink text-ink-inverse"
                    : isActive
                      ? "border-ink text-ink"
                      : "border-line text-ink-muted",
                )}
              >
                {isDone ? <Check className="size-3" strokeWidth={3} /> : null}
              </span>
              <span
                className={cn(
                  "text-sm",
                  isDone || isActive ? "text-ink" : "text-ink-muted",
                )}
              >
                {STEP_LABEL[step]}
              </span>
              {isActive ? <Spinner className="size-3.5 text-ink-muted" /> : null}
            </li>
          );
        })}
      </ol>

      {feed.length > 0 ? (
        <div
          ref={feedRef}
          className="max-h-40 space-y-3 overflow-y-auto rounded-xl border border-line bg-surface-muted p-5"
        >
          {feed.map((entry, index) => (
            <p
              key={`${entry.step}-${index}`}
              className="text-[13px] leading-relaxed text-ink-secondary"
            >
              <span className="mr-2 font-medium text-ink">{STEP_LABEL[entry.step]}</span>
              {entry.text}
            </p>
          ))}
        </div>
      ) : null}
    </section>
  );
}
