import { BookOpen, ExternalLink, UserRound, Wrench } from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { groupResources, RESOURCE_TYPE_LABEL } from "@/lib/domain/constants";
import { inferDisplayAvailability, RESOURCE_AVAILABILITY_LABEL } from "@/lib/domain/resource-display";
import type { ResourceRow } from "@/lib/types/database";

/**
 * Presentational pieces shared by the v1 report (page.tsx) and the v2 report
 * (result-v2.tsx) — split out so the two don't drift into two different
 * visual languages for the same kind of content.
 */

export function Section({
  number,
  title,
  icon: Icon,
  lead,
  children,
}: {
  number: string;
  title: string;
  icon?: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  lead?: boolean;
  children: ReactNode;
}) {
  return (
    <section className="space-y-5">
      <div className="flex items-center gap-3">
        <span className="text-[11px] tabular-nums text-ink-muted">{number}</span>
        {Icon ? <Icon aria-hidden className="size-4 text-ink" /> : null}
        <h2
          className={
            lead
              ? "text-[13px] font-semibold uppercase tracking-[0.14em] text-ink"
              : "text-[13px] font-medium uppercase tracking-[0.14em] text-ink-secondary"
          }
        >
          {title}
        </h2>
        <span aria-hidden className="h-px flex-1 bg-line" />
      </div>
      {children}
    </section>
  );
}

export function Row({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="grid gap-2 px-7 py-6 sm:grid-cols-[132px_1fr] sm:gap-6">
      <dt className="text-[13px] font-medium text-ink-muted">{term}</dt>
      <dd>{children}</dd>
    </div>
  );
}

export function BoardRow({
  role,
  duty,
  badge,
  body,
  children,
}: {
  role: string;
  duty: string;
  badge?: string;
  body?: string;
  children?: ReactNode;
}) {
  return (
    <div className="space-y-3 px-6 py-5">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-[13px] font-semibold text-ink">{role}</h3>
        <span className="text-xs text-ink-muted">{duty}</span>
        {badge ? <Badge>{badge}</Badge> : null}
      </div>
      {body ? (
        <p className="whitespace-pre-line text-[14px] leading-[1.75] text-ink-secondary">{body}</p>
      ) : (
        <p className="text-[13px] text-ink-muted">이 라운드에 기록된 산출이 없습니다.</p>
      )}
      {children}
    </div>
  );
}

export function EvidenceList({
  title,
  description,
  items,
  emptyText,
  marker: Marker,
  markerClass,
}: {
  title: string;
  description: string;
  items: string[];
  emptyText: string;
  marker: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  markerClass: string;
}) {
  return (
    <div className="space-y-4 bg-surface p-6">
      <div className="space-y-1">
        <h3 className="text-[13px] font-semibold text-ink">{title}</h3>
        <p className="text-xs text-ink-muted">{description}</p>
      </div>
      {items.length === 0 ? (
        <p className="text-[13px] leading-relaxed text-ink-secondary">{emptyText}</p>
      ) : (
        <ul className="space-y-2.5">
          {items.map((item, index) => (
            <li key={`${index}-${item}`} className="flex gap-2.5 text-[14px] leading-[1.7] text-ink-secondary">
              <Marker aria-hidden className={`mt-1 size-4 shrink-0 ${markerClass}`} />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const GROUP_ICON: Record<string, ComponentType<{ className?: string; "aria-hidden"?: boolean }>> = {
  expert: UserRound,
  tool: Wrench,
  knowledge: BookOpen,
};

export function ResourceRecommendations({
  resources,
  reasons,
  emptyMessage,
}: {
  resources: ResourceRow[];
  reasons: Map<string, string>;
  /** Shown when there are no resources — v1 and v2 phrase "nothing to show" differently (see prompt doc §3.B). */
  emptyMessage: string;
}) {
  const groups = groupResources(resources);

  if (groups.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-line-strong bg-surface-muted px-6 py-8 text-[13px] text-ink-secondary">
        {emptyMessage}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {groups.map((group) => {
        const Icon = GROUP_ICON[group.key] ?? BookOpen;
        return (
          <div key={group.key} className="overflow-hidden rounded-xl border border-line bg-surface">
            <div className="flex items-center gap-2.5 border-b border-line px-6 py-4">
              <Icon aria-hidden className="size-4 text-ink" />
              <h3 className="text-[13px] font-semibold text-ink">{group.label}</h3>
              <span className="text-xs text-ink-muted">{group.description}</span>
            </div>
            <ul className="divide-y divide-line">
              {group.items.map((resource) => {
                const reason = reasons.get(resource.id);
                return (
                  <li key={resource.id} className="space-y-1.5 px-6 py-5">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="text-[15px] font-semibold text-ink">
                        {resource.url ? (
                          <a
                            href={resource.url}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="inline-flex items-center gap-1.5 underline decoration-line-strong underline-offset-4 hover:decoration-ink"
                          >
                            {resource.title}
                            <ExternalLink aria-hidden className="size-3.5 text-ink-muted" />
                          </a>
                        ) : (
                          resource.title
                        )}
                      </h4>
                      <Badge>{RESOURCE_TYPE_LABEL[resource.resource_type]}</Badge>
                      <Badge tone={inferDisplayAvailability(resource) === "actionable" ? "positive" : "muted"}>
                        {RESOURCE_AVAILABILITY_LABEL[inferDisplayAvailability(resource)]}
                      </Badge>
                    </div>
                    <p className="text-[13px] leading-relaxed text-ink-secondary">
                      {resource.description}
                    </p>
                    {resource.eligibility ? (
                      <p className="text-[13px] leading-relaxed text-ink-muted">
                        이용 조건: {resource.eligibility}
                      </p>
                    ) : null}
                    {reason ? (
                      <p className="border-l-2 border-line pl-3 text-[13px] leading-relaxed text-ink">
                        왜 필요한가 — {reason}
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
