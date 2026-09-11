#!/usr/bin/env node
/**
 * local-gemma-mcp: exposes a local llama.cpp model as an MCP implementation worker.
 *
 * (The "gemma" name is historical — the server works with any GGUF model that
 * llama-server can load, e.g. Qwen3.8 or Gemma 4.)
 *
 * Auto-starts llama-server on first use via scripts/ensure-llama-server.sh, so
 * callers (Claude Code, Codex, any MCP client) don't need to manage the process.
 * Responses are streamed from llama-server so long generations never hit an
 * HTTP client timeout, and MCP progress notifications are emitted while the
 * model works.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import http from "node:http";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const ENSURE_SCRIPT = path.join(REPO_ROOT, "scripts", "ensure-llama-server.sh");

// Load .env from REPO_ROOT if present
const envPath = path.join(REPO_ROOT, ".env");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx !== -1) {
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}

const MODEL_NAME =
  process.env.LOCAL_GEMMA_MODEL_NAME || path.basename(process.env.LOCAL_GEMMA_MODEL_PATH || "local-model");
const HOST = process.env.LOCAL_GEMMA_HOST || "127.0.0.1";
const PORT = Number(process.env.LOCAL_GEMMA_PORT || "8090");
const BASE_URL = `http://${HOST}:${PORT}`;
const DEFAULT_MAX_TOKENS = parseInt(process.env.LOCAL_GEMMA_MAX_TOKENS || "16384", 10);
const DEFAULT_THINKING = /^(1|true|on|yes)$/i.test(process.env.LOCAL_GEMMA_THINKING || "false");
const DEFAULT_REASONING_EFFORT = process.env.LOCAL_GEMMA_REASONING_EFFORT || "medium";
const MAX_FILE_BYTES = parseInt(process.env.LOCAL_GEMMA_MAX_FILE_BYTES || "262144", 10);
const PROGRESS_INTERVAL_MS = 5000;

const execFileAsync = promisify(execFile);

/**
 * Sampling presets, keyed by model family and thinking mode. These follow the
 * vendors' recommendations, except that Qwen's non-thinking presence_penalty is
 * 0 instead of 1.5: penalising recent tokens made code output ramble (up to 2x
 * longer) without improving correctness in local benchmarks.
 * A caller-supplied temperature overrides only the temperature.
 */
function samplingPreset(thinking) {
  const name = MODEL_NAME.toLowerCase();
  if (name.includes("qwen")) {
    return thinking
      ? { temperature: 1.0, top_p: 0.95, top_k: 20, min_p: 0.0, presence_penalty: 0.0 }
      : { temperature: 0.7, top_p: 0.8, top_k: 20, min_p: 0.0, presence_penalty: 0.0 };
  }
  if (name.includes("gemma")) {
    return { temperature: 1.0, top_p: 0.95, top_k: 64, min_p: 0.0 };
  }
  return { temperature: 0.7, top_p: 0.9 };
}

async function isServerHealthy() {
  try {
    const res = await fetch(`${BASE_URL}/health`, { signal: AbortSignal.timeout(1500) });
    if (!res.ok) return false;
    const data = await res.json();
    return data.status === "ok";
  } catch {
    return false;
  }
}

let serverStarting = null;

async function ensureServerRunning() {
  if (await isServerHealthy()) return;

  // Delegate to the shell script so the llama-server flags live in one place.
  serverStarting ??= execFileAsync("bash", [ENSURE_SCRIPT], { timeout: 300_000 })
    .catch((err) => {
      const output = `${err.stdout ?? ""}${err.stderr ?? ""}`.trim();
      throw new Error(`Failed to start llama-server: ${output || err.message}`);
    })
    .finally(() => {
      serverStarting = null;
    });
  await serverStarting;
}

/**
 * Read the caller-listed files and render them as context blocks.
 * Throws with every unreadable path listed so the caller can fix them in one go.
 */
function renderFiles(files, cwd) {
  if (!files?.length) return "";
  const baseDir = cwd ? path.resolve(cwd) : process.cwd();
  const blocks = [];
  const problems = [];

  for (const file of files) {
    const absolute = path.resolve(baseDir, file);
    try {
      const stat = fs.statSync(absolute);
      if (!stat.isFile()) {
        problems.push(`${file}: not a regular file`);
        continue;
      }
      if (stat.size > MAX_FILE_BYTES) {
        problems.push(`${file}: ${stat.size} bytes exceeds LOCAL_GEMMA_MAX_FILE_BYTES=${MAX_FILE_BYTES}`);
        continue;
      }
      const displayPath = path.relative(baseDir, absolute) || file;
      blocks.push(`<file path="${displayPath}">\n${fs.readFileSync(absolute, "utf-8")}\n</file>`);
    } catch (err) {
      problems.push(`${file}: ${err.code ?? err.message}`);
    }
  }

  if (problems.length) {
    throw new Error(`Could not read context files (resolved against ${baseDir}):\n- ${problems.join("\n- ")}`);
  }
  return `<context_files>\n${blocks.join("\n\n")}\n</context_files>\n\n`;
}

