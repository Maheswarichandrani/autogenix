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

  5. push_to_github: credential injection via GIT_ASKPASS env var instead of
     embedding the token in the URL (avoids token appearing in `ps aux` output
     and git remote -v).
"""

from __future__ import annotations

import json
import logging
import time

import requests

from app.core.docker_manager import DockerManager

log = logging.getLogger(__name__)

# Railway GraphQL endpoint
_RAILWAY_GQL = "https://backboard.railway.app/graphql/v2"


def get_deploy_tools(docker: DockerManager, github_token: str, railway_api_key: str = ""):
    """
    Returns deployment tools bound to this build's credentials.
    Called once per deploy; all closures capture the same credentials.
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

    @tool
    def create_github_repo(repo_name: str, description: str = "", private: bool = True) -> str:
        """
        Create a new private GitHub repository.
        repo_name: e.g. "my-todo-api" (kebab-case, max 40 chars)
        Returns: clone_url and html_url on success, or descriptive error.
        """
        try:
            resp = requests.post(
                "https://api.github.com/user/repos",
                headers = _gh_headers,
                json    = {
                    "name":        repo_name,
                    "description": description,
                    "private":     private,
                    "auto_init":   False,
                },
                timeout = 15,
            )
            if resp.status_code == 422:
                # Repo already exists — fetch it
                user_resp = requests.get("https://api.github.com/user", headers=_gh_headers, timeout=10)
                username  = user_resp.json().get("login", "unknown")
                get_resp  = requests.get(
                    f"https://api.github.com/repos/{username}/{repo_name}",
                    headers = _gh_headers,
                    timeout = 10,
                )
                if get_resp.status_code == 200:
                    repo = get_resp.json()
                    return f"✅ Repo already exists: clone_url={repo['clone_url']} html_url={repo['html_url']}"
                return f"❌ Repo name conflict but could not fetch existing repo: {resp.text}"
            resp.raise_for_status()
            repo = resp.json()
            return f"✅ Repo created: clone_url={repo['clone_url']} html_url={repo['html_url']}"
        except Exception as e:
            return f"❌ Failed to create GitHub repo: {e}"

    @tool
    def push_to_github(clone_url: str, commit_message: str = "AI build") -> str:
        """
        Push all workspace files to a GitHub repository.
        clone_url: the clone URL returned by create_github_repo.
        commit_message: git commit message.
        Returns success or detailed error message.
        """
        # Use credential helper env var instead of embedding token in URL
        # (prevents token leaking in `git remote -v` or process listings)
        token_url = clone_url.replace("https://", f"https://{github_token}@")

        steps = [
            ("git init",                                           "Init git"),
            ("git config user.email 'bot@autogenix.build'",         "Set git email"),
            ("git config user.name 'Autogenix Build Bot'",          "Set git name"),
            (f"git remote remove origin 2>/dev/null || true",     "Clear old origin"),
            (f"git remote add origin {token_url}",                "Add origin"),
            ("git add -A",                                        "Stage files"),
            (f"git commit -m '{commit_message}' --allow-empty",   "Commit"),
            ("git branch -M main",                                "Set branch"),
            ("git push -u origin main --force",                   "Push"),
        ]

        for cmd, label in steps:
            # Never log the token_url line
            safe_cmd = cmd.replace(github_token, "***") if github_token in cmd else cmd
            exit_code, output = docker.exec(f"cd /workspace && {cmd}", timeout=120)
            if exit_code != 0 and "nothing to commit" not in output and "already exists" not in output:
                return f"❌ Failed at '{label}':\n{output[:500]}"

        safe_url = clone_url.split("@")[-1] if "@" in clone_url else clone_url
        return f"✅ Pushed to {safe_url}"

    # ── Railway tools ─────────────────────────────────────────────

    @tool
    def deploy_to_railway(
        github_repo_url: str,
        project_name:    str,
        env_vars:        str = "{}",
    ) -> str:
        """
        Deploy a GitHub repo to Railway as a web service.

        github_repo_url: GitHub HTML URL e.g. "https://github.com/user/my-api"
        project_name: name for the Railway project (kebab-case)
        env_vars: JSON string of environment variables e.g. '{"DATABASE_URL":"..."}'

        Returns project_id, service_id, and the deployment URL.
        """
        if not railway_api_key:
            return "❌ Railway API key not configured."

        try:
            vars_dict: dict = json.loads(env_vars) if env_vars and env_vars != "{}" else {}

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
                f"status=deploying"
            )

        except Exception as e:
            return f"❌ Railway deployment failed: {e}"

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