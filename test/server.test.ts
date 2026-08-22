import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

const SERVER_PATH = fileURLToPath(new URL("../src/server.ts", import.meta.url));

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number | string | null;
  result?: unknown;
  error?: { code: number; message: string };
}

class ServerHandle {
  private child: ChildProcessWithoutNullStreams;
  private pending = new Map<number, (response: JsonRpcResponse) => void>();
  private nextId = 1;

  constructor() {
    this.child = spawn(process.execPath, [SERVER_PATH], {
      stdio: ["pipe", "pipe", "inherit"],
    });

    const rl = createInterface({ input: this.child.stdout });
    rl.on("line", (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      const response = JSON.parse(trimmed) as JsonRpcResponse;
      const resolve = this.pending.get(response.id as number);
      if (resolve) {
        this.pending.delete(response.id as number);
        resolve(response);
      }
    });
  }

  request(method: string, params?: Record<string, unknown>): Promise<JsonRpcResponse> {
    const id = this.nextId++;
    return new Promise((resolve) => {
      this.pending.set(id, resolve);
      this.child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    });
  }

  close(): void {
    this.child.kill();
  }
}

test("initialize reports the protocol version and server info", async () => {
  const server = new ServerHandle();
  try {
    const response = await server.request("initialize");
    const result = response.result as { protocolVersion: string; serverInfo: { name: string } };
    assert.equal(result.protocolVersion, "2024-11-05");
    assert.equal(result.serverInfo.name, "mcp-unitconv");
  } finally {
    server.close();
  }
});

test("tools/list exposes the convert tool", async () => {
  const server = new ServerHandle();
  try {
    const response = await server.request("tools/list");
    const result = response.result as { tools: { name: string }[] };
    assert.equal(result.tools.length, 1);
    assert.equal(result.tools[0].name, "convert");
  } finally {
    server.close();
  }
});

test("tools/call runs convert and returns the value as text", async () => {
  const server = new ServerHandle();
  try {
    const response = await server.request("tools/call", {
      name: "convert",
      arguments: { value: 1, from: "km", to: "m" },
    });
    const result = response.result as { content: { type: string; text: string }[]; isError?: boolean };
    assert.equal(result.content[0].text, "1000");
    assert.ok(!result.isError);
  } finally {
    server.close();
  }
});

test("tools/call reports a dimension mismatch as a tool error, not a protocol error", async () => {
  const server = new ServerHandle();
  try {
    const response = await server.request("tools/call", {
      name: "convert",
      arguments: { value: 1, from: "km", to: "kg" },
    });
    const result = response.result as { content: { type: string; text: string }[]; isError?: boolean };
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /dimension mismatch/);
  } finally {
    server.close();
  }
});

test("tools/call rejects an unknown tool name", async () => {
  const server = new ServerHandle();
  try {
    const response = await server.request("tools/call", {
      name: "not-a-real-tool",
      arguments: {},
    });
    assert.equal(response.error?.code, -32602);
  } finally {
    server.close();
  }
});

test("an unknown method returns a json-rpc method-not-found error", async () => {
  const server = new ServerHandle();
  try {
    const response = await server.request("not/a/method");
    assert.equal(response.error?.code, -32601);
  } finally {
    server.close();
  }
});
