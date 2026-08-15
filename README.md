# mcp-unitconv

An MCP server that exposes unit conversion as a tool, so an assistant can convert
between units without guessing arithmetic.

Supports length, mass, time and temperature.

## Install

```bash
npm install
npm run build
```

## Use with an MCP client

```json
{
  "mcpServers": {
    "unitconv": { "command": "node", "args": ["dist/server.js"] }
  }
}
```

## Tool

`convert(value, from, to)` returns the converted value, or an error when the two
units belong to different dimensions.

```
100 C  -> F   =>  212
1 km   -> m   =>  1000
1 km   -> kg  =>  error: dimension mismatch
```

## Test

```bash
npm test
```

## License

MIT
