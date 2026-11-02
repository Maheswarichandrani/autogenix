# Fix: client ESLint errors

## Goal

Bring `npm run lint` in `client/` to 0 errors with no visible or behavioural change. It currently reports 33 errors and 42 warnings across the workspace. The 33 errors are in 11 files.

Out of scope: the 42 warnings, refactors, removing the duplicated markdown code, and any UI change.

## Skills read

- `AGENTS.md` sections 2, 3, 13. No project skill covers ESLint, so the installed packages are the reference (section 4).

## Code inspected

Lint results by rule:

| Rule | Count | Files |
| --- | --- | --- |
| `@typescript-eslint/no-explicit-any` | 28 | `components/workspace/markdown-content.tsx` (8), `components/workspace/streaming-markdown.tsx` (8), `hooks/use-voice-recording.ts` (5), `lib/streaming-debug.ts` (3), `lib/api/fetch.ts` (2), `types/project.ts` (2) |
| `react-hooks/set-state-in-effect` | 3 | `components/code-editor/monaco-editor-wrapper.tsx:184`, `components/home/theme-toggle.tsx:20`, `components/workspace/workspace-prompt-input.tsx:72` |
| `react-hooks/purity` | 1 | `components/ui/sidebar.tsx:611` |
| `react/no-unescaped-entities` | 1 | `app/home/projects/page.tsx:43` |

Facts that shape the fixes:

- `react-markdown@10.1.0` has no `inline` prop and no references to it in `lib/index.js`. Today `inline` is always `undefined`, so `!inline && match` means the same as `match`.
- The `components` prop is typed by `Components` in `react-markdown`, so removing `: any` gives contextual types with no new import.
- `typescript@5.9.3` `lib.dom.d.ts` has `SpeechRecognitionResultList` but no `SpeechRecognition` or `SpeechRecognitionEvent`, and `@types/dom-speech-recognition` is not installed.
- `app/home/projects/page.tsx:154` renders `project.stack?.framework`, so `Record<string, unknown>` would fail type checking.
- `streamingDebug.sse`, `.store`, and `.render` have no callers in `app`, `components`, `hooks`, `lib`, or `providers`.
- `SidebarMenuSkeleton` is not used outside `components/ui/sidebar.tsx`.

## Decisions and assumptions

1. **Markdown (`markdown-content.tsx`, `streaming-markdown.tsx`):** remove every `: any` and rely on contextual types. Remove `inline` from `code` and use `match ?`. Remove `{...props}` from `SyntaxHighlighter`, because `ref` and `style` from a `<code>` do not fit its props, and react-markdown passes a fenced block only `className`, `children`, and `node`. Keep `{...props}` on the inline `<code>`.
2. **Voice (`use-voice-recording.ts`):** add small local interfaces for the part of the Web Speech API the hook uses. Do not add a dependency.
3. **`fetch.ts`:** replace both casts with one local type, `{ detail?: string; error?: string }`. Runtime is unchanged.
4. **`streaming-debug.ts`:** `event: { type: string }`, and `state` and `props` become `unknown`. The file stays, despite having no callers.
5. **`types/project.ts`:** add `ProjectStack = { framework?: string; [key: string]: unknown }` and use it in both places.
6. **Mounted flag (`monaco-editor-wrapper.tsx`, `theme-toggle.tsx`):** replace `useState` plus `useEffect` with `useSyncExternalStore(subscribe, () => true, () => false)`. It is `false` during server render and hydration, then `true`, matching today's hydration behaviour. Both files keep their own short version, because a shared hook for one line is not needed.
7. **`workspace-prompt-input.tsx`:** keep the effect and add `// eslint-disable-next-line react-hooks/set-state-in-effect` with a reason. Reading `localStorage` once and clearing it is a real sync with an external system, and it cannot run during server render. This is the only intended suppression.
8. **`sidebar.tsx`:** swap `useMemo` for a lazy `useState(() => ...)` initializer. The random width behaves the same. If the rule still fires, use a commented `eslint-disable` instead of a fixed width, because a fixed width changes the UI.
9. **`projects/page.tsx`:** `'s` becomes `&apos;s`.

Assumption: `next build` and `tsc` pass today. If `tsc` reports errors, I will separate existing errors from new ones and report both.

## Files to touch

The 11 files above. No new files, no dependency changes, no server changes.

## Requirements

1. No `any` remains in these files, and no `as unknown as` workaround is added.
2. No class names, layout, or markup change, other than the `{...props}` removal in decision 1.
3. Warnings are left alone, including those in touched files.

## Security considerations

- Markdown links keep `target="_blank"` and `rel="noopener noreferrer"`.
- `fetch.ts` error handling behaves the same at runtime, and no auth or token code changes.
- Assistant markdown is untrusted content. Dropping `{...props}` from the highlighter passes it less.

## Acceptance criteria

- `npm run lint` reports 0 errors. The warning count stays at 42 or lower.
- `npx tsc --noEmit` and `npm run build` report no new errors.
- Fenced code blocks still highlight, and inline code still uses the muted pill style.

## Checks to run

In `client/`:

1. `npm run lint`
2. `npx tsc --noEmit`
3. `npm run build`

Real output is reported, including anything that still fails.

## Manual test steps

1. Sign in at http://localhost:3000/login.
2. Open the projects page and confirm the heading reads `<name>'s projects`.
3. In settings, change color mode and confirm the theme changes.
4. Open a project, then confirm the code editor follows the theme and no hydration warning appears in the browser console.
5. Create a new project from the home prompt and confirm the prompt text fills the workspace input.
6. Ask for something containing a code block and `inline code`, then confirm both render as before.
7. Click the microphone, speak, and confirm text appears. Saying "stop" should end recording.
