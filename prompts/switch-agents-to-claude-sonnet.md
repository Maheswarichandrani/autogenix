# Switch the agents from gpt-4o to Claude Sonnet 5.5

## Goal

The user decided to use Claude Sonnet 5.5 (`claude-sonnet-5-5`) instead of OpenAI `gpt-4o` for
Artificer, the fixer, Guardian and Deployer, so the project runs on one provider (Anthropic) and
the pipeline-loop tests can run. Conductor stays on `claude-haiku-4-5`, which already works.

## Skills read

- `claude-api`, the Sonnet 5.5 migration section. Facts that drive this change:
  - Non-default `temperature` / `top_p` / `top_k` return a 400. Today every call sends
    `temperature=0`.
  - Thinking is on by default (adaptive). Responses can start with `thinking` blocks, and those
    blocks must be passed back unchanged in the next request. Thinking counts toward
    `max_tokens`.
  - Effort is recalibrated. The guide's starting point for agentic coding and multistep tool use
    is `medium`, set explicitly through `output_config.effort`.
  - Forced `tool_choice` (`any` / `tool`) is a 400. We only use `auto`, so no change.
  - Safety classifiers can decline (`stop_reason: "refusal"`). Guardian sends injection payloads,
    so a `cyber` decline is possible. Server-side fallback (`fallbacks: "default"`, beta
    `server-side-fallback-2026-07-01`) retries `cyber` declines on Claude Sonnet 5.
  - History must be append-only (preserved thinking). It is enforced by default on accounts
    created on or after 2026-08-31, which includes a newly bought key.

## Code inspected

- `server/app/core/llm.py`: `AnthropicProvider.chat_completion_with_tools` always sends
  `temperature`, extracts only `text` and `tool_use` blocks, and treats any error containing
  "rate" as a 429. `UnifiedLLM.MODELS` has no Sonnet 5.5 entry. It also lists retired models
  (`claude-3-5-sonnet-20241022`, `claude-3-opus-20240229`), and `get_llm()` defaults to one of
  them.
- `server/app/agents/react.py:173`: calls `chat_with_tools(..., max_tokens=8192, temperature=0)`.
  Lines 187-198 rebuild the assistant turn from `text` and `tool_use` only, which would drop
  thinking blocks.
- `server/app/agents/workflow.py`: `model = "gpt-4o"` in 5 places (artificer x2, guardian,
  artificer_fix, deployer); Conductor uses `get_llm("claude-haiku-4-5")`.
- `server/app/core/config.py`: no model settings (AGENTS.md §10: centralise model ids before
  adding more).
- Installed `anthropic==0.83.0`: `messages.create` accepts `thinking` and `output_config`;
  `beta.messages.create` accepts `betas` but has no typed `fallbacks` parameter, so it goes
  through `extra_body`.

## Decisions

1. **Model ids in config.** `settings.AGENT_MODEL = "claude-sonnet-5-5"` and
   `settings.CONDUCTOR_MODEL = "claude-haiku-4-5"`. `workflow.py` reads them, so no model strings
   remain in the nodes.
2. **New `UnifiedLLM.MODELS["claude-sonnet-5-5"]` entry** with two new optional `LLMConfig`
   fields:
   - `effort: Optional[str] = "medium"`: when set, the provider sends
     `output_config={"effort": effort}` and **no** `temperature` (this is how Sonnet 5.5 is
     marked as a thinking model).
   - `max_tokens = 16000` for this model, because thinking counts toward it. 16000 is the guide's
     non-streaming ceiling and keeps us clear of the SDK's long-request guard.
   Other models' configs are unchanged.
3. **Provider rules for thinking models** (`effort` set): drop `temperature`; use
   `max(requested max_tokens, config.max_tokens)` so `react.py`'s 8192 can't starve thinking;
   send the request through `client.beta.messages.create` with
   `betas=["server-side-fallback-2026-07-01"]` and `extra_body={"fallbacks": "default"}`.
4. **Pass blocks back unchanged.** `LLMResponse` gets `raw_content: list | None`. The Anthropic
   provider fills it with every response block as a dict (`block.model_dump(exclude_none=True)`),
   including `thinking`. `react.py` uses `raw_content` for the assistant turn when present,
   instead of rebuilding it. The history stays append-only.
5. **Refusals fail loudly.** If the final `stop_reason` is `"refusal"`, the provider raises
   `RuntimeError("Model declined (<category>): <explanation>")`. The node's existing error path
   then reports it, and in the new graph it ends in `escalate`. It never continues silently.
6. **Real 429 detection.** The retry loop catches `anthropic.RateLimitError` instead of matching
   "rate" in the error text, so a 400 that mentions "rate" isn't retried.
7. **Out of scope** (noted, not changed): the retired `claude-3-*` entries and the `get_llm()`
   default, OpenAI/Groq providers (kept for later choice), Conductor's model, streaming text
   display of thinking blocks.

## Branch and commits

Same branch, `feature/pipeline-loops`, as a **separate commit**, because the loop tests depend
on it. Nothing is committed until all tests pass (the user's rule). Order: this commit, then the
pipeline-loop commit, then push.

## Files to touch

- `server/app/core/config.py`: `AGENT_MODEL`, `CONDUCTOR_MODEL`.
- `server/app/core/llm.py`: `LLMConfig.effort`, `LLMResponse.raw_content`, the Sonnet 5.5
  entry, provider rules (3, 5, 6).
- `server/app/agents/react.py`: use `raw_content` for the assistant turn.
- `server/app/agents/workflow.py`: replace the 5 `"gpt-4o"` strings and the Conductor string
  with settings.

## Security considerations

- The API key stays in the worker's env; nothing new reaches the browser, state or containers.
- Fallback to Claude Sonnet 5 only re-runs the same request; no new data leaves.
- Refusals stop the build visibly instead of being treated as an empty answer.

## Acceptance criteria

1. No `"gpt-4o"` left in `workflow.py`; models come from settings.
2. A Sonnet 5.5 tool-calling request sends no `temperature`, sends `output_config.effort`, and
   succeeds.
3. In a multi-step ReAct run, the second and later requests contain the earlier `thinking`
   blocks unchanged and succeed (no preserved-thinking 400).
4. A refusal raises a clear error.
5. Conductor (Haiku 4.5) still works.

## Checks to run

- `python -c "from app.main import app"`, worker import, graph compile.
- A real two-step tool call on `claude-sonnet-5-5` through `react.run_react_agent` with one
  trivial tool, printing the request shape and confirming the second call succeeds.
- Then the pipeline-loop real tests from `prompts/pipeline-feedback-loops.md`: happy path and
  the sabotaged-startup fix loop (real Docker, real Sonnet 5.5).

## Manual test steps

Same as `prompts/pipeline-feedback-loops.md` steps 2-5, after restarting the Celery worker so it
loads the new code. In the worker log, model calls show `claude-sonnet-5-5`.
