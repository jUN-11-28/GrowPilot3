import type { ResourceAvailability, ResourceRow } from "@/lib/types/database";

/**
 * Display-only fallback for resources written before the `availability`
 * column existed (every row from 0002_resources_seed.sql). Never writes back
 * to the row — it only decides how the report should *label* a resource that
 * the catalogue itself never classified.
 *
 * A row with no URL and no stored availability is a book/framework/template
 * reference, not something a founder can click into — showing it as
 * "actionable" would be a lie the UI is telling on the catalogue's behalf.
 */
export function inferDisplayAvailability(resource: ResourceRow): ResourceAvailability {
  if (resource.availability) return resource.availability;
  return resource.url ? "actionable" : "reference_only";
}

export const RESOURCE_AVAILABILITY_LABEL: Record<ResourceAvailability, string> = {
  actionable: "바로 활용 가능",
  reference_only: "참고 자료",
  needs_verification: "이용 조건 확인 필요",
};
