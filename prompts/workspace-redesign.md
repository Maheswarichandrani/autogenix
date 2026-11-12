# Workspace redesign (chat + code panel)

## Goal

Rebuild the `/project/[id]` workspace to match the four reference screenshots the user supplied, down to the small details. Keep the existing colour tokens and dark/light theme (`globals.css`). The only typographic change is a serif font for agent reply text.

Branch: `feature/workspace-redesign`, from `develop` (`d6af8b2`).

## Reference (what the screenshots show)

1. **Empty and working state, no code panel.**
   - Header: a sidebar-toggle icon, the project name with a chevron, and "Share" (upload icon) on the far right. A thin bottom border.
   - Chat column: centred, about 960px wide.
   - User message: a right-aligned bubble with a rounded-xl muted background, about 16px text, and no avatar or label.
   - Live status line: a small pulsing dot, then "Reading a file", an elapsed time "5s", and a ›.
   - Input:
     - A rounded box: "+" on the left, "Write a message…", and a send/stop control on the right.
     - Below it, a muted disclaimer on the left, and a product label on the right ("Autogenix 2.0" here, per the user).
2. **Code panel open (split).**
   - Chat on the left, keeping its own header but without Share. A thin divider.
   - Code panel on the right:
     - Header: an eye/code segmented toggle, then "Resume · JSX" (file name, then the language in muted text).
     - On the right of the header: a "Copy" split button with a ▾, an expand icon and a close ×.
   - Editor: line numbers, wrapped lines (no number on continuation lines), no tree, tabs or status bar.
   - Collapsed step summary: "Read a file, read memory, and 2 more tools ›", in muted text.
   - Agent reply text: serif, about 17px, relaxed leading. Inline code is mono on a subtle pill. Headings are bold. Lists are spaced.
   - A round "↓" scroll-to-bottom button floats above the input when you have scrolled up.
3. **Finished reply.**
   - A code card (rounded-xl, muted background, max about 650px): an icon tile with `</>`, a title, and "Code · JSX" in muted text.
   - Under the reply, an action row of small muted icons: copy, read aloud, thumbs up, thumbs down, retry.
4. **Code panel close-up.** Syntax colours come from the existing Monaco theme. The header spacing is as described in 2.

## Skills / code read

- AGENTS.md §3 (reproduce exactly, reuse shadcn, responsive), §5 (contract files), §11 (streaming), §12 (`flushSync` only on high-frequency events).
- Client:
  - `components/workspace/workspace-client.tsx` (always-on resizable split), `workspace-header.tsx` (logo, tabs, Deploy, Share are `console.log`), `workspace-chat.tsx` (always auto-scrolls; Bot empty state).
  - `user-message.tsx`, `assistant-message.tsx` and `streaming-message.tsx` (avatars, bubbles, step feed in a box), and `components/step-feed.tsx`.
  - `workspace-prompt-input.tsx` (attach menu, settings, mic, send), `preview-sidebar.tsx` (file tree, tabs, status bar, mock data fallback), `right-sidebar.tsx`, `store/right-sidebar-store.ts`, `store/code-stream-store.ts`.
  - `components/code-editor/monaco-editor-wrapper.tsx` (word wrap on, line numbers on).
  - `components/home/app-sidebar.tsx`, `components/ui/sidebar.tsx`, `app/home/layout.tsx` (the sidebar exists only under `/home`). `app/layout.tsx` (Urbanist + JetBrains Mono via `next/font`).
- Server:
  - `agents/react.py`: each tool call publishes `step`, `tool_call` and `tool_result`, and appends `{tool, input, output}` to `tool_calls_log`.
  - `agents/workflow.py`: `_msg()` builds `messages_to_save`, the `verify_node`, and the `run_react_agent` call sites.
  - `tasks/build_worker.py`: already saves `msg["metadata"]` to `Message.metadata_`.
  - `api/routes/v1/message_routes.py`: `_serialise` already returns `metadata`.
  - `core/llm.py`: the agents run `claude-sonnet-5-5` at effort `medium`.

## Decisions

### Layout and header

1. **No code panel:** a single centred chat column (`max-w-[960px]`), with the header above it.
2. **Code panel open:**
   - The page splits with the existing `ResizablePanelGroup`, defaulting to 50/50 with a thin divider.
   - The workspace header becomes the chat column's header and drops Share.
   - The panel has its own header.
   - Below `md`, the panel opens full-screen over the chat, and × returns to the chat.
3. **Header.**
   - Contents: sidebar toggle, project name ▾ (the existing dropdown with Settings / View Repository / Switch Project, unchanged), and Share.
   - The logo, the Code/Settings tabs and the Deploy button are removed. Deploy keeps happening through the deploy card. Code opens from the code card; Settings opens from the project menu.
