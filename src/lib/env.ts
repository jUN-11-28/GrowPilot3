/**
 * Centralised env access so a missing variable fails with a readable message
 * instead of a cryptic runtime error deep inside a client.
 *
 * `NEXT_PUBLIC_*` values are inlined at build time and must be referenced as
 * full literals — never through a computed key.
 */
function required(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(
      `Missing environment variable ${name}. Copy .env.example to .env.local and fill it in.`,
    );
  }
  return value;
}

export function supabaseUrl(): string {
  return required(process.env.NEXT_PUBLIC_SUPABASE_URL, "NEXT_PUBLIC_SUPABASE_URL");
}

/**
 * The publishable key (`sb_publishable_...`), not the legacy `anon` JWT.
 * It is safe in the browser; the secret / service-role key never leaves the
 * server and is not read anywhere in this app.
 */
export function supabasePublishableKey(): string {
  return required(
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  );
}

/** Server-only. Never import this from a Client Component. */
export function geminiApiKey(): string {
  return required(process.env.GEMINI_API_KEY, "GEMINI_API_KEY");
}

/** Overridable so a model rename does not require a code change. */
export function geminiModel(): string {
  return process.env.GEMINI_MODEL || "gemini-3.7-flash";
}
