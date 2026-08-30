/**
 * Step vocabulary shared by the server pipeline and the client progress UI.
 * Kept free of server-only imports so Client Components can use it.
 */
export const PIPELINE_STEPS = [
  "evidence",
  "stage",
  "bottleneck",
  "red_team",
  "synthesis",
  "resource",
] as const;

export type PipelineStep = (typeof PIPELINE_STEPS)[number];

export const STEP_LABEL: Record<PipelineStep, string> = {
  evidence: "Evidence Agent",
  stage: "Stage Diagnoser",
  bottleneck: "Lean Analyst",
  red_team: "Red Team Agent",
  synthesis: "Strategy Synthesizer",
  resource: "Resource Agent",
};