4. **Sidebar toggle:** opens the existing `AppSidebar` in off-canvas mode (closed by default). The project page is wrapped in `SidebarProvider` with `defaultOpen={false}`.
5. **Share:** a small menu:
   - "Copy live URL", which needs `latest_deploy_url`.
   - "Copy repository link", which needs `repo_url`.

   Both are disabled with "Available after deploy" until set. Copying shows a toast.

### Messages

6. **User message:** a right-aligned bubble (`bg-secondary`, `rounded-xl`, `px-5 py-3`, `text-base`, `max-w-[80%]`). No avatar, "You" label or timestamp tooltip.
7. **Agent message.**
   - No avatar, role label or bubble.
   - Text uses a new `font-serif` (`Source_Serif_4` via `next/font`, exposed as `--font-serif`) at `text-[17px] leading-relaxed`.
   - Markdown styling matches the reference: bold headings, spaced lists, and inline code as a mono pill (`bg-muted rounded px-1.5`).
   - Code blocks keep the current highlighter.
   - The deploy card is unchanged.
8. **Step summary.**
   - Above each agent message's text, a muted line such as "Wrote 3 files, ran 2 commands, and 1 more tool ›".
   - A pure function maps tool names to phrases: write/read file, ran a command, sent a request, ran a security scan, listed files, deploy step. Counts are pluralised. The first two groups are named, then "and N more tools". Sentence case.
   - Clicking expands the step rows, restyled flat: status text, ✓/✗ and the expandable input/result, without the boxed container.