/**
 * POST a streaming chat completion to llama-server and accumulate the result.
 * Uses node:http rather than fetch: fetch's built-in 300s headers/body timeouts
 * would abort long prompt-processing or generation phases.
 */
function streamChatCompletion(body, { signal, onDelta }) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = http.request(
      {
        host: HOST,
        port: PORT,
        path: "/v1/chat/completions",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
          Accept: "text/event-stream",
        },
        signal,
      },
      (res) => {
        if (res.statusCode !== 200) {
          let text = "";
          res.setEncoding("utf-8");
          res.on("data", (chunk) => (text += chunk));
          res.on("end", () => reject(new Error(`llama-server returned ${res.statusCode}: ${text}`)));
          return;
        }

        const result = { content: "", reasoning: "", finishReason: "unknown", usage: {}, timings: null, model: null };
        let buffer = "";
        res.setEncoding("utf-8");
        res.on("data", (chunk) => {
          buffer += chunk;
          let newline;
          while ((newline = buffer.indexOf("\n")) !== -1) {
            const line = buffer.slice(0, newline).trim();
            buffer = buffer.slice(newline + 1);
            if (!line.startsWith("data:")) continue;
            const data = line.slice(5).trim();
            if (!data || data === "[DONE]") continue;

            let event;
            try {
              event = JSON.parse(data);
            } catch {
              continue;
            }
            if (event.error) {
              req.destroy();
              reject(new Error(`llama-server stream error: ${JSON.stringify(event.error)}`));
              return;
            }
            const choice = event.choices?.[0];
            const delta = choice?.delta ?? {};
            if (delta.reasoning_content) result.reasoning += delta.reasoning_content;
            if (delta.content) result.content += delta.content;
            if (choice?.finish_reason) result.finishReason = choice.finish_reason;
            if (event.usage) result.usage = event.usage;
            if (event.timings) result.timings = event.timings;
            if (event.model) result.model = event.model;
            onDelta?.(result);
          }
        });
        res.on("end", () => resolve(result));
        res.on("error", reject);
      }
    );
    req.on("error", reject);
    req.end(payload);
  });
}

function formatStats({ model, usage, timings, elapsedMs, thinking }) {
  const parts = [`model=${model ? path.basename(model) : MODEL_NAME}`, `thinking=${thinking || "off"}`];
  if (usage.prompt_tokens != null) parts.push(`prompt_tokens=${usage.prompt_tokens}`);
  if (usage.completion_tokens != null) parts.push(`completion_tokens=${usage.completion_tokens}`);
  if (timings?.prompt_per_second) parts.push(`prefill=${timings.prompt_per_second.toFixed(0)} tok/s`);
  if (timings?.predicted_per_second) parts.push(`decode=${timings.predicted_per_second.toFixed(1)} tok/s`);
  if (timings?.draft_n) parts.push(`draft_accepted=${timings.draft_n_accepted}/${timings.draft_n}`);
  parts.push(`elapsed=${(elapsedMs / 1000).toFixed(1)}s`);
  return `[local-model stats: ${parts.join(", ")}]`;
}

async function callLocalModel(args, extra) {
  const { prompt, system, files, cwd, max_tokens, temperature } = args;
  const thinking = args.thinking ?? DEFAULT_THINKING;
  const reasoningEffort = args.reasoning_effort ?? DEFAULT_REASONING_EFFORT;

  // Validate files before (possibly) waiting on a cold server start.
  const fileContext = renderFiles(files, cwd);
  await ensureServerRunning();

  const defaultSystem =
    "You are an expert software engineer acting as an implementation worker. " +
    "Implement exactly the specification you are given. Use only the APIs, imports, and types that appear in the " +
    "specification or the provided context files; never invent dependencies. Output complete files without preamble.";

  const messages = [
    { role: "system", content: system || defaultSystem },
    { role: "user", content: fileContext + prompt },
  ];

  const sampling = samplingPreset(thinking);
  if (temperature != null) sampling.temperature = temperature;

  const body = {
    messages,
    stream: true,
    stream_options: { include_usage: true },
    max_tokens: max_tokens || DEFAULT_MAX_TOKENS,
    // Templates ignore variables they don't use, so reasoning_effort is safe for any model.
    chat_template_kwargs: thinking
      ? { enable_thinking: true, reasoning_effort: reasoningEffort }
      : { enable_thinking: false },
    ...sampling,
  };

  const progressToken = extra?._meta?.progressToken;
  let lastProgressAt = 0;
  const onDelta = progressToken == null
    ? undefined
    : (partial) => {
        const now = Date.now();
        if (now - lastProgressAt < PROGRESS_INTERVAL_MS) return;
        lastProgressAt = now;
        const produced = partial.reasoning.length + partial.content.length;
        const phase = partial.content ? "writing output" : partial.reasoning ? "thinking" : "processing prompt";
        extra
          .sendNotification({
            method: "notifications/progress",
            params: { progressToken, progress: produced, message: `${phase}: ${produced} chars generated` },
          })
          .catch(() => {});
      };

  const startedAt = Date.now();
  const { content, reasoning, finishReason, usage, timings, model } = await streamChatCompletion(body, {
    signal: extra?.signal,
    onDelta,
  });
  const elapsedMs = Date.now() - startedAt;

  let result = "";
  if (reasoning.trim()) {
    result += `<local_model_thinking>\n${reasoning.trim()}\n</local_model_thinking>\n\n`;
  }
  result += content;

  if (finishReason === "length") {
    result +=
      "\n\n[WARNING: output truncated by max_tokens before the model finished. " +
      "Re-run with a higher max_tokens, or ask for a smaller piece of work.]";
  }
  result += `\n\n${formatStats({ model, usage, timings, elapsedMs, thinking: thinking && reasoningEffort })}`;

  return { result, finishReason, usage, timings, reasoning };
}

