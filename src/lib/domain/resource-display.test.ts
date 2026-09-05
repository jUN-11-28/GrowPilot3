import { test } from "node:test";
import assert from "node:assert/strict";
import { inferDisplayAvailability } from "./resource-display";
import type { ResourceRow } from "@/lib/types/database";

function resource(overrides: Partial<ResourceRow>): ResourceRow {
  return {
    id: "r1",
    title: "t",
    description: "d",
    url: null,
    resource_type: "template",
    stage_tags: [],
    bottleneck_tags: [],
    availability: null,
    cost_info: null,
    eligibility: null,
    last_verified_at: null,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

test("a pre-v2 row with no url and no stored availability displays as reference_only, not actionable", () => {
  assert.equal(inferDisplayAvailability(resource({ url: null, availability: null })), "reference_only");
});

test("a pre-v2 row with a url displays as actionable even without a stored availability", () => {
  assert.equal(inferDisplayAvailability(resource({ url: "https://example.com", availability: null })), "actionable");
});

test("an explicitly stored availability always wins over the URL heuristic", () => {
  assert.equal(
    inferDisplayAvailability(resource({ url: "https://example.com", availability: "needs_verification" })),
    "needs_verification",
  );
  assert.equal(inferDisplayAvailability(resource({ url: null, availability: "actionable" })), "actionable");
});
