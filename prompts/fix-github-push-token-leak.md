# Fix: GitHub token leak in `push_to_github` (ISSUES_SPEC D1)

## Goal

The user's GitHub OAuth token (scope `repo`) must never enter the sandbox container, a command line, a tool result, the chat stream, or a LangGraph checkpoint during a push. Rewrite `push_to_github` so the push happens from the Celery worker through the GitHub REST API, and the container is only read from.

## Skills read

- `AGENTS.md` sections 5, 7, 9, 12 (sandbox is untrusted; "never place a token where code in the container can read it"; "fix before re-enabling Deployer").
- `docs/PROJECT_REFERENCE.md` §4.2 (two tokens), `docs/ISSUES_SPEC.md` Part D.
- `security-review` will be run on the diff after implementation.

## Code inspected

- `server/app/agents/tools/deploy_tools.py` — `push_to_github` (lines 113-145), `create_github_repo`, module docstring item 5.
- `server/app/core/docker_manager.py` — `exec`, `read_file`, `list_files`, `_snapshot_workspace`, `put_archive` use in `write_file`.
- `server/app/agents/react.py:267` — every tool result (first 500 chars) is published to the browser as `tool_result`, and goes into the agent transcript.
- `server/app/agents/workflow.py:1217-1284` — Deployer prompt calls `create_github_repo` then `push_to_github(clone_url, commit_message)`.

## What is wrong today (three leaks, not one)

1. **Persisted in the container.** `git remote add origin https://<TOKEN>@github.com/...` writes the token into `/workspace/.git/config`. It stays there for the life of the container, readable by the AI-written app and anything it runs.
2. **On a command line.** The token is part of a shell command passed to `docker exec`, so it is visible in `/proc/*/cmdline` to any process in the container while it runs, and in the Docker exec inspect data.
3. **In tool output.** On failure the tool returns `output[:500]`. Git error messages print the remote URL, which contains the token. `react.py` publishes that text to the browser and stores it in the agent transcript (LangGraph checkpoint). The `safe_cmd` variable that was meant to mask it is computed and never used.

The code comment "Use credential helper env var instead of embedding token in URL" is false.

Also found, in the same function:
- `clone_url` comes from the LLM and is not validated, so the token would be sent to any host the model names.
- `commit_message` is interpolated into a shell string inside single quotes, so a quote in it breaks the command (shell injection inside the sandbox).

## Decision

**Push from the worker with the GitHub Git Data API. The token never goes into the container.**

Alternatives rejected:
- *GIT_ASKPASS / env var inside the container:* small change, but the token is still inside the container for the duration of the push, readable via `/proc/<pid>/environ` by any root process (the generated app runs as root). Breaks the AGENTS.md rule.
- *Copy workspace to the worker host and run host `git`:* needs git on the worker, extracts untrusted files onto the host, and a planted `.git` or config can run hooks on the host. Bigger attack surface than the API.

## Design

`push_to_github(clone_url: str, commit_message: str = "AI build") -> str` keeps its name and signature, so the Deployer prompt does not change.

1. **Validate the target.** Parse `clone_url` (or html URL) strictly: `^https://github\.com/<owner>/<repo>(\.git)?/?$`, owner and repo limited to `[A-Za-z0-9._-]`. Anything else returns an error without any network call. Call `GET /user` and require `owner == login` (case-insensitive), so the token only writes to the signed-in user's own repo.
2. **List files inside the container, without the token.** Run `git init -q` (no remote) then `git ls-files -co --exclude-standard -z` in `/workspace`. This honours the generated app's `.gitignore`. If git fails, return a clear error (fail loudly, no silent fallback).
3. **Filter the list** in the worker:
   - reject paths that are absolute or contain `..`;
   - always skip: `.git/`, `node_modules/`, `venv/`, `.venv/`, `__pycache__/`, `app.log`, and `.env` / `.env.*` except `.env.example` (generated apps may write real secrets there);
   - skip files over 5 MB (reported in the result); fail if the total is over 50 MB or there are more than 1,000 files.
