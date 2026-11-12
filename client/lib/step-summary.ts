/**
 * One-line summary of an agent's tool steps, e.g.
 *   "Wrote 3 files, ran 2 commands, and 4 more tools"
 * Shown collapsed above each agent reply; clicking expands the steps.
 */

type Phrase = { one: string; many: (n: number) => string };

const PHRASES: Record<string, Phrase> = {
  write:    { one: "wrote a file",          many: (n) => `wrote ${n} files` },
  read:     { one: "read a file",           many: (n) => `read ${n} files` },
  delete:   { one: "deleted a file",        many: (n) => `deleted ${n} files` },
  list:     { one: "listed files",          many: () => "listed files" },
  command:  { one: "ran a command",         many: (n) => `ran ${n} commands` },
  syntax:   { one: "checked syntax",        many: () => "checked syntax" },
  logs:     { one: "read the app logs",     many: () => "read the app logs" },
  request:  { one: "sent a request",        many: (n) => `sent ${n} requests` },
  scan:     { one: "ran a security scan",   many: (n) => `ran ${n} security scans` },
  github:   { one: "updated GitHub",        many: () => "updated GitHub" },
  deploy:   { one: "ran a deploy step",     many: (n) => `ran ${n} deploy steps` },
};

const TOOL_GROUP: Record<string, keyof typeof PHRASES> = {
  write_file:             "write",
  read_file:              "read",
  read_source_file:       "read",
  delete_file:            "delete",
  list_files:             "list",
  list_source_files:      "list",
  exec_command:           "command",
  check_syntax:           "syntax",
  get_app_logs:           "logs",
  http_request:           "request",
  run_sql_injection_scan: "scan",
  run_auth_bypass_scan:   "scan",
  run_rate_limit_scan:    "scan",
  check_security_headers: "scan",
  create_github_repo:     "github",
  push_to_github:         "github",
  deploy_to_railway:      "deploy",
  check_deploy_status:    "deploy",
  wait_for_deploy:        "deploy",
};

const NAMED_GROUPS = 2;

/** Builds the summary from tool names in call order. Empty input → "". */
export function summariseSteps(tools: string[]): string {
  if (tools.length === 0) return "";

  // Group in first-seen order; unknown tools each count as their own "tool"
  const order: string[] = [];
  const counts = new Map<string, number>();
  for (const tool of tools) {
    const key = TOOL_GROUP[tool] ?? `tool:${tool}`;
    if (!counts.has(key)) order.push(key);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const named = order.filter((k) => !k.startsWith("tool:")).slice(0, NAMED_GROUPS);
  const parts = named.map((k) => {
    const n = counts.get(k)!;
    const phrase = PHRASES[k];
    return n === 1 ? phrase.one : phrase.many(n);
  });

  const namedCalls = named.reduce((sum, k) => sum + counts.get(k)!, 0);
  const rest = tools.length - namedCalls;
  if (rest > 0) {
    parts.push(parts.length ? `${rest} more tool${rest === 1 ? "" : "s"}` : `used ${rest} tool${rest === 1 ? "" : "s"}`);
  }

  let text: string;
  if (parts.length === 1) text = parts[0];
  else if (parts.length === 2) text = `${parts[0]} and ${parts[1]}`;
  else text = `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;

  return text.charAt(0).toUpperCase() + text.slice(1);
}
