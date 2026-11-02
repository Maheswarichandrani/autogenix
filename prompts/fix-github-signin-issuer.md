# Fix: GitHub sign-in fails with `error=Configuration`

## Goal

Make "Continue with GitHub" complete sign-in. Today the user approves on GitHub, returns to `/api/auth/callback/github`, and lands on `/api/auth/error?error=Configuration` (HTTP 500).

## Skills read

- `AGENTS.md` sections 2, 7, 12, 13. NextAuth v5 has no project skill, so the installed package source is the reference (section 4).

## Code inspected

- `client/lib/auth.ts:8-16`: the `GitHub()` provider sets client id, secret, and scope. It sets no `issuer`.
- `client/node_modules/@auth/core/lib/actions/callback/oauth/callback.js:34-53`: because the GitHub provider defines real `token` and `userinfo` URLs, Auth.js skips discovery and builds `as = { issuer: provider.issuer ?? "https://authjs.dev", ... }`.
- `client/node_modules/oauth4webapi/build/index.js:2063-2073`: `validateAuthResponse` throws when the callback has an `iss` parameter that differs from `as.issuer`.
- `client/node_modules/@auth/core/lib/utils/providers.js:44-51`: a provider `issuer` adds a `wellKnown` value. The explicit GitHub endpoints are kept.
- Next.js log for the failed callback:
  - `OperationProcessingError: unexpected "iss" (issuer) response parameter value`
  - `"expected": "https://authjs.dev"`
  - `GET /api/auth/callback/github?code=...&iss=https%3A%2F%2Fgithub.com%2Flogin%2Foauth`

Installed versions: `next-auth@5.0.0-beta.30`, `@auth/core@0.41.0`, `oauth4webapi@3.8.5`.

## Root cause

GitHub's callback includes `iss=https://github.com/login/oauth` (the RFC 9207 issuer parameter). With no `issuer` configured, Auth.js compares it against its placeholder `https://authjs.dev`, and the check throws. The failure happens before the token exchange, so the backend `/users/signin` route is never called. Client id, secret, and `AUTH_SECRET` are not the cause.

## Decisions and assumptions

- Set `issuer: "https://github.com/login/oauth"` on the provider, matching the value GitHub sends.
- Keep the `next-auth` version. `5.0.0-beta.32` exists, but whether it fixes this is unverified, and a beta bump is a bigger change than one line.
- Do not disable or bypass the `iss` check. Keeping it is the safer option (see Security).
- Assumption: no discovery request is made, because the `token` and `userinfo` URLs are real. Verified by reading `callback.js:34-35`. The manual test confirms it.

## Files to touch

- `client/lib/auth.ts`: one added line in `GitHub({ ... })`.

No server changes, no env changes, no dependency changes.

## Requirements

1. Add the `issuer` line with a short comment stating why it exists.
2. Change nothing else in `auth.ts`.

## Security considerations

- The issuer check stays on and now compares against GitHub's real issuer, so a callback claiming another issuer is rejected.
- The value is public and contains no secret.
- Scopes, token handling, and the separation of the GitHub token from the session cookie are unchanged.

## Acceptance criteria

- Clicking "Continue with GitHub" and approving leads to the app, not `/api/auth/error`.
- The Next.js log has no `CallbackRouteError` for the callback.
- `POST /api/v1/users/signin` appears in the FastAPI log with status 200.
- `/api/v1/users/me` returns 200 for the signed-in session.

## Checks to run

- In `client/`: `npm run lint`.
- Confirm Next.js hot-reloads the change, and restart `npm run dev` if it does not.
- `npm run build` is not required, because no routes, config, or server components change shape. The lint output is reported as it is.

## Manual test steps

1. Open http://localhost:3000/login in a fresh tab.
2. Click "Continue with GitHub" and approve.
3. Confirm you land on onboarding (first sign-in) or `/home`.
4. Refresh the page and confirm you stay signed in.
