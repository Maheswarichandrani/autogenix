/** Helpers for showing the generated project's files in the code panel. */

// Entry points, most likely first
const MAIN_FILES = [
  "main.py", "app.py", "manage.py", "server.py",
  "server.js", "index.js", "app.js", "src/index.js", "src/server.js",
  "main.go",
];

const LANGUAGE_LABELS: Record<string, string> = {
  py: "Python", js: "JavaScript", mjs: "JavaScript", cjs: "JavaScript", jsx: "JSX",
  ts: "TypeScript", tsx: "TSX", go: "Go", java: "Java", kt: "Kotlin",
  json: "JSON", yml: "YAML", yaml: "YAML", toml: "TOML", md: "Markdown",
  html: "HTML", css: "CSS", sql: "SQL", sh: "Shell", txt: "Text", env: "Env",
  xml: "XML", gradle: "Gradle", mod: "Go module", sum: "Go sum",
};

const SPECIAL_NAMES: Record<string, string> = {
  dockerfile: "Dockerfile",
  makefile: "Makefile",
  "requirements.txt": "Requirements",
  "package.json": "JSON",
};

export function fileName(path: string): string {
  return path.split("/").pop() || path;
}

/** "main.py" → "Python", "Dockerfile" → "Dockerfile" */
export function languageLabel(path: string): string {
  const name = fileName(path).toLowerCase();
  if (SPECIAL_NAMES[name]) return SPECIAL_NAMES[name];
  const ext = name.includes(".") ? name.split(".").pop()! : "";
  return LANGUAGE_LABELS[ext] ?? (ext ? ext.toUpperCase() : "Text");
}

/** The file the code panel opens first. */
export function pickMainFile(paths: string[]): string | null {
  if (paths.length === 0) return null;
  for (const candidate of MAIN_FILES) {
    if (paths.includes(candidate)) return candidate;
  }
  const java = paths.find((p) => p.endsWith("Application.java"));
  if (java) return java;
  const source = paths
    .filter((p) => !/(^|\/)(Dockerfile|requirements\.txt|package(-lock)?\.json|go\.(mod|sum)|\.env.*)$/i.test(p))
    .sort((a, b) => a.split("/").length - b.split("/").length || a.localeCompare(b));
  return source[0] ?? [...paths].sort()[0];
}

/** Paths ordered for the file switcher: folders after root files, alphabetical. */
export function sortPaths(paths: string[]): string[] {
  return [...paths].sort((a, b) => {
    const da = a.split("/").length, db = b.split("/").length;
    return da - db || a.localeCompare(b);
  });
}
