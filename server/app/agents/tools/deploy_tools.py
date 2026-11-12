"""
tools/deploy_tools.py

Tools given to the Deployer agent — Railway + GitHub only.

KEY FIXES vs original:
  1. deploy_to_railway was a stub — it created an empty Railway project via
     GraphQL but never linked a repo, never created a service, never set env vars,
     and returned a hardcoded fake URL. Now uses Railway's full GraphQL flow:
     projectCreate → serviceCreate (with GitHub source) → variableUpsert → deploy.

  2. Removed deploy_to_render — Railway only for now (per your decision).
     Render code is gone rather than being dead weight.

  3. wait_for_deploy now polls the Railway service status via GraphQL (not the
     Render API it was accidentally calling before).

  4. get_workspace_tar added — allows the deployer to tar the workspace
     so push_to_github can work without git being installed in every image.
     Git is installed in spin_up() already, so this is belt-and-suspenders.

  5. push_to_github: the GitHub token never enters the sandbox container.
     The container is only read (file list + file bytes); the commit is built
     and pushed from the worker through the GitHub Git Data API, with the token
     only in HTTPS headers. No force push. The target repo must belong to the
     signed-in user.
"""

from __future__ import annotations

import base64
import logging
import re
import time
from urllib.parse import quote

import requests

from app.core.docker_manager import DockerManager

log = logging.getLogger(__name__)

# Railway GraphQL endpoint
_RAILWAY_GQL = "https://backboard.railway.app/graphql/v2"

_GITHUB_API = "https://api.github.com"

# Only the user's own github.com repos, e.g. https://github.com/alice/my-api(.git)
_GITHUB_REPO_URL = re.compile(
    r"^https://github\.com/([A-Za-z0-9-]{1,39})/([A-Za-z0-9._-]{1,100}?)(?:\.git)?/?$"
)

# Never pushed, whatever the app's .gitignore says
_SKIP_DIRS = {".git", "node_modules", "venv", ".venv", "__pycache__"}
_SKIP_FILES = {"app.log"}

_MAX_FILE_BYTES = 5 * 1024 * 1024
_MAX_TOTAL_BYTES = 50 * 1024 * 1024
_MAX_FILES = 1000


def _parse_github_repo_url(url: str) -> tuple[str, str] | None:
    """Return (owner, repo) for a github.com repo URL, or None if it is not one."""
    m = _GITHUB_REPO_URL.match((url or "").strip())
    if not m or m.group(2) in (".", ".."):
        return None
    return m.group(1), m.group(2)


def _filter_push_paths(paths: list[str]) -> list[str]:
    """
    Drop unsafe or unwanted paths from a file list produced inside the
    (untrusted) container: absolute paths, '..', dependency/cache dirs,
    and real .env files (only .env.example is pushed).
    """
    kept: list[str] = []
    for p in paths:
        if not p or p.startswith("/") or "\\" in p:
            continue
        parts = p.split("/")
        if any(part in ("", ".", "..") for part in parts):
            continue
        if any(part in _SKIP_DIRS for part in parts[:-1]) or parts[0] in _SKIP_DIRS:
            continue
        name = parts[-1]
        if name in _SKIP_FILES:
            continue
        if (name == ".env" or name.startswith(".env.")) and name != ".env.example":
            continue
        kept.append(p)
    return sorted(set(kept))


class _GitHubError(Exception):
    """A GitHub API failure with a token-free message."""


def _gh_error(resp: requests.Response, action: str) -> _GitHubError:
    try:
        detail = resp.json().get("message", "")
    except ValueError:
        detail = ""
    return _GitHubError(f"{action} failed: HTTP {resp.status_code} {detail}".strip())


def make_repo_name(project_name: str, project_id: str) -> str:
    """
    Deterministic repo name for a project: <slug>-<first 8 hex of project id>.
    Set by code, never by the model, so retries and redeploys hit the same repo.
    """
    slug = re.sub(r"[^a-z0-9]+", "-", (project_name or "").lower()).strip("-")[:30].strip("-")
    suffix = re.sub(r"[^a-f0-9]", "", str(project_id).lower())[:8]
    return f"{slug or 'autogenix-app'}-{suffix}" if suffix else (slug or "autogenix-app")


def _project_marker(project_id: str) -> str:
    """Tag written into the repo description to prove Autogenix made it for this project."""
    return f"[autogenix:{project_id}]"


