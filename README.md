# paprika-mcp

An MCP server that gives Claude access to your [Paprika Recipe Manager](https://www.paprikaapp.com/) recipe library. Search recipes, browse categories, and pull up full recipe details — all from a conversation.

Built with [Bun](https://bun.sh) and the [Model Context Protocol](https://modelcontextprotocol.io).

## Prerequisites

- **macOS** with [Paprika 3](https://www.paprikaapp.com/) installed (reads the local SQLite database)
- **[Bun](https://bun.sh)** runtime (`curl -fsSL https://bun.sh/install | bash`)

## Setup

```bash
git clone https://github.com/megatrontz/paprika-mcp-local.git
cd paprika-mcp-local
bun install
```

Verify it works:

```bash
bun test
```

## Integrating with Claude

### Claude Code (CLI)

```bash
claude mcp add paprika-mcp -- /path/to/bun run /path/to/paprika-mcp-local/src/index.ts
```

Replace `/path/to/bun` with the output of `which bun` and `/path/to/paprika-mcp-local` with wherever you cloned the repo. Absolute paths are required since Claude Code may spawn the server from any working directory.

Example:

```bash
claude mcp add paprika-mcp -- ~/.bun/bin/bun run ~/code/paprika-mcp-local/src/index.ts
```

To scope it to a specific project instead of globally:

```bash
claude mcp add --scope project paprika-mcp -- ~/.bun/bin/bun run ~/code/paprika-mcp-local/src/index.ts
```

### Claude Desktop

Add this to your Claude Desktop config file:

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "paprika-mcp": {
      "command": "/path/to/bun",
      "args": ["run", "/path/to/paprika-mcp-local/src/index.ts"]
    }
  }
}
```

Replace the paths as above. Restart Claude Desktop after saving.

### Custom database location

If your Paprika database is in a non-standard location, set the `PAPRIKA_DB_PATH` environment variable:

```json
{
  "mcpServers": {
    "paprika-mcp": {
      "command": "/path/to/bun",
      "args": ["run", "/path/to/paprika-mcp-local/src/index.ts"],
      "env": {
        "PAPRIKA_DB_PATH": "/path/to/your/Paprika.sqlite"
      }
    }
  }
}
```

## Available Tools

| Tool | Description |
|------|-------------|
| `list_recipes` | Paginated list of all recipes (name, categories, rating, time, servings) |
| `get_recipe` | Full recipe detail by UID (ingredients, directions, notes, nutrition) |
| `search_recipes` | Search by keyword and/or filter by category |
| `list_categories` | All categories with recipe counts |

## Development

```bash
bun run dev          # run with --watch (auto-restart on changes)
bun run start        # run the server
bun test             # run tests
bun run build        # type-check with tsc
```

### Testing with MCP Inspector

```bash
npx @modelcontextprotocol/inspector bun run src/index.ts
```

Opens a web UI at http://localhost:6274 where you can interactively test each tool.

## How It Works

The server reads Paprika 3's local SQLite database (a Core Data store) in read-only mode using Bun's built-in `bun:sqlite`. Queries reflect the latest state of your recipe library without restarting — if you save a recipe in Paprika, the next tool call sees it.

## License

MIT
