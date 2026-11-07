# Feature: welcome dialog after sign-in

## Goal

After sign-in, show a small animated dialog on `/home` confirming the login and inviting the user to continue. It appears only after a real sign-in, not on every visit to `/home`.

## Skills read

- `AGENTS.md` sections 2, 3, 5, 12, 13. No project skill covers this. shadcn components and Next.js 16 patterns already in the repo are the reference.

## Code inspected

- `client/app/(auth)/login/page.tsx:38`: `signIn("github", { redirectTo: "/home" })`.
- `client/proxy.ts:25-31`: a user who has not finished onboarding is redirected to `/getting-started`, which drops any query string.
- `client/app/getting-started/page.tsx:94`: `router.push("/home")` after onboarding.
- `client/proxy.ts:11-16`: a signed-in user visiting `/login` or `/` is sent to `/home` with no query string.
- `client/app/home/page.tsx`: a server component, so the dialog is added as a client child.
- `client/app/layout.tsx:38`: `SessionProvider` wraps the app, so `useSession` works.
- `client/components/ui/dialog.tsx`: installed shadcn dialog with `showCloseButton`.
- `client/app/globals.css:2`: `tw-animate-css` is already imported, and it is shadcn's standard animation library.

## Decisions and assumptions

1. **Signal:** a `?welcome=1` query parameter. Sign-in redirects to `/home?welcome=1`. It needs no database, cookie, or backend change, and only a real sign-in or onboarding completion sets it.
2. **New users:** the proxy drops the parameter when it sends them to onboarding, so `getting-started/page.tsx` also pushes `/home?welcome=1`. They see the dialog once, after onboarding.
3. **Dismissal:** "Continue", the close button, Escape, and clicking outside all close the dialog and `router.replace("/home")`, so a refresh does not reopen it. A refresh before closing does reopen it, which is harmless.
4. **No auto-close:** the user dismisses it. Timed dialogs can vanish before they are read.
5. **UI:** shadcn `Dialog` and `Button` only, with no new shadcn components or dependencies.
6. **Animation:** a `CheckCircle2` icon from `lucide-react` using `tw-animate-css` zoom and fade classes, on top of the dialog's own open animation. `framer-motion` is not used. `motion-reduce:animate-none` respects reduced-motion settings.
7. **Copy:**
   - Title: `You're signed in` (with the first name: `Welcome, <first name>` if a name exists)
   - Description: `You have successfully logged in. Continue to explore all the features of Autogenix.`
   - Button: `Continue`
8. **Forged URL:** anyone can type `?welcome=1`. It only shows a greeting to a signed-in user, so this is accepted.
9. **Branch:** this depends on onboarding work that is not in `develop` yet. When you ask to commit, I will branch `feature/login-welcome-dialog` from `feature/onboarding-preferences`.

## Files to touch

- `client/components/home/welcome-dialog.tsx`: new client component.
- `client/app/home/page.tsx`: render it inside `<Suspense fallback={null}>`, which `useSearchParams` needs.
- `client/app/(auth)/login/page.tsx`: change `redirectTo` to `/home?welcome=1`.
- `client/app/getting-started/page.tsx`: push `/home?welcome=1`.

No server, proxy, env, or dependency changes.

## Requirements

1. The dialog opens only when `welcome=1` is present.
2. It has a `DialogTitle` and `DialogDescription` for screen readers.
3. It uses theme tokens only, so light and dark both work.
4. It fits mobile width, using the existing `DialogContent` sizing.
5. The prompt input works normally after closing.

## Security considerations

- The name comes from the existing session and is rendered as text, so it is escaped by React.
- No token, secret, or new data reaches the browser.
- The parameter is never used in an auth decision.

## Acceptance criteria

- A fresh sign-in shows the dialog on `/home`.
- A new user sees it after onboarding, not before.
- After closing, the URL is `/home` and a refresh shows no dialog.
- Going to `/home` directly, or to `/login` while signed in, shows no dialog.

## Checks to run

In `client/`:

1. `npm run lint`: still 0 errors, and no new warnings in touched files.
2. `npx tsc --noEmit`
3. `npm run build`: required, because `useSearchParams` needs its Suspense boundary to build.

## Manual test steps

1. Sign out, then sign in at http://localhost:3000/login.
2. Confirm the dialog appears on `/home` with the animated check.
3. Click "Continue", then confirm the URL is `/home` and the dialog stays closed after a refresh.
4. Open `/home` in a new tab and confirm no dialog.
5. Open `/login` while signed in and confirm no dialog.
6. Open `/home?welcome=1`, then close with Escape.
7. Toggle dark and light mode, and check at mobile width.
