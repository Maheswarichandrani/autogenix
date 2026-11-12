"""
tools/security_tools.py

Tools given to Guardian agent.
Guardian uses these to actively attack the running application.
Agent decides which attacks to run, reads results, decides next attack.
Pure security focus — no deployment concerns here.
"""
import json
import requests
from langchain_core.tools import tool
from app.core.docker_manager import DockerManager


def get_security_tools(docker: DockerManager, app_url: str):
    """
    Returns security testing tools bound to a specific build's Docker container and app URL.
    """

    @tool
    def http_request(method: str, path: str, body: str = "", headers: str = "") -> str:
        """
        Send an HTTP request to the running application to test for vulnerabilities.
        Use this to test endpoints with attack payloads.
        method: GET, POST, PUT, DELETE, PATCH
        path: endpoint path e.g. "/users/1" or "/auth/login"
        body: JSON string for request body e.g. '{"username": "admin\\' OR 1=1--"}'
        headers: JSON string for extra headers e.g. '{"Authorization": "Bearer fake_token"}'
        Example: http_request("POST", "/auth/login", '{"username": "' OR 1=1--", "password": "x"}')
        """
        try:
            url      = f"{app_url}{path}"
            hdrs     = {"Content-Type": "application/json"}
            if headers:
                hdrs.update(json.loads(headers))

            resp = requests.request(
                method  = method.upper(),
                url     = url,
                json    = json.loads(body) if body else None,
                headers = hdrs,
                timeout = 10,
                allow_redirects = True,
            )
            # Return status, headers (for security header checks), and body
            sensitive_headers = {
                k: v for k, v in resp.headers.items()
                if k.lower() in (
                    "x-frame-options", "content-security-policy",
                    "x-content-type-options", "strict-transport-security",
                    "access-control-allow-origin", "server", "x-powered-by"
                )
            }
            return (
                f"Status: {resp.status_code}\n"
                f"Security Headers: {json.dumps(sensitive_headers, indent=2)}\n"
                f"Response Body (first 500 chars):\n{resp.text[:500]}"
            )
        except requests.exceptions.ConnectionError:
            return "❌ Connection refused — app may not be running"
        except Exception as e:
            return f"❌ Request failed: {e}"

    @tool
    def run_sql_injection_scan(endpoint: str, param: str, method: str = "POST", base_body: str = "") -> str:
        """
        Run SQL injection payloads against a specific endpoint and parameter.
        endpoint: e.g. "/users" or "/auth/login"
        param: the parameter name to inject into e.g. "username" or "id"
        method: "POST" sends a JSON body, "GET" sends a query string (default POST)
        base_body: JSON string of the other valid fields to send alongside the payload,
                   e.g. '{"password": "Passw0rd!x"}', so validation does not reject the request
        Returns results of multiple injection attempts.
        """
        payloads = [
            "' OR '1'='1",
            "' OR '1'='1' --",
            "'; DROP TABLE users; --",
            "1 UNION SELECT * FROM users --",
            "' OR 1=1 LIMIT 1 --",
        ]
        try:
            base = json.loads(base_body) if base_body else {"password": "x"}
        except json.JSONDecodeError as e:
            return f"❌ Request failed: base_body is not valid JSON ({e})"
        verb    = method.upper()
        results = []
        for payload in payloads:
            fields = {**base, param: payload}
            try:
                if verb == "GET":
                    resp = requests.get(f"{app_url}{endpoint}", params=fields, timeout=5)
                else:
                    resp = requests.request(verb, f"{app_url}{endpoint}", json=fields, timeout=5)
                suspicious = resp.status_code == 200 or ("error" in resp.text.lower() and "sql" in resp.text.lower())
                results.append(f"Payload: {payload!r} → Status {resp.status_code} {'⚠️ SUSPICIOUS' if suspicious else '✅ OK'}")
            except Exception as e:
                results.append(f"Payload: {payload!r} → ❌ Error: {e}")
        return "\n".join(results)

    @tool
    def run_auth_bypass_scan(protected_endpoints: str) -> str:
        """
        Test if protected endpoints can be accessed without authentication.
        protected_endpoints: comma-separated list e.g. "/admin,/users,/dashboard"
        """
        endpoints = [e.strip() for e in protected_endpoints.split(",")]
        results   = []
        for ep in endpoints:
            try:
                # Try with no auth
                resp_no_auth = requests.get(f"{app_url}{ep}", timeout=5)
                # Try with fake token
                resp_fake    = requests.get(
                    f"{app_url}{ep}",
                    headers = {"Authorization": "Bearer fake_token_12345"},
                    timeout = 5
                )
                if resp_no_auth.status_code in (200, 201):
                    results.append(f"⚠️ VULNERABLE: {ep} accessible without auth (status {resp_no_auth.status_code})")
                elif resp_fake.status_code in (200, 201):
                    results.append(f"⚠️ VULNERABLE: {ep} accepts fake token (status {resp_fake.status_code})")
                else:
                    results.append(f"✅ PROTECTED: {ep} (no_auth={resp_no_auth.status_code}, fake_token={resp_fake.status_code})")
            except Exception as e:
                results.append(f"❌ {ep}: {e}")
        return "\n".join(results)

    @tool
    def run_rate_limit_scan(endpoint: str, method: str = "POST", body: str = "") -> str:
        """
        Test if an endpoint has rate limiting by sending many requests quickly.
        endpoint: e.g. "/auth/login"
        method: HTTP method e.g. "POST"
        body: JSON string to send each time. Use a valid-format body (e.g. a real
              username shape with a wrong password) so validation does not answer
              422 before the rate limiter is reached. Default: {"username": "test<i>", "password": "wrong"}
        Returns whether rate limiting is detected.
        """
        try:
            fixed_body = json.loads(body) if body else None
        except json.JSONDecodeError as e:
            return f"❌ Request failed: body is not valid JSON ({e})"
        results    = []
        hit_limit  = False
        for i in range(20):
            try:
                resp = requests.request(
                    method  = method.upper(),
                    url     = f"{app_url}{endpoint}",
                    json    = fixed_body if fixed_body is not None else {"username": f"test{i}", "password": "wrong"},
                    timeout = 3,
                )
                if resp.status_code == 429:
                    hit_limit = True
                    results.append(f"Request {i+1}: 429 Too Many Requests — Rate limit active ✅")
                    break
                results.append(f"Request {i+1}: {resp.status_code}")
            except Exception as e:
                results.append(f"Request {i+1}: Error — {e}")
                break

        if not hit_limit:
            results.append("⚠️ NO RATE LIMITING DETECTED after 20 requests — vulnerable to brute force")
        return "\n".join(results[-5:])   # return last 5 results + conclusion

    @tool
    def check_security_headers() -> str:
        """
        Check if the application returns proper security headers.
        Tests the root endpoint for all recommended security headers.
        """
        try:
            resp = requests.get(f"{app_url}/", timeout=5)
            headers = {k.lower(): v for k, v in resp.headers.items()}

            required = {
                "x-frame-options":           "Prevents clickjacking",
                "x-content-type-options":    "Prevents MIME sniffing",
                "content-security-policy":   "Prevents XSS",
                "strict-transport-security": "Enforces HTTPS",
            }
            dangerous = {
                "server":       "Exposes server software version",
                "x-powered-by": "Exposes technology stack",
            }
            results = []
            for header, purpose in required.items():
                if header in headers:
                    results.append(f"✅ {header}: {headers[header]}")
                else:
                    results.append(f"⚠️ MISSING: {header} — {purpose}")
            for header, risk in dangerous.items():
                if header in headers:
                    results.append(f"⚠️ EXPOSED: {header}: {headers[header]} — {risk}")
            return "\n".join(results)
        except Exception as e:
            return f"❌ Could not check headers: {e}"

    @tool
    def read_source_file(path: str) -> str:
        """
        Read a source code file to review it for security vulnerabilities.
        Use this to inspect code before or during attack testing.
        Example: read_source_file("main.py")
        """
        try:
            return docker.read_file(path)
        except Exception as e:
            return f"❌ Cannot read {path}: {e}"

    @tool
    def list_source_files() -> str:
        """List all source files in the workspace for code review."""
        files = docker.list_files()
        return "\n".join(sorted(files)) if files else "(no files)"

    return [
        http_request,
        run_sql_injection_scan,
        run_auth_bypass_scan,
        run_rate_limit_scan,
        check_security_headers,
        read_source_file,
        list_source_files,
    ]