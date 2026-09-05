import { test } from "node:test";
import assert from "node:assert/strict";
import { pendingQuestion, searchResourcesByBottleneckV2 } from "./service";
import type { ResourceRow } from "@/lib/types/database";

/**
 * A minimal fake standing in for the one Supabase call shape
 * `searchResourcesByBottleneckV2` actually uses: `.from(table).select().<filter
 * methods>.order()` resolving to `{ data, error }`. Not a general-purpose
 * Supabase mock — just enough to drive the three query branches (tag,
 * stage-widen, full-catalogue fallback) and an injected error.
 */
type FakeResponse = { data?: ResourceRow[]; error?: { message: string } | null };

function fakeSupabase(responses: { overlaps?: FakeResponse; contains?: FakeResponse; all?: FakeResponse }) {
  return {
    from() {
      const builder = {
        select() {
          return builder;
        },
        overlaps() {
          return {
            order: async () => responses.overlaps ?? { data: [], error: null },
          };
        },
        contains() {
          return {
            order: async () => responses.contains ?? { data: [], error: null },
          };
        },
        order: async () => responses.all ?? { data: [], error: null },
      };
      return builder;
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

function resource(id: string, tags: string[] = []): ResourceRow {
  return {
    id,
    title: id,
    description: "d",
    url: null,
    resource_type: "template",
    stage_tags: [],
    bottleneck_tags: tags,
    availability: null,
    cost_info: null,
    eligibility: null,
    last_verified_at: null,
    created_at: new Date().toISOString(),
  };
}

// --- scenario #10: a real DB error must not be reported as "0 candidates" ---

test("a Supabase error on the tag search surfaces lookupStatus: failed, not an empty result", async () => {
  const supabase = fakeSupabase({ overlaps: { data: undefined, error: { message: "connection reset" } } });
  const result = await searchResourcesByBottleneckV2(supabase, { tags: ["technical_feasibility"], stage: "solution" });
  assert.equal(result.lookupStatus, "failed");
  assert.equal(result.candidates.length, 0);
  assert.match(result.excludedReasons.join(), /connection reset/);
});

test("a Supabase error on the full-catalogue fallback also surfaces as failed, not as a successful empty search", async () => {
  const supabase = fakeSupabase({
    overlaps: { data: [], error: null },
    contains: { data: [], error: null },
    all: { data: undefined, error: { message: "timeout" } },
  });
  const result = await searchResourcesByBottleneckV2(supabase, { tags: [], stage: null });
  assert.equal(result.lookupStatus, "failed");
});

test("a genuinely empty, error-free search reports lookupStatus: ok with zero candidates (a real no_match, not a hidden failure)", async () => {
  const supabase = fakeSupabase({ overlaps: { data: [], error: null }, contains: { data: [], error: null }, all: { data: [], error: null } });
  const result = await searchResourcesByBottleneckV2(supabase, { tags: ["technical_feasibility"], stage: "solution" });
  assert.equal(result.lookupStatus, "ok");
  assert.equal(result.candidates.length, 0);
});

// --- retrieval mode reflects which branch actually produced rows -----------

test("a tag search that alone meets the minimum candidate count reports retrievalMode: tag", async () => {
  const rows = Array.from({ length: 6 }, (_, i) => resource(`r${i}`, ["technical_feasibility"]));
  const supabase = fakeSupabase({ overlaps: { data: rows, error: null } });
  const result = await searchResourcesByBottleneckV2(supabase, { tags: ["technical_feasibility"], stage: "solution" });
  assert.equal(result.retrievalMode, "tag");
  assert.equal(result.candidates.length, 6);
});

test("a thin tag search that needs the stage-widen fallback reports retrievalMode: expanded", async () => {
  const tagRows = [resource("r1", ["technical_feasibility"])];
  const stageRows = [resource("r1", ["technical_feasibility"]), resource("r2"), resource("r3"), resource("r4"), resource("r5"), resource("r6")];
  const supabase = fakeSupabase({ overlaps: { data: tagRows, error: null }, contains: { data: stageRows, error: null } });
  const result = await searchResourcesByBottleneckV2(supabase, { tags: ["technical_feasibility"], stage: "solution" });
  assert.equal(result.retrievalMode, "expanded");
  assert.equal(result.candidates.length, 6); // r1 deduped across both queries
});

test("a null stage with no tags skips the stage query and falls straight to the full-catalogue fallback", async () => {
  const allRows = [resource("r1"), resource("r2")];
  const supabase = fakeSupabase({ all: { data: allRows, error: null } });
  const result = await searchResourcesByBottleneckV2(supabase, { tags: [], stage: null });
  assert.equal(result.candidates.length, 2);
  assert.equal(result.retrievalMode, "none");
});

// --- candidate cap ------------------------------------------------------

test("results beyond MAX_RESOURCE_CANDIDATES_RETURNED are truncated with a noted reason, not silently handed to the model uncapped", async () => {
  const rows = Array.from({ length: 40 }, (_, i) => resource(`r${i}`, ["technical_feasibility"]));
  const supabase = fakeSupabase({ overlaps: { data: rows, error: null } });
  const result = await searchResourcesByBottleneckV2(supabase, { tags: ["technical_feasibility"], stage: "solution" });
  assert.equal(result.candidates.length, 30);
  assert.match(result.excludedReasons.join(), /30건만 전달/);
});

// --- pendingQuestion --------------------------------------------------------

test("pendingQuestion finds the first unanswered row and returns null when every question is answered", () => {
  const rows = [
    { id: "1", answer: "a" },
    { id: "2", answer: null },
    { id: "3", answer: null },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ] as any[];
  assert.equal(pendingQuestion(rows)?.id, "2");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  assert.equal(pendingQuestion(rows.filter((r) => r.answer !== null) as any[]), null);
});
