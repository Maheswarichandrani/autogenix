# Sidebar recents + file cards in chat

## Goal

The user supplied a fifth reference screenshot (the sidebar open, next to a finished reply). Two changes follow from it:

1. **Sidebar.** It lists previous projects ("chats") with the current one highlighted, in this layout, top to bottom:
   - Toggle and brand.
   - Primary actions.
   - A scrollable recents list.
   - The user row at the bottom.
2. **File cards.** Every file an agent writes shows in the chat as a card under that agent's reply (icon tile `</>`, the file name, then "Code · Python"). Clicking a card opens that file in the code panel.

Existing colours and theme are kept.

Branch: `feature/workspace-redesign` (not pushed yet), as a new commit.

## Reference details (screenshot 5)

- **Sidebar header:** a panel-toggle icon, then the product name in large type.
- **Primary items:** icon and label rows (New, Search, Projects, …), about 16px, with roomy rows.
- **Recents:** a group label with ▾ ("Chats and tasks"). Rows are single-line truncated titles, each with a small muted dot. The current row has a filled rounded background. The list scrolls on its own.
- **Footer:** avatar, name and plan, with ▾.
- **Reply area:** the code card (as built) and the action row, unchanged.

## Code read

- `components/home/app-sidebar.tsx`:
  - It is shared by `/home` (icon-collapsible) and the workspace (off-canvas).
  - Its links to Search (`/home/search`), Notifications (`/home/notifications`) and Create Project (`/home/project/new`) are 404s; those routes don't exist.
  - Logout already runs through a confirm dialog.
- `GET /projects`: ownership-scoped, newest-created first, at most 100 per page.
- `useSession()` (next-auth) gives the name and image client-side. It is already used in `welcome-dialog.tsx`.
- `workflow.py` `_steps_metadata`: the saved steps keep only a redacted 300-character input preview. A JWT app's `write_file` input contains "secret", so the preview is `{...sensitive input redacted...}`. File paths therefore can't be recovered from the steps, and need their own field.
- `hooks/use-code-stream.ts`: `file_created` / `file_deleted` events arrive on the code channel while an agent works.
- `chat/code-card.tsx`: today there is one project-level card ("Code · N files") under the latest Artificer reply.

## Decisions

### Sidebar (`components/home/app-sidebar.tsx`, split into small parts under `components/home/sidebar/`)

1. **Header:** a panel-toggle button (`useSidebar().toggleSidebar`) and "Autogenix" in large type. In icon-collapsed mode on `/home`, only the toggle shows.
2. **Primary items:**
   - New project (`/home`).
   - Projects (`/home/projects`).
   - Settings (`/home/settings/general`).

   The three dead links are removed.
3. **"Recents" group**, labelled "Recents" with ▾ to collapse it, and the open state remembered in `localStorage` with `try/catch`.
   - It lists the user's projects newest first (TanStack Query `["projects","recents"]`, 30 items) and links to `/project/{id}`.
   - The current project is highlighted.
   - States: skeleton rows while loading, "No projects yet", and "Couldn't load projects" with Retry.
   - At the end, "All projects →" when more than 30 exist.
   - It is hidden in icon-collapsed mode.
4. **Footer:** the user row (avatar from GitHub, or initials, plus the name) with ▾. The menu holds Settings and Log out, and Log out keeps the existing confirm dialog.
5. **Mobile:** the existing shadcn sheet behaviour. Tapping a recent closes the sidebar.

### File cards (client + small server change)

6. **Server.**
   - `_steps_metadata` also stores `files`: the normalised paths the agent wrote with `write_file`, in order, unique, at most 100. Paths it later deleted are dropped.
   - The paths come from the tool input dict, never the redacted preview.
7. **Client, live.**
   - The workflow store gets `liveFiles: string[]`. It is reset on `agent_start`, and appended when the code stream reports `file_created` (and trimmed on `file_deleted`).
   - `commitInProgress` saves them as `metadata.files`.
   - The code-stream hook forwards those two events to the store.
8. **Cards.**
   - `chat/file-cards.tsx` renders under each agent reply that has `metadata.files` (live replies too). This replaces the project-level card.
   - Each card is the same design as now: icon tile `</>`, the file name as the title, and "Code · {language}" as the subtitle.
   - Cards stack with an 8px gap at the reference width (max 650px).
   - More than 4 files shows the first 4, then "Show N more files" to expand.
   - Click opens the code panel on that file in code view.
   - A file that no longer exists in the project (deleted later) shows a muted "Deleted" note and is not clickable.
9. **Old messages** without `metadata.files` show no cards. The code panel is still reachable from any newer card.

## Files

- `client/components/home/app-sidebar.tsx`, plus new `components/home/sidebar/` parts: `sidebar-brand.tsx`, `sidebar-recents.tsx`, `sidebar-user.tsx`.
- New `client/components/workspace/chat/file-cards.tsx`. `chat/code-card.tsx` is removed.
- `chat/chat-thread.tsx`, `chat/agent-reply.tsx`, `chat/live-reply.tsx`.
- `client/store/workflow-store.ts`, `client/hooks/use-code-stream.ts`, `client/types/workflow.ts` (`metadata.files`).
- `server/app/agents/workflow.py` (`_steps_metadata`).

## Security

- Recents come from the ownership-scoped `GET /projects`. Links use only ids from that response.
- File paths are the workspace-relative paths the code panel already shows. No file content goes into metadata.
- Logout keeps its confirm dialog. No token reaches the browser.

## Acceptance

1. The sidebar shows the brand and toggle, then New project / Projects / Settings, then Recents (current project highlighted, scrollable), then the user row with Settings and Log out.
2. Clicking a recent opens that project. On a phone the sidebar closes.
3. `/home` still works in icon-collapsed mode, with Recents hidden when collapsed.
4. Each reply that wrote files shows one card per file (live and after reload). Clicking a card opens that file in the code panel.
5. More than 4 files collapses behind "Show N more files".
6. Lint and build pass, and a real build saves `metadata.files`.

## Checks

- `client/`: `npm run lint`, `npm run build`.
- `server/`: `python -c "from app.main import app"`. Also run `_steps_metadata` on a sample log that includes a write, a delete and a redacted input.
- Pipeline: one in-process build, confirming that `metadata.files` on the Artificer message lists the written files.

## Manual test

1. Open a project and click the sidebar toggle. Check the recents list and the highlight, then click another project.
2. Open `/home` and collapse the sidebar to icons. Recents should hide, and expanding brings it back.
3. Send a build message. Under the builder's reply, a card should appear for each file. Click one: the code panel opens on that file.
4. Reload the page. The cards should still be there.
5. Check at phone width.

## Addendum (user request mid-build): open projects without the loading screen

Opening a project from the sidebar showed the full-page "Setting up workspace" animation (`app/project/[id]/loading.tsx`) and re-created the sidebar each time.

- New `app/project/layout.tsx` holds `SidebarProvider` (closed by default), `AppSidebar` (off-canvas) and `SidebarInset`, so the sidebar persists across project switches. `page.tsx` renders only the workspace.
- `loading.tsx` becomes a quiet in-place skeleton: the header bar and a composer outline in the workspace's own layout, with no animation screen or text.
- `WorkspaceClient` is keyed by project id. On a project change it closes the right panel, so one project's file never shows in another. The workflow and code stores already reset per project.
