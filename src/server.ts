#!/usr/bin/env node
import { createInterface } from "node:readline";
import { convert } from "./convert.ts";

// Minimal MCP server: JSON-RPC 2.0 messages, one per line, over stdio.
// No SDK — the protocol surface we need (initialize, tools/list, tools/call) is small.

const PROTOCOL_VERSION = "2024-11-05";
const SERVER_NAME = "mcp-unitconv";
const SERVER_VERSION = "0.1.0";

const CONVERT_TOOL = {
  name: "convert",
  description:
    "Convert a numeric value between units of length, mass, time or temperature.",
  inputSchema: {
    type: "object",
    properties: {
      value: { type: "number", description: "the numeric value to convert" },
      from: { type: "string", description: "unit to convert from, e.g. 'km'" },
      to: { type: "string", description: "unit to convert to, e.g. 'mi'" },
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

function handleToolsCall(id: JsonRpcId, params: Record<string, unknown> | undefined): void {
  const name = params?.name;
  const args = (params?.arguments ?? {}) as { value?: number; from?: string; to?: string };

  if (name !== "convert") {
    sendError(id, -32602, `unknown tool: ${String(name)}`);
    return;
  }

  try {
    const result = convert(args.value as number, args.from as string, args.to as string);
    sendResult(id, { content: [{ type: "text", text: String(result) }] });
  } catch (err) {
    // tool execution errors are reported inside the result, not as JSON-RPC errors,
    // so the client model sees the message instead of the call just failing silently
    const message = err instanceof Error ? err.message : String(err);
    sendResult(id, { content: [{ type: "text", text: message }], isError: true });
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

  let request: JsonRpcRequest;
  try {
    request = JSON.parse(trimmed);
  } catch {
    sendError(null, -32700, "parse error");
    return;
  }

  handleRequest(request);
});
