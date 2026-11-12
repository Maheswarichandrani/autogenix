/**
 * Agents end some replies with machine-readable blocks the pipeline parses,
 * e.g. <<<SECURITY_VERDICT>>>{...}<<<END_VERDICT>>>. The server keeps the raw
 * text for its parsers; chat shows the prose only.
 */

// A complete block: <<<NAME>>> … <<<END_ANY>>>
const COMPLETE_BLOCK = /<<<\s*[A-Z_]+\s*>>>[\s\S]*?<<<\s*END_[A-Z_]*\s*>>>/g;
// A block whose end marker has not streamed in yet
const OPEN_BLOCK = /<<<\s*[A-Z_]+\s*>>>[\s\S]*$/;
// A start marker cut off mid-stream: "<", "<<", "<<<", "<<<SECU", "<<<SECURITY_VERDICT>"
const PARTIAL_MARKER = /<{1,3}(?:\s*[A-Z_]*\s*>{0,2})?$/;

export function stripAgentMarkers(text: string): string {
  if (!text || !text.includes("<")) return text;
  return text
    .replace(COMPLETE_BLOCK, "")
    .replace(OPEN_BLOCK, "")
    .replace(PARTIAL_MARKER, "")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd();
}