9. **Live state.**
   - Before the reply text, a single line shows a pulsing dot in the existing `primary` colour (the reference's orange is replaced, because colours stay), the current step or thinking text, an elapsed-seconds counter for the current step, and a ›.
   - › expands the live step list.
   - Once text streams, the line becomes the step summary (8).
10. **Code card.**
    - Shown under the latest Artificer message when the project has files.
    - Contents: an icon tile `</>`, the title (the project name), and "Code · N files".
    - Click opens the code panel on the project's main file.
11. **Message actions,** under the last agent message of each turn (the run of agent messages before the next user message). Small muted icons:
    - Copy: the turn's text, without markers.
    - Read aloud: browser `speechSynthesis`. Clicking again stops it. Hidden if the browser lacks it.
    - Thumbs up / down: toggleable, stored only in this browser (`localStorage`, keyed by message id, `try/catch`). Nothing is sent to the server.
    - Retry: re-sends the turn's user message. Only on the latest turn, and disabled while a build runs. It starts a new build, so the tooltip says so.
    - Tooltips on every icon.
12. **Scroll.**
    - Auto-scroll only when already near the bottom (within 120px).
    - Otherwise show a round ↓ button centred above the input, which scrolls to the bottom.
13. **Empty state:** the reference has none, so the chat stays empty with just the input. The Bot "Start Building" block is removed.

### Input

14. **Layout.**
    - Rounded-2xl box with the existing `secondary` background and a border.
    - Left: "+" opens a menu with "Attach files" and "Add image", both disabled and marked "Coming soon". The backend has no attachments yet.
    - Textarea with placeholder "Write a message…".
    - Right: a send ↑ button when there is text. While a build runs, a stop ■ that is disabled, with the tooltip "Stopping a running build isn't supported yet". Mid-flight cancel does not work (AGENTS §12).
    - No mic, waveform or settings icons, per the user.
15. **Below the box:**
    - Left: "Autogenix is AI and can make mistakes. Please double-check responses."
    - Right: "**Autogenix 2.0**" (user's choice; it replaces the reference's "Sonnet 5.5 Medium"). It comes from one client constant.
16. **Existing behaviour** is kept: Enter sends, Shift+Enter makes a new line, auto-resize, and the initial-prompt autofill.

### Code panel

17. **Header.**
    - An eye/code segmented toggle.
    - The title "main.py · Python" doubles as a file switcher: clicking it lists the project's files.
    - On the right:
      - Copy (copies the file), with ▾ for "Download file".
      - Expand, which hides the chat and gives the panel the full width. Clicking again restores the split.
      - ×, which closes the panel.
18. **Editor:** Monaco (existing wrapper and theme), read-only, line numbers, word wrap, no minimap. The file tree, tabs, status bar, welcome screen and mock-data fallback are removed from this view. The tree logic stays in the store.
19. **Preview (eye)** shows the app's API docs in an iframe at `<base>/docs`.
    - The base URL is `latest_deploy_url` when the project is deployed.
    - Otherwise it is the sandbox URL from a new `app_ready` event, so it works only during the session while the container runs.
    - Otherwise the panel shows "The app isn't running. Preview appears while a build runs or after deploy."
    - The panel always has "Open in new tab". If the app sends `X-Frame-Options`, the frame is blank, and the link still works.
20. **Settings** (from the project menu) opens in the same right panel, using the same header style with the title "Settings" and ×. The settings content is unchanged.

### Backend (small, no schema change)

21. **Save the steps.**
    - `react.py` adds `status` (the existing step text) and `is_error` to each `tool_calls_log` entry.
    - `workflow.py` `_msg()` takes an optional `steps` and stores `metadata = {"steps": [...]}`. At most 60 steps; each keeps `tool`, `status`, `is_error`, `input` (the existing `_safe_preview`, at most 300 characters) and `result` (at most 500 characters).
    - These are exactly what the browser already receives live. Deploy secrets never enter tool inputs (AGENTS §12).
    - Call sites pass their `tool_log`.
22. **`app_ready` event.**
    - `verify_node` publishes `{"type": "app_ready", "url": app_url}` on `project:{id}:stream` when the app starts.
    - The client stores it in the workflow store (session only).
    - Add `app_ready` to `client/types/workflow.ts`, and to `server/app/schemas/enums.py` if events are listed there, in the same commit (AGENTS §5).
23. **Old messages** without `metadata.steps` simply show no summary line.

### Clean-up

- Remove the components this replaces once nothing imports them: `step-feed.tsx` (moves into the new step list), `preview-sidebar.tsx` (replaced by `code-panel.tsx`), and `workflow-ideal-state` if unused.
- Unused `code-editor` pieces stay unless only these used them.

## Files (expected)

- Client:
  - `app/project/[id]/page.tsx` and `app/layout.tsx` (serif font).
  - `components/workspace/`: `workspace-client.tsx`, `workspace-header.tsx`, `workspace-chat.tsx`, `user-message.tsx`, `assistant-message.tsx`, `streaming-message.tsx`, `chat-message-item.tsx`, `markdown-content.tsx`, `streaming-markdown.tsx`, `artifact-card.tsx`, `workspace-prompt-input.tsx` and `right-sidebar.tsx`.
  - New in `components/workspace/`: `code-panel.tsx`, `code-card.tsx`, `step-summary.tsx`, `message-actions.tsx`, `scroll-to-bottom.tsx`.
  - `lib/step-summary.ts` (pure).
  - `store/right-sidebar-store.ts` (expanded mode), `store/workflow-store.ts` and `hooks/use-workflow.ts` (`app_ready`), and `types/workflow.ts`.
- Server: `agents/react.py`, `agents/workflow.py`, and `schemas/enums.py` if needed.

## Security

- The persisted steps are the same truncated previews already streamed to the browser. No secrets, and ownership is unchanged (messages are fetched through the ownership-checked route).
- The preview iframe:
  - Loads only the project's own deploy URL or its sandbox URL from the worker, never a user-typed URL.
  - Uses `sandbox="allow-scripts allow-same-origin allow-forms"` and `referrerPolicy="no-referrer"`. The generated app is untrusted, and the frame is cross-origin to the app.
- Read aloud and thumbs stay in the browser.
- Copy uses the clipboard API on user click only.

## Acceptance

1. A project with no code panel looks like screenshot 1: header, centred column, user bubble, live status line with timer, input and footer line.
2. Opening the code card splits the view like screenshot 2/4. The panel header has toggle, file name · language, Copy ▾, expand and ×. The editor wraps lines with line numbers.
3. A finished reply looks like screenshot 3: serif text, code card, and action row (copy, read aloud, thumbs, retry).
4. Step summaries show live and after reload, and expand to the step rows.
5. ↓ appears when scrolled up, and auto-scroll does not yank you down while you read.
6. Preview shows `/docs` for a running or deployed app, otherwise the "isn't running" note.
7. Sidebar toggle opens the app sidebar. Share copies the deploy/repo links after deploy, and is disabled before.
8. At 375px wide: one column, the panel opens full-screen, and there is no horizontal scroll. Light and dark both look right with the existing tokens.
9. Nothing removed is still referenced, and the deploy card still works.

## Checks

- `client/`: `npm run lint`, `npm run build`.
- `server/`: `python -c "from app.main import app"`.
- Pure-function cases for `lib/step-summary.ts` (empty, one, many, plural, "N more").
- Pipeline: one in-process build, confirming the agent messages carry `metadata.steps` and that `app_ready` is published.
- Visual: run the app and compare each screenshot state side by side, at desktop and at 375px.

## Manual test

1. Start Redis, Celery, FastAPI and Next.js, and open a project.
2. Send "build me a small FastAPI notes API with JWT auth".
3. While it runs, check:
   - The status line shows a pulsing dot, the step text and a counting timer.
   - › expands the steps.
   - Scrolling up shows ↓, and the chat does not jump.
4. When it finishes, check:
   - Replies are in serif.
   - Each reply has a step summary.
   - The code card is under the Artificer reply.
   - The action row works: copy, read aloud, thumbs, and retry is disabled while busy.
5. Click the code card and check:
   - The split view opens.
   - The file switcher, Copy, ▾ Download, expand and × all work.
   - The eye shows the API docs.
6. Reload the page. The summaries, card and messages are all still there.
7. Use the sidebar toggle, the project menu (Settings opens the right panel) and Share (disabled until deploy).
8. Shrink to phone width and repeat steps 3 to 5.
