# Project menu actions (workspace header)

## Goal

The project-name dropdown in the workspace header has three items that do
nothing: Project Settings, View Repository, Switch Project. Make all three work.

## Skills / code read

- AGENTS.md section 3 (reuse shadcn, no restyle, responsive)
- `client/components/workspace/workspace-header.tsx`: the items have no handlers.
- `client/components/workspace/workspace-client.tsx`: owns `initialProject` and `handleTabChange` (opens the code/settings panels).
- `client/components/ui/dropdown-menu.tsx`: exports `DropdownMenuSub`, `DropdownMenuSubTrigger` and `DropdownMenuSubContent`.
- `client/lib/api/projects.ts`: `projectsAPI.list({ page, limit })`. The server excludes deleted projects and scopes the list to the user.
- `client/components/workspace/settings-sidebar.tsx`: the right-panel Settings view.
- Routes: `/project/[id]` (workspace), `/home/projects` (all projects), `/home` (new project prompt).

## Decisions

1. **Switch Project** becomes a submenu in the same dropdown:
   - Up to 8 of your other projects, fetched with TanStack Query only when the submenu opens.
   - Each one opens `/project/{id}`.
   - Then a separator, "All projects" (opens `/home/projects`) and "New project" (opens `/home`).
   - States: loading (skeleton rows), empty ("No other projects"), error ("Couldn't load projects").
2. **Project Settings** opens the existing Settings panel on the right, the same thing the header's Settings tab does. No new settings page.
3. **View Repository** opens the project's GitHub repo in a new tab (`noopener,noreferrer`). Before the first deploy there is no `repo_url`, so the item is disabled and shows "Available after deploy".
4. Visual style is unchanged: the same dropdown, icons and spacing.
5. Branch: `feature/env-var-card` (still open, not merged), as its own commit.

## Files

- `client/components/workspace/workspace-header.tsx`
- `client/components/workspace/workspace-client.tsx` (pass `projectId`, `repoUrl`, `onOpenSettings`)

## Security

- The project list comes from the ownership-scoped API. Navigation uses ids from that response only.
- The external link uses the stored `repo_url`, opened with `noopener,noreferrer`.

## Acceptance / test

1. Open a project and click the project name, then Switch Project. The submenu lists your other projects. Click one and it opens.
2. "All projects" goes to the projects page. "New project" goes to Home.
3. Project Settings opens the Settings panel.
4. View Repository is disabled on a project that was never deployed. On a deployed project it opens GitHub in a new tab.
5. At phone width, the menu and submenu stay usable.

Checks: `npm run lint`, `npm run build`.
