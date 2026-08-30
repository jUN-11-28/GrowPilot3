"use client";

import { Trash2 } from "lucide-react";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/feedback";
import { deleteProject } from "@/lib/actions/projects";

export function DeleteProjectButton({ projectId }: { projectId: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      variant="ghost"
      disabled={pending}
      onClick={() => {
        if (!window.confirm("프로젝트와 모든 진단 기록이 삭제됩니다. 계속할까요?")) {
          return;
        }
        const formData = new FormData();
        formData.set("projectId", projectId);
        startTransition(() => deleteProject(formData));
      }}
    >
      {pending ? (
        <Spinner className="size-3.5" />
      ) : (
        <Trash2 aria-hidden className="size-3.5" />
      )}
      삭제
    </Button>
  );
}
