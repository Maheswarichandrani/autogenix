# Change: show the welcome dialog before `/home`

Replaces the display approach in `prompts/login-welcome-dialog.md`. The dialog content stays the same.

## Goal

After sign-in, the success dialog appears on its own screen, with no `/home` page behind it. The user then goes to `/home`.

## Skills read

- `AGENTS.md` sections 2, 3, 5, 13.

## Code inspected

- `client/components/home/welcome-dialog.tsx`: current dialog, driven by `?welcome=1`.
- `client/app/home/page.tsx`: renders the dialog inside `Suspense`.
- `client/app/(auth)/login/page.tsx`: background layers and `redirectTo`.
- `client/app/getting-started/page.tsx`: pushes `/home?welcome=1` after onboarding.
- `client/proxy.ts`: signed-out users are sent to `/login`, and users who have not finished onboarding are sent to `/getting-started`, for any protected route.

## Decisions and assumptions

1. **New route:** `/welcome`, a protected page. `?welcome=1` is removed.
2. **Background:** the same gradient and grid layers as `/login`, so sign-in flows into one look. No sidebar or header.
3. **Leaving the screen:** "Continue" goes to `/home` at once. If the user does nothing, it goes there after 4 seconds, because you asked for it to redirect after the message. Escape and clicking outside also go to `/home`.
4. **Back button:** `router.replace("/home")` keeps `/welcome` out of history, so Back does not return to it.
5. **Close button:** hidden with `showCloseButton={false}`, since Continue is the single action.
6. **New users:** the proxy sends them to onboarding first, then onboarding pushes `/welcome`, so they see it once at the end.
7. **Direct visits:** opening `/welcome` by hand shows the screen again. It only greets a signed-in user, so this is accepted.
8. **Reduced motion:** the existing `motion-reduce` classes stay.

## Files to touch

- `client/app/welcome/page.tsx`: new page with the background and dialog.
- `client/components/home/welcome-dialog.tsx`: remove `useSearchParams`, add the timer, and call `router.replace("/home")`.
- `client/app/home/page.tsx`: remove the dialog and `Suspense`.
- `client/app/(auth)/login/page.tsx`: `redirectTo: "/welcome"`.
- `client/app/getting-started/page.tsx`: `router.push("/welcome")`.

`client/proxy.ts` needs no change, because its existing rules already protect the new route.

## Requirements

1. The timer is cleared on unmount and cannot cause a second redirect.
2. `/home` never shows the dialog.
3. Light and dark themes and mobile width work.

## Security considerations

- `/welcome` stays behind the proxy, so a signed-out visit goes to `/login`.
- No token or secret reaches the page. The name is rendered as text.

## Acceptance criteria

- After sign-in, the dialog shows on the `/welcome` screen with no sidebar or `/home` content behind it.
- "Continue" reaches `/home` at once, and doing nothing reaches it after 4 seconds.
- Back from `/home` does not return to `/welcome`.
- A signed-out visit to `/welcome` goes to `/login`.
- A new user sees onboarding first, then `/welcome`, then `/home`.

## Checks to run

In `client/`: `npm run lint`, `npx tsc --noEmit`, and `npm run build`, because a route is added.

## Manual test steps

1. Sign out, then sign in at http://localhost:3000/login.
2. Confirm the dialog shows on a plain background.
3. Click "Continue" and confirm `/home` opens with no dialog.
4. Sign in again, wait 4 seconds, and confirm it moves to `/home`.
5. Press Back from `/home` and confirm `/welcome` does not return.
6. Check dark mode, light mode, and mobile width.