const server = new Server(
  { name: "local-gemma-mcp", version: "2.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "implement_with_local_model",
      description:
        `Send an implementation task to a locally-running model (${MODEL_NAME} via llama.cpp, Apple Silicon Metal-accelerated). ` +
        "Use this to offload code-writing / boilerplate / mechanical implementation work after you (the calling agent) " +
        "have already produced the plan or architecture. Do NOT use this for architectural decisions or planning — " +
        "it is intended purely as a fast, free, local implementation worker. Pass the files the worker must read or " +
        "follow via `files` instead of pasting them into the prompt. Thinking is off by default; enable it only for " +
        "algorithmically tricky units. When thinking is on, the model's reasoning is returned inside " +
        "<local_model_thinking> tags before the implementation.",
      inputSchema: {
        type: "object",
        properties: {
          prompt: {
            type: "string",
            description:
              "The implementation task, ideally including the plan/spec to implement and the exact output format desired " +
              "(e.g. '// FILE: path' markers per file).",
          },
          files: {
            type: "array",
            items: { type: "string" },
            description:
              "Paths of existing files to include verbatim as context (files to edit, interfaces, reference code, tests). " +
              "Relative paths resolve against `cwd`.",
          },
          cwd: {
            type: "string",
            description:
              "Absolute path of the repository root used to resolve relative `files`. Defaults to the MCP server's working directory.",
          },
          system: {
            type: "string",
            description: "Optional system prompt to steer behavior (e.g. coding style, language, output format).",
          },
          thinking: {
            type: "boolean",
            description:
              "Enable the model's reasoning phase. Slower (often 3-10x more tokens) but needed for algorithmically tricky " +
              "units (parsers, matchers, concurrency); without it such units tend to come back subtly wrong. Default false.",
          },
          reasoning_effort: {
            type: "string",
            enum: ["low", "medium", "high"],
            description: `Reasoning depth when thinking is on (models that support it, e.g. Qwen3.8). Default ${DEFAULT_REASONING_EFFORT}.`,
          },
          max_tokens: {
            type: "number",
            description: `Max tokens for the response (reasoning + final output combined). Default ${DEFAULT_MAX_TOKENS}.`,
          },
          temperature: {
            type: "number",
            description: "Override the sampling temperature. By default the model vendor's recommended preset is used.",
          },
        },
        required: ["prompt"],
      },
    },
    {
      name: "local_model_status",
      description: "Check whether the local llama-server is running and healthy, and which model it serves.",
      inputSchema: { type: "object", properties: {} },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
  const { name, arguments: args } = request.params;

  if (name === "local_model_status") {
    const healthy = await isServerHealthy();
    let loaded = "";
    if (healthy) {
      try {
        const props = await (await fetch(`${BASE_URL}/props`, { signal: AbortSignal.timeout(1500) })).json();
        loaded = ` (loaded model: ${path.basename(props.model_path ?? "unknown")})`;
      } catch {
        // Status is still useful without the model name.
      }
    }
    return {
      content: [
        {
          type: "text",
          text: healthy
            ? `Local model server is running at ${BASE_URL}${loaded}. Configured model: ${MODEL_NAME}.`
            : `Local model server is NOT running. It will auto-start on the next implement_with_local_model call.`,
        },
      ],
    };
  }

  if (name === "implement_with_local_model") {
    try {
      const { result, finishReason, usage, timings, reasoning } = await callLocalModel(args, extra);
      return {
        content: [{ type: "text", text: result }],
        _meta: { finishReason, usage, timings, reasoning },
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: `Error calling local model: ${err.message}` }],
        isError: true,
      };
    }
  }

  throw new Error(`Unknown tool: ${name}`);
});

const transport = new StdioServerTransport();
await server.connect(transport);