4. **Read the bytes** with a new `DockerManager.read_workspace_files(paths: set[str]) -> dict[str, tuple[bytes, bool]]` (content, executable bit). It uses `container.get_archive("/workspace")` and reads the tar **in memory** with `tarfile` streaming mode. Only regular files whose path is in the requested set are read. Symlinks, devices, and anything else are ignored. Nothing is extracted to disk.
5. **Push through the API** (`requests`, token only in the `Authorization` header, 15-30 s timeouts):
   1. `GET /repos/{o}/{r}` → `default_branch`; require `permissions.push`.
   2. `GET /repos/{o}/{r}/git/ref/heads/{branch}` → parent commit sha. If the repo is empty (409 or 404), create the first commit with `PUT /repos/{o}/{r}/contents/{first_file}` (the Git Data API refuses empty repos), then read the ref again.
   3. `POST /git/blobs` per file (base64).
   4. `POST /git/trees` with every file (mode `100755` if executable, else `100644`), **no `base_tree`**, so the tree is exactly the workspace.
   5. `POST /git/commits` with the message, the tree, and the parent, author `Autogenix Build Bot <bot@autogenix.build>`.
   6. `PATCH /git/refs/heads/{branch}` with `force: false`. **No force push.**
6. **Return value** never contains the token: `✅ Pushed N files to https://github.com/o/r (commit abc1234)` plus any skipped files. On error, return only the HTTP status and GitHub's JSON `message` field, not raw exception text, and never request headers.
7. Update the module docstring item 5 to describe what the code actually does.

## Files expected to change

- `server/app/agents/tools/deploy_tools.py` — rewrite `push_to_github`, add small private helpers (`_parse_github_repo_url`, `_filter_push_paths`, GitHub API helper), fix the docstring.
- `server/app/core/docker_manager.py` — add `read_workspace_files`.
- `AGENTS.md` §12 and `docs/ISSUES_SPEC.md` D1 — mark the token-in-remote-URL item fixed.

No schema, frontend, or contract changes.

## Out of scope (separate changes)

- **D2:** `create_github_repo` still reuses an existing repo with the same name. After this change that no longer force-pushes, it adds a normal commit on top, so history is kept. The reuse itself is still D2.
- **D3:** decrypted tokens in `deploy_payload` in LangGraph state.
- **D5:** `procps` / `pkill`.
- The Deployer is still switched off in the graph (E1).

## Security considerations

- Token is used only in HTTPS headers from the worker to `api.github.com`. It is never in argv, env, files, or output in the container.
- The target repo is checked against the authenticated user, so a prompt-injected model cannot push the user's code elsewhere, or use the token against another repo.
- The commit message goes through JSON, not a shell, so the injection is gone.
- Container output (file list, tar) is treated as untrusted: paths validated, regular files only, in-memory parse, size caps.
- `.env` files are not pushed to GitHub.

## Acceptance criteria

1. No string in `deploy_tools.py` builds a URL or shell command containing `github_token`.
2. After a push, `/workspace/.git/config` in the container has no `remote` with credentials, and `grep -r "<token prefix>" /workspace` inside the container finds nothing.
3. A push to an empty new repo and to a repo with one existing commit both succeed, with no force.
4. `clone_url` for a different owner or a non-GitHub host is refused before any network call.
5. `.env`, `node_modules/`, and files listed in the app's `.gitignore` are not in the pushed tree. `.env.example` is.
6. A forced GitHub error (e.g. a bad repo name) returns a message with no token.

## Checks to run

- `cd server; python -c "from app.main import app"`
- `python -c "from app.agents.tools.deploy_tools import get_deploy_tools"`
- Throwaway script in the scratchpad (not committed) exercising `_parse_github_repo_url` and `_filter_push_paths` with good and bad inputs.
- `security-review` on the diff.

## Manual test (the Deployer is off in the graph, so test the tool directly)

This writes to your GitHub account, so you run it, or tell me to run it.

1. Start Docker Desktop. `cd server`, activate the venv.
2. Create an empty private repo in your GitHub account, e.g. `autogenix-push-test`.
3. Run a small script (I will give it to you in the scratchpad) that:
   - starts a `DockerManager` container for the `fastapi` stack;
   - writes `main.py`, `requirements.txt`, `.gitignore` (containing `secret.txt`), `secret.txt`, `.env`, `.env.example`, and `node_modules/x.js`;
   - loads your GitHub token by decrypting `users.github_token_encrypted` for your user;
   - calls `push_to_github.invoke({"clone_url": "https://github.com/<you>/autogenix-push-test.git"})` and prints the result;
   - prints `cat /workspace/.git/config` and the result of `grep -r gho_ /workspace` from inside the container;
   - stops the container.
4. Expect: result `✅ Pushed 4 files ...` (`main.py`, `requirements.txt`, `.gitignore`, `.env.example`), no `[remote` section in the config, grep finds nothing.
5. On GitHub, check the repo has only those 4 files.
6. Run the script again. Expect a second commit on top, not a force push.
7. Call it with `https://github.com/someone-else/repo.git`. Expect a refusal.
8. Delete the test repo.

## Branch

`feature/github-push-token` from `develop`. No commit until you ask.
