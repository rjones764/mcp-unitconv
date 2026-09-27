import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { supportedUnits } from "../src/convert.ts";

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
  // for responses that carry no id we can key on (parse errors, malformed input)
  private unmatched: ((response: JsonRpcResponse) => void)[] = [];
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
        return;
      }
      const waiter = this.unmatched.shift();
      if (waiter) waiter(response);
    });
  }

  request(method: string, params?: Record<string, unknown>): Promise<JsonRpcResponse> {
    const id = this.nextId++;
    return new Promise((resolve) => {
      this.pending.set(id, resolve);
      this.child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    });
  }

  // sends a raw line, bypassing JSON-RPC framing, for testing malformed input
  writeRaw(line: string): void {
    this.child.stdin.write(line + "\n");
  }

  nextUnmatched(): Promise<JsonRpcResponse> {
    return new Promise((resolve) => {
      this.unmatched.push(resolve);
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

test("tools/list documents every supported unit as an enum on from/to", async () => {
  const server = new ServerHandle();
  try {
    const response = await server.request("tools/list");
    const result = response.result as {
      tools: { inputSchema: { properties: { from: { enum: string[] }; to: { enum: string[] } } } }[];
    };
    const { from, to } = result.tools[0].inputSchema.properties;
    const units = supportedUnits();
    assert.deepEqual(from.enum, units);
    assert.deepEqual(to.enum, units);
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

test("tools/call reports a non-numeric value as a tool error", async () => {
  const server = new ServerHandle();
  try {
    const response = await server.request("tools/call", {
      name: "convert",
      arguments: { value: "1", from: "km", to: "m" },
    });
    const result = response.result as { content: { type: string; text: string }[]; isError?: boolean };
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /value must be a finite number/);
  } finally {
    server.close();
  }
});

test("tools/call reports a missing unit argument as a tool error", async () => {
  const server = new ServerHandle();
  try {
    const response = await server.request("tools/call", {
      name: "convert",
      arguments: { value: 1, from: "km" },
    });
    const result = response.result as { content: { type: string; text: string }[]; isError?: boolean };
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /to must be a string/);
  } finally {
    server.close();
  }
});

test("tools/call reports an unknown unit as a tool error", async () => {
  const server = new ServerHandle();
  try {
    const response = await server.request("tools/call", {
      name: "convert",
      arguments: { value: 1, from: "furlong", to: "km" },
    });
    const result = response.result as { content: { type: string; text: string }[]; isError?: boolean };
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /unknown unit: furlong/);
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

test("malformed json on stdin produces a json-rpc parse error", async () => {
  const server = new ServerHandle();
  try {
    const responsePromise = server.nextUnmatched();
    server.writeRaw("this is not json");
    const response = await responsePromise;
    assert.equal(response.id, null);
    assert.equal(response.error?.code, -32700);
  } finally {
    server.close();
  }
});

test("a json value that isn't a request object produces an invalid-request error, not a crash", async () => {
  const server = new ServerHandle();
  try {
    const responsePromise = server.nextUnmatched();
    server.writeRaw("null");
    const response = await responsePromise;
    assert.equal(response.id, null);
    assert.equal(response.error?.code, -32600);

    // the malformed line must not have taken the process down - confirm it
    // still answers a normal request afterward
    const followUp = await server.request("initialize");
    const result = followUp.result as { serverInfo: { name: string } };
    assert.equal(result.serverInfo.name, "mcp-unitconv");
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