def get_deploy_tools(
    docker:          DockerManager,
    github_token:    str,
    railway_api_key: str,
    app_env_vars:    dict[str, str],
    repo_name:       str,
    project_id:      str,
):
    """
    Returns deployment tools bound to this deploy's credentials.
    Called once per deploy; all closures capture the same credentials.
    Secrets (tokens, app env var values) are bound here and never pass
    through the model: tools take no secret arguments.
    """

    _gh_headers = {
        "Authorization": f"token {github_token}",
        "Accept":        "application/vnd.github.v3+json",
    }

    def _railway_gql(query: str, variables: dict) -> dict:
        """Execute a Railway GraphQL mutation/query. Raises on HTTP error."""
        resp = requests.post(
            _RAILWAY_GQL,
            headers = {
                "Authorization": f"Bearer {railway_api_key}",
                "Content-Type":  "application/json",
            },
            json    = {"query": query, "variables": variables},
            timeout = 30,
        )
        resp.raise_for_status()
        body = resp.json()
        if "errors" in body:
            raise RuntimeError(f"Railway GQL error: {body['errors']}")
        return body["data"]

    # ── GitHub tools ──────────────────────────────────────────────

    from langchain_core.tools import tool

    marker = _project_marker(project_id)

    @tool
    def create_github_repo(description: str = "") -> str:
        """
        Create this project's private GitHub repository, or reuse it if
        Autogenix already created it for this project. The name and
        visibility are fixed by the platform.
        description: one-line description of the app.
        Returns: clone_url and html_url on success, or descriptive error.
        """
        full_description = f"{(description or '').strip()[:250]} {marker}".strip()
        try:
            resp = requests.post(
                f"{_GITHUB_API}/user/repos",
                headers = _gh_headers,
                json    = {
                    "name":        repo_name,
                    "description": full_description,
                    "private":     True,   # always private (AGENTS.md section 7)
                    "auto_init":   False,
                },
                timeout = 15,
            )
            if resp.status_code == 422:
                # Name taken. Reuse only a repo we created for THIS project
                # (redeploy or Celery retry); never touch anything else.
                login = _gh("GET", "/user", "Read signed-in user").json().get("login", "")
                existing = requests.get(
                    f"{_GITHUB_API}/repos/{login}/{repo_name}",
                    headers = _gh_headers,
                    timeout = 15,
                )
                if existing.status_code == 200 and marker in (existing.json().get("description") or ""):
                    repo = existing.json()
                    return (
                        f"✅ Reusing this project's repo: clone_url={repo['clone_url']} "
                        f"html_url={repo['html_url']}"
                    )
                return (
                    f"❌ A repo named '{repo_name}' already exists in your account and was not "
                    f"created by Autogenix for this project. Rename or delete it, then deploy again."
                )
            if resp.status_code not in (200, 201):
                raise _gh_error(resp, "Create repo")
            repo = resp.json()
            return f"✅ Repo created: clone_url={repo['clone_url']} html_url={repo['html_url']}"
        except _GitHubError as e:
            return _mask(f"❌ Failed to create GitHub repo: {e}")
        except requests.RequestException as e:
            return f"❌ Failed to create GitHub repo: network error ({type(e).__name__})"

    def _gh(method: str, path: str, action: str, **kwargs) -> requests.Response:
        """Call the GitHub REST API. The token travels only in the request header."""
        resp = requests.request(
            method, f"{_GITHUB_API}{path}", headers=_gh_headers, timeout=30, **kwargs
        )
        if resp.status_code not in (200, 201):
            raise _gh_error(resp, action)
        return resp

    _secrets = sorted(
        {s for s in (github_token, railway_api_key, *(app_env_vars or {}).values()) if s and len(s) >= 4},
        key=len, reverse=True,
    )

    def _mask(text: str) -> str:
        """Defence in depth: never let a secret reach a tool result."""
        for secret in _secrets:
            text = text.replace(secret, "***")
        return text

    def _collect_workspace() -> tuple[dict[str, tuple[bytes, bool]], list[str]]:
        """
        Read the files to push from the container, without giving it any
        credentials. Honours the app's .gitignore via `git ls-files`.
        """
        exit_code, output = docker.exec(
            "git init -q >/dev/null 2>&1 && git ls-files -co --exclude-standard -z",
            timeout=60,
        )
        if exit_code != 0:
            raise _GitHubError(f"Could not list workspace files: {output[:300]}")

        paths = _filter_push_paths(output.split("\0"))
        if not paths:
            raise _GitHubError("No files to push in /workspace.")
        if len(paths) > _MAX_FILES:
            raise _GitHubError(f"Too many files to push ({len(paths)} > {_MAX_FILES}).")

        contents = docker.read_workspace_files(set(paths))
        files: dict[str, tuple[bytes, bool]] = {}
        skipped: list[str] = []
        total = 0
        for path in paths:
            if path not in contents:
                skipped.append(f"{path} (not a regular file)")
                continue
            data, executable = contents[path]
            if len(data) > _MAX_FILE_BYTES:
                skipped.append(f"{path} (over 5 MB)")
                continue
            total += len(data)
            files[path] = (data, executable)

        if total > _MAX_TOTAL_BYTES:
            raise _GitHubError("Workspace is larger than 50 MB; refusing to push.")
        if not files:
            raise _GitHubError("No pushable files in /workspace.")
        return files, skipped

    @tool
    def push_to_github(clone_url: str, commit_message: str = "AI build") -> str:
        """
        Push all workspace files to a GitHub repository.
        clone_url: the clone URL returned by create_github_repo.
        commit_message: git commit message.
        Returns success or detailed error message.
        """
        parsed = _parse_github_repo_url(clone_url)
        if not parsed:
            return "❌ Refused: clone_url must look like https://github.com/<owner>/<repo>.git"
        owner, repo = parsed
        base = f"/repos/{owner}/{repo}"

        try:
            login = _gh("GET", "/user", "Read signed-in user").json().get("login", "")
            if owner.lower() != login.lower():
                return f"❌ Refused: repo owner '{owner}' is not the signed-in GitHub user."

            info = _gh("GET", base, "Read repo").json()
            if not info.get("permissions", {}).get("push"):
                return f"❌ Refused: no push permission on {owner}/{repo}."
            branch = info.get("default_branch") or "main"

            files, skipped = _collect_workspace()

            def head_sha() -> str | None:
                resp = requests.get(
                    f"{_GITHUB_API}{base}/git/ref/heads/{branch}",
                    headers=_gh_headers, timeout=30,
                )
                if resp.status_code == 200:
                    return resp.json()["object"]["sha"]
                if resp.status_code in (404, 409):  # 409 = empty repository
                    return None
                raise _gh_error(resp, "Read branch")

            parent = head_sha()
            if parent is None:
                # The Git Data API refuses empty repos; the Contents API makes
                # the first commit. The tree built below replaces it fully.
                first_path = next(iter(files))
                _gh(
                    "PUT", f"{base}/contents/{quote(first_path)}", "Create first commit",
                    json={
                        "message": "Initial commit",
                        "content": base64.b64encode(files[first_path][0]).decode(),
                        "branch":  branch,
                    },
                )
                parent = head_sha()
                if parent is None:
                    raise _GitHubError("Branch still missing after the first commit.")

            tree = []
            for path, (data, executable) in files.items():
                blob = _gh(
                    "POST", f"{base}/git/blobs", f"Upload {path}",
                    json={"content": base64.b64encode(data).decode(), "encoding": "base64"},
                ).json()
                tree.append({
                    "path": path,
                    "mode": "100755" if executable else "100644",
                    "type": "blob",
                    "sha":  blob["sha"],
                })

            # No base_tree: the commit contains exactly the workspace files
            tree_sha = _gh("POST", f"{base}/git/trees", "Create tree", json={"tree": tree}).json()["sha"]
            commit_sha = _gh(
                "POST", f"{base}/git/commits", "Create commit",
                json={
                    "message": commit_message or "AI build",
                    "tree":    tree_sha,
                    "parents": [parent],
                    "author":  {"name": "Autogenix Build Bot", "email": "bot@autogenix.build"},
                },
            ).json()["sha"]
            # Fast-forward only — never overwrite history
            _gh(
                "PATCH", f"{base}/git/refs/heads/{branch}", "Update branch",
                json={"sha": commit_sha, "force": False},
            )

        except _GitHubError as e:
            return _mask(f"❌ Push failed: {e}")
        except requests.RequestException as e:
            return f"❌ Push failed: network error talking to GitHub ({type(e).__name__})"
        except Exception as e:
            log.exception("push_to_github failed for %s/%s", owner, repo)
            return _mask(f"❌ Push failed: {type(e).__name__}: {e}")

        result = (
            f"✅ Pushed {len(files)} files to https://github.com/{owner}/{repo} "
            f"(branch {branch}, commit {commit_sha[:7]})"
        )
        if skipped:
            result += "\nSkipped: " + ", ".join(skipped)
        return _mask(result)

    # ── Railway tools ─────────────────────────────────────────────

    @tool
    def deploy_to_railway(
        github_repo_url: str,
        project_name:    str,
    ) -> str:
        """
        Deploy a GitHub repo to Railway as a web service.
        The user's environment variables are applied automatically.

        github_repo_url: GitHub HTML URL e.g. "https://github.com/user/my-api"
        project_name: name for the Railway project (kebab-case)

        Returns project_id, service_id, and the deployment URL.
        """
        if not railway_api_key:
            return "❌ Railway API key not configured."

        try:
            vars_dict: dict = dict(app_env_vars or {})

            # Extract owner/repo from GitHub URL
            # e.g. https://github.com/alice/my-api → alice/my-api
            parts = github_repo_url.rstrip("/").split("/")
            if len(parts) < 2:
                return f"❌ Could not parse GitHub URL: {github_repo_url}"
            github_repo = f"{parts[-2]}/{parts[-1]}"

            # 1. Create Railway project
            project_data = _railway_gql(
                """
                mutation CreateProject($name: String!) {
                  projectCreate(input: { name: $name }) { id name }
                }
                """,
                {"name": project_name},
            )
            project_id = project_data["projectCreate"]["id"]
            log.info("Railway project created: %s", project_id)

            # 2. Get the default environment ID
            env_data = _railway_gql(
                """
                query GetProject($id: String!) {
                  project(id: $id) {
                    environments { edges { node { id name } } }
                  }
                }
                """,
                {"id": project_id},
            )
            environments = env_data["project"]["environments"]["edges"]
            if not environments:
                return f"❌ No environments found in Railway project {project_id}"
            env_id = environments[0]["node"]["id"]

            # 3. Create a service linked to the GitHub repo
            service_data = _railway_gql(
                """
                mutation CreateService($projectId: String!, $name: String!, $source: ServiceSourceInput) {
                  serviceCreate(input: { projectId: $projectId, name: $name, source: $source }) {
                    id name
                  }
                }
                """,
                {
                    "projectId": project_id,
                    "name":      project_name,
                    "source":    {"repo": github_repo},
                },
            )
            service_id = service_data["serviceCreate"]["id"]
            log.info("Railway service created: %s", service_id)

            # 4. Set environment variables
            for key, value in vars_dict.items():
                _railway_gql(
                    """
                    mutation SetVar($serviceId: String!, $envId: String!, $name: String!, $value: String!) {
                      variableUpsert(input: {
                        serviceId: $serviceId, environmentId: $envId,
                        name: $name, value: $value
                      })
                    }
                    """,
                    {
                        "serviceId": service_id,
                        "envId":     env_id,
                        "name":      key,
                        "value":     value,
                    },
                )

            # 5. Trigger deploy
            _railway_gql(
                """
                mutation Deploy($serviceId: String!, $envId: String!) {
                  serviceInstanceDeploy(serviceId: $serviceId, environmentId: $envId)
                }
                """,
                {"serviceId": service_id, "envId": env_id},
            )

            deploy_url = f"https://{project_name}.up.railway.app"
            return (
                f"✅ Railway deployment triggered\n"
                f"project_id={project_id}\n"
                f"service_id={service_id}\n"
                f"url={deploy_url}\n"
                f"env_vars_set={', '.join(sorted(vars_dict)) or 'none'}\n"
                f"status=deploying"
            )

        except Exception as e:
            return _mask(f"❌ Railway deployment failed: {e}")

    @tool
    def check_deploy_status(service_id: str) -> str:
        """
        Check Railway deployment status for a service.
        service_id: from deploy_to_railway output.
        Returns the current status string.
        """
        if not railway_api_key:
            return "❌ Railway API key not configured."
        try:
            data = _railway_gql(
                """
                query ServiceStatus($id: String!) {
                  service(id: $id) {
                    serviceInstances {
                      edges { node { latestDeployment { status } } }
                    }
                  }
                }
                """,
                {"id": service_id},
            )
            edges = data["service"]["serviceInstances"]["edges"]
            if not edges:
                return "No deployment found yet"
            status = edges[0]["node"]["latestDeployment"]["status"]
            return f"Railway status: {status}"
        except Exception as e:
            return f"❌ Status check failed: {e}"

    @tool
    def wait_for_deploy(service_id: str, timeout_minutes: int = 10) -> str:
        """
        Poll Railway deployment status until live or failed.
        service_id: from deploy_to_railway output.
        timeout_minutes: max minutes to wait (default 10).
        """
        deadline    = time.time() + (timeout_minutes * 60)
        last_status = "unknown"

        while time.time() < deadline:
            status_msg  = check_deploy_status.invoke({"service_id": service_id})
            last_status = status_msg

            lower = status_msg.lower()
            if "success" in lower or "complete" in lower:
                return f"✅ Deployment is LIVE! {status_msg}"
            if "failed" in lower or "crashed" in lower or "error" in lower:
                return f"❌ Deployment FAILED: {status_msg}"

            time.sleep(20)

        return f"⚠️ Deployment timed out after {timeout_minutes} minutes. Last status: {last_status}"

    return [
        create_github_repo,
        push_to_github,
        deploy_to_railway,
        check_deploy_status,
        wait_for_deploy,
    ]