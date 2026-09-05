"use client";

import { useActionState, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Choice } from "@/components/ui/choice";
import { Alert, Spinner } from "@/components/ui/feedback";
import {
  updateProjectEvidenceTypes,
  type ProjectEvidenceFormState,
} from "@/lib/actions/projects";
import { EVIDENCE_LABEL, EVIDENCE_TYPES } from "@/lib/domain/constants";
import type { EvidenceType } from "@/lib/types/database";

/**
 * Edits `projects.evidence` from the project detail page. Unselecting a type
 * that still has registered evidence_records is never silent — the server
 * action rejects it and this shows the guidance inline (delete/reassign first).
 */
export function EvidenceTypeEditor({
  projectId,
  evidence,
}: {
  projectId: string;
  evidence: EvidenceType[];
}) {
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<EvidenceType[]>(evidence);
  const [state, action, pending] = useActionState<ProjectEvidenceFormState, FormData>(
    updateProjectEvidenceTypes,
    {},
  );

  const [handledState, setHandledState] = useState(state);
  if (state !== handledState) {
    setHandledState(state);
    if (state.saved) setEditing(false);
  }

  function toggle(value: string, checked: boolean) {
    const next = value as EvidenceType;
    setSelected((current) => {
      if (!checked) return current.filter((item) => item !== next);
      if (next === "none") return ["none"];
      return [...current.filter((item) => item !== "none"), next];
    });
  }

  if (!editing) {
    return (
      <div className="space-y-3">
        {evidence.length === 0 ? (
          <span className="text-ink-muted">선택하지 않음</span>
        ) : (
          <span className="flex flex-wrap gap-1.5">
            {evidence.map((item) => (
              <Badge key={item}>{EVIDENCE_LABEL[item]}</Badge>
            ))}
          </span>
        )}
        <div>
          <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
            종류 수정
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="projectId" value={projectId} />
      {selected.map((item) => (
        <input key={item} type="hidden" name="evidence" value={item} />
      ))}
      {state.error ? <Alert>{state.error}</Alert> : null}
      <div className="grid gap-2 sm:grid-cols-2">
        {EVIDENCE_TYPES.map((option) => (
          <Choice
            key={option.value}
            type="checkbox"
            name="evidence_display"
            value={option.value}
            label={option.label}
            description={option.description}
            checked={selected.includes(option.value)}
            onChange={toggle}
          />
        ))}
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? <Spinner className="size-3.5" /> : null}
          저장
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setSelected(evidence);
            setEditing(false);
          }}
          disabled={pending}
        >
          취소
        </Button>
      </div>
    </form>
  );
}
