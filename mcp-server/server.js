#!/usr/bin/env node
/**
 * local-gemma-mcp: exposes a local Gemma 4 (llama.cpp) model as an MCP tool.
 *
 * Auto-starts llama-server on first use if not already running, so callers
 * (Claude Code, Codex, any MCP client) don't need to manage the process
 * themselves. Works from stdio, per the MCP spec.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MODEL_PATH =
  process.env.LOCAL_GEMMA_MODEL_PATH ||
  path.join(__dirname, "..", "models", "gemma-4-12b-it-qat-q4_0.gguf");
const HOST = process.env.LOCAL_GEMMA_HOST || "127.0.0.1";
const PORT = process.env.LOCAL_GEMMA_PORT || "8090";
const BASE_URL = `http://${HOST}:${PORT}`;
const N_GPU_LAYERS = process.env.LOCAL_GEMMA_GPU_LAYERS || "99";
const CTX_SIZE = process.env.LOCAL_GEMMA_CTX_SIZE || "65536";
const THREADS = process.env.LOCAL_GEMMA_THREADS || "8";
const DEFAULT_MAX_TOKENS = 8192; // Gemma 4 is a thinking model; needs headroom past its reasoning

let serverProcess = null;
let serverStarting = null;

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

async function ensureServerRunning() {
  if (await isServerHealthy()) return;

  if (serverStarting) {
    await serverStarting;
    return;
  }

  serverStarting = (async () => {
    serverProcess = spawn(
      "llama-server",
      [
        "--model", MODEL_PATH,
        "--host", HOST,
        "--port", PORT,
        "--n-gpu-layers", N_GPU_LAYERS,
        "--threads", THREADS,
        "--ctx-size", CTX_SIZE,
        "--flash-attn", "on",
      ],
      { stdio: ["ignore", "ignore", "pipe"], detached: false }
    );

    let lastStderr = "";
    serverProcess.stderr?.on("data", (chunk) => {
      lastStderr = chunk.toString().slice(-500);
    });

    serverProcess.on("error", (err) => {
      console.error(`[local-gemma-mcp] Failed to spawn llama-server: ${err.message}`);
    });

    serverProcess.on("exit", (code) => {
      if (code !== 0 && code !== null) {
        console.error(`[local-gemma-mcp] llama-server exited with code ${code}: ${lastStderr}`);
      }
    });

    // Cleanup on parent process exit
    const cleanup = () => {
      if (serverProcess && !serverProcess.killed) {
        serverProcess.kill("SIGTERM");
      }
    };
    process.once("exit", cleanup);
    process.once("SIGINT", cleanup);
    process.once("SIGTERM", cleanup);

    // Wait up to ~60s for the server to come up
    for (let i = 0; i < 30; i++) {
      await sleep(2000);
      if (await isServerHealthy()) return;
    }
    throw new Error(`llama-server did not become healthy within 60s. Last output: ${lastStderr}`);
  })();

  try {
    await serverStarting;
  } finally {
    serverStarting = null;
  }
}

async function callLocalModel({ prompt, system, max_tokens, temperature }) {
  await ensureServerRunning();

  const defaultSystem =
    "You are an expert coding assistant. Keep internal reasoning concise and focused purely on implementation details. Output clean, complete, robust code without unnecessary preamble.";

  const messages = [];
  messages.push({ role: "system", content: system || defaultSystem });
  messages.push({ role: "user", content: prompt });

  const res = await fetch(`${BASE_URL}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages,
      max_tokens: max_tokens || DEFAULT_MAX_TOKENS,
      temperature: temperature ?? 0.2,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`llama-server returned ${res.status}: ${text}`);
  }

  const data = await res.json();
  const choice = data.choices?.[0];
  const content = choice?.message?.content ?? "";
  const finishReason = choice?.finish_reason ?? "unknown";
  const usage = data.usage ?? {};

  let result = content;
  if (finishReason === "length") {
    result +=
      "\n\n[WARNING: output truncated by max_tokens before the model finished. " +
      "Re-run with a higher max_tokens, or ask for a smaller piece of work.]";
  }

  return { result, finishReason, usage };
}

const server = new Server(
  { name: "local-gemma-mcp", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "implement_with_local_model",
      description:
        "Send an implementation task to a locally-running Gemma 4 12B model (via llama.cpp, Apple Silicon Metal-accelerated). " +
        "Use this to offload code-writing / boilerplate / mechanical implementation work after you (the calling agent) " +
        "have already produced the plan or architecture. Do NOT use this for architectural decisions or planning — " +
        "it is intended purely as a fast, free, local implementation worker. The model 'thinks' internally before " +
        "responding, so allow enough max_tokens for both its reasoning and final output (default 8192).",
      inputSchema: {
        type: "object",
        properties: {
          prompt: {
            type: "string",
            description:
              "The implementation task, ideally including the plan/spec to implement and the exact output format desired " +
              "(e.g. '// FILE: path' markers per file).",
          },
          system: {
            type: "string",
            description: "Optional system prompt to steer behavior (e.g. coding style, language, output format).",
          },
          max_tokens: {
            type: "number",
            description: "Max tokens for the response (reasoning + final output combined). Default 8192.",
          },
          temperature: {
            type: "number",
            description: "Sampling temperature. Default 0.2 (deterministic, good for code).",
          },
        },
        required: ["prompt"],
      },
    },
    {
      name: "local_model_status",
      description: "Check whether the local Gemma 4 llama-server is running and healthy.",
      inputSchema: { type: "object", properties: {} },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === "local_model_status") {
    const healthy = await isServerHealthy();
    return {
      content: [
        {
          type: "text",
          text: healthy
            ? `Local Gemma 4 server is running at ${BASE_URL}`
            : `Local Gemma 4 server is NOT running. It will auto-start on the next implement_with_local_model call.`,
        },
      ],
    };
  }

  if (name === "implement_with_local_model") {
    try {
      const { result, finishReason, usage } = await callLocalModel(args);
      return {
        content: [
          {
            type: "text",
            text: result,
          },
        ],
        _meta: { finishReason, usage },
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
