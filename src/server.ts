#!/usr/bin/env node
import { createInterface } from "node:readline";
import { convert, supportedUnits } from "./convert.ts";

// Minimal MCP server: JSON-RPC 2.0 messages, one per line, over stdio.
// No SDK — the protocol surface we need (initialize, tools/list, tools/call) is small.

const PROTOCOL_VERSION = "2024-11-05";
const SERVER_NAME = "mcp-unitconv";
const SERVER_VERSION = "0.1.0";

// listed as an enum so a client can validate/autocomplete units instead of
// guessing from the description text
const UNITS = supportedUnits();

const CONVERT_TOOL = {
  name: "convert",
  description:
    "Convert a numeric value between units of length, mass, time or temperature.",
  inputSchema: {
    type: "object",
    properties: {
      value: { type: "number", description: "the numeric value to convert" },
      from: { type: "string", description: "unit to convert from, e.g. 'km'", enum: UNITS },
      to: { type: "string", description: "unit to convert to, e.g. 'mi'", enum: UNITS },
    },
    required: ["value", "from", "to"],
  },
};

type JsonRpcId = number | string | null;

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: JsonRpcId;
  method: string;
  params?: Record<string, unknown>;
}

function send(message: unknown): void {
  process.stdout.write(JSON.stringify(message) + "\n");
}

function sendResult(id: JsonRpcId, result: unknown): void {
  send({ jsonrpc: "2.0", id, result });
}

function sendError(id: JsonRpcId, code: number, message: string): void {
  send({ jsonrpc: "2.0", id, error: { code, message } });
}

function toolError(id: JsonRpcId, message: string): void {
  sendResult(id, { content: [{ type: "text", text: message }], isError: true });
}

function handleToolsCall(id: JsonRpcId, params: Record<string, unknown> | undefined): void {
  const name = params?.name;
  const args = (params?.arguments ?? {}) as Record<string, unknown>;

  if (name !== "convert") {
    sendError(id, -32602, `unknown tool: ${String(name)}`);
    return;
  }

  // the input schema only documents the expected shape - nothing enforces it at
  // runtime, and a client sending e.g. a stringly-typed value would otherwise
  // silently produce NaN instead of a usable error
  const { value, from, to } = args;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    toolError(id, "invalid arguments: value must be a finite number");
    return;
  }
  if (typeof from !== "string") {
    toolError(id, "invalid arguments: from must be a string");
    return;
  }
  if (typeof to !== "string") {
    toolError(id, "invalid arguments: to must be a string");
    return;
  }

  try {
    const result = convert(value, from, to);
    sendResult(id, { content: [{ type: "text", text: String(result) }] });
  } catch (err) {
    // tool execution errors are reported inside the result, not as JSON-RPC errors,
    // so the client model sees the message instead of the call just failing silently
    const message = err instanceof Error ? err.message : String(err);
    toolError(id, message);
  }
}

function handleRequest(request: JsonRpcRequest): void {
  const { id, method, params } = request;

  // notifications (no id) get no response
  if (id === undefined) return;

  switch (method) {
    case "initialize":
      sendResult(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
      });
      break;
    case "tools/list":
      sendResult(id, { tools: [CONVERT_TOOL] });
      break;
    case "tools/call":
      handleToolsCall(id, params);
      break;
    default:
      sendError(id, -32601, `method not found: ${method}`);
  }
}

const rl = createInterface({ input: process.stdin });

rl.on("line", (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    sendError(null, -32700, "parse error");
    return;
  }

  // valid JSON but not a request object - e.g. "null", "42", or an array - would
  // otherwise crash handleRequest's destructuring and take the whole process down
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    Array.isArray(parsed) ||
    typeof (parsed as { method?: unknown }).method !== "string"
  ) {
    sendError(null, -32600, "invalid request");
    return;
  }

  handleRequest(parsed as JsonRpcRequest);
});
