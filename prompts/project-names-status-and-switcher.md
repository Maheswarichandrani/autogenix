# Clearer project list: short names, status dots, one switcher

## Goal

A friend found the sidebar list confusing. Four fixes the user approved:

1. Short project names.
2. The section is labelled "Projects".
3. A status dot on each row.
4. One place to switch projects.

## Code read

- `server/app/repositories/project_repo.py` `create()`:
  - It calls `get_llm("llama-3.1-8b")` **inside the API request** to invent a name.
  - When that fails, the name falls back to `"Project for: <first 50 chars>..."`, and every recent project got that.
  - It also breaks AGENTS §5: model calls belong in the worker, never in FastAPI.
- The Conductor (worker) already reads the first message and calls `start_build` / `respond_to_user`.
- `build_worker._finalise_build()` sets `Build.status` to `completed` or `failed`. It sets nothing while a build waits at the deploy card; that build stays `building`.
- A deploy card waiting for the user is an `env_var_request` / `connect_railway` Artifact with `content.status == "pending"`.
- `GET /projects` returns `ProjectResponse` (no status beyond `active`/`deleted`).
- The sidebar (`sidebar-recents.tsx`) shows the label "Recents". The header project menu has a "Switch Project" submenu (`header/project-menu.tsx`).

## Decisions

### 1. Short names, made by the Conductor (worker)

- `create()` stops calling a model. A new project gets the placeholder name **"New project"**, and its description is the user's prompt.
- Both Conductor tools get an optional `project_title` argument: 3–5 words, Title Case, no quotes or emoji (for example "Team Todo API"). The prompt asks for it while the project still has a placeholder name.
- After the Conductor runs, the worker renames the project to `project_title` only while the name is still a placeholder ("New project", "Untitled Project", or starting with "Project for:"). A name the user typed is never changed.
- The title is trimmed to 60 characters. Empty or invalid titles are ignored, and the project keeps its name. A missing title is never an error.
- The sidebar refreshes when the stream reports the Conductor's result, so the new name appears without a reload.

### 2. Label

- The sidebar section "Recents" becomes **"Projects"**.
- The primary nav link "Projects" becomes **"All projects"**, so the two don't clash.

### 3. Status dot (server-computed, no schema change)

- `ProjectResponse` gets `activity: "building" | "awaiting_deploy" | "deployed" | null`, computed in `list_by_user` with one extra query for the listed page:
  - `deployed`: `latest_deploy_url` is set.
  - `awaiting_deploy`: a pending deploy card exists.
  - `building`: the latest build is `building`, has no pending card, and started less than 2 hours ago. A worker crash can leave a build `building` forever, so older ones count as nothing.
  - Otherwise `null`.
- The dots use the existing theme tokens: building = `primary`, pulsing; awaiting_deploy = amber; deployed = emerald; none = muted.
- Each dot has an accessible label and a tooltip ("Building", "Waiting for deploy", "Deployed").
- The list refreshes on `stage_change`, `done`, `build_failed` and `close_stream` events of the open project.

### 4. One switcher

- Remove the "Switch Project" submenu and its project query from `header/project-menu.tsx`. Project Settings and View Repository stay.
- The sidebar is the only switcher, and it is one click away from the header toggle.

### 5. Existing projects (see the question)

- Option: a one-off script, run once in the worker environment, gives each project whose name is still a placeholder a short title from its first user message, using the Conductor's model. Names a person typed are untouched.

## Files

- Server:
  - `repositories/project_repo.py` (no model call; placeholder; `activity` in the list).
  - `schemas/project_schemas.py` (`activity`).
  - `agents/workflow.py` (Conductor prompt and tools: `project_title`; state carries it).
  - `tasks/build_worker.py` (rename after the Conductor; publish a `project_renamed` event).
- Client:
  - `components/home/sidebar/sidebar-recents.tsx` (label, dots).
  - `components/home/app-sidebar.tsx` (nav label).
  - `components/workspace/header/project-menu.tsx` (remove the switcher).
  - `hooks/use-workflow.ts` (invalidate the list on events).
  - `types/project.ts` and `types/workflow.ts` (`activity`, `project_renamed`, in the same commit as the server enums per AGENTS §5).

## Security

- Renaming touches only the project the worker is already running, by id, and only while it has a placeholder name.
- `activity` is computed inside the ownership-scoped list query.
- The title comes from the model, is shown as text (React escapes it), is length-capped and is stripped of control characters.

## Acceptance

1. A new project shows "New project" for a moment, then a short name after the first message, without a reload.
2. A user-named project keeps its name.
3. Sidebar rows show the right dot: building (pulsing), waiting for deploy, deployed, or none. Each has a tooltip.
4. The section reads "Projects", and the nav link reads "All projects".
5. The header project menu has no Switch Project.
6. Checks pass: lint and build, the server import, and a real in-process build that verifies the rename and the `activity` values.

## Result of the one-off rename (run 2026-11-12, user approved)

Six placeholder-named projects got short titles from their first message, for example "Project for: Build a full-stack team todo app…" became "Team Task Management Platform". Names a person typed were untouched.
