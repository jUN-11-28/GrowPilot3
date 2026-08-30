import type { NextConfig } from "next";

/**
 * Server Actions compare the request's `Origin` against the forwarded host as a
 * CSRF guard, and reject on mismatch.
 *
 * The GitHub Codespaces tunnel breaks that comparison: it rewrites `Origin` to
 * the *internal* loopback origin the dev server listens on while
 * `x-forwarded-host` keeps the public forwarding domain. A real request from
 * the browser therefore arrives as
 *
 *   origin:           https://localhost:3000
 *   x-forwarded-host: <codespace>-3000.app.github.dev
 *   referer:          https://<codespace>-3000.app.github.dev/login
 *
 * and every Server Action (signup, login, project create, diagnosis submit, ...)
 * fails with "Invalid Server Actions request." Allow-listing the forwarding
 * domain does nothing — that value never appears in `Origin`. The loopback
 * origin is the one that has to be allowed. The `*.app.github.dev` entries are
 * kept for tunnel/client combinations that forward `Origin` unmodified.
 *
 * See node_modules/next/dist/docs/01-app/03-api-reference/05-config
 * /01-next-config-js/serverActions.md.
 *
 * Scoped to actual Codespaces environments only (`CODESPACES=true` is set by
 * the platform, never present in a real deployment) so this never widens the
 * allow-list in production.
 */
const devPort = process.env.PORT ?? "3000";

const codespacesOrigins =
  process.env.CODESPACES === "true"
    ? [
        `localhost:${devPort}`,
        `127.0.0.1:${devPort}`,
        "*.app.github.dev",
        "*.preview.app.github.dev",
        "*.githubpreview.dev",
      ]
    : [];

const nextConfig: NextConfig = {
  ...(codespacesOrigins.length > 0 && {
    experimental: {
      serverActions: {
        allowedOrigins: codespacesOrigins,
      },
    },
  }),
};

export default nextConfig;
