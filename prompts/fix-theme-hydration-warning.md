# Fix: hydration attribute mismatch on `<html>`

## Goal

Remove the console error "A tree hydrated but some attributes of the server rendered HTML didn't match the client properties".

## Skills read

- `AGENTS.md` sections 2, 3, 13. No project skill covers `next-themes`, so its README is the reference.

## Code inspected

- `client/app/layout.tsx`: renders `<html lang="en">` and wraps the app in `ThemeProvider attribute="class" defaultTheme="dark" enableSystem`.
- Server HTML for `/login`: `<html lang="en">`, with no theme class.
- The page ships the `next-themes` inline script, which sets the theme class and `color-scheme` on `<html>` before React hydrates.
- `node_modules/next-themes/README.md` (v0.4.6), lines 83 and 95: add `suppressHydrationWarning` to `<html>`, or you get warnings because `next-themes` updates that element.

## Root cause

The theme script changes `<html>` attributes before hydration, so React sees attributes that differ from the server HTML. This happens on every page and is expected behaviour for `next-themes`.

## Decision

- Add `suppressHydrationWarning` to `<html>` in `client/app/layout.tsx`.
- It only applies one level deep, so real mismatches in `<body>` or below are still reported.

## Files to touch

- `client/app/layout.tsx`: one attribute.

## Security considerations

None. The change only affects a development warning.

## Acceptance criteria

- The error no longer appears on `/login`, `/home`, or a project page.
- Theme switching still works.

## Checks to run

In `client/`: `npm run lint` and `npx tsc --noEmit`.

## Manual test steps

1. Hard-refresh http://localhost:3000/login and `/home`, then check the console for the error.
2. Toggle the theme in settings.
3. If an error remains, copy the diff lines from the Next.js overlay. Those point to a different, real mismatch.
