# CLAUDE.md — paprika-mcp

## What This Is

An MCP server (TypeScript, stdio transport) that exposes Paprika Recipe Manager's local SQLite database to Claude Desktop. Architecture: `Claude Desktop --stdio--> this process --readonly--> Paprika.sqlite`.

Currently read-only. Future write path planned for category management via Claude/agents.

## Build & Run

```bash
bun install          # install dependencies
bun run start        # run the server (bun run src/index.ts)
bun run dev          # dev mode with watch (bun --watch src/index.ts)
bun run build        # tsc type-check (outputs to dist/, not needed for running)
bun test             # run repository tests
bun run create-fixture  # regenerate test SQLite fixture
```

## Project Structure

```
src/
  index.ts        # MCP server entry point — tool registrations, stdio transport, db path resolution
  repository.ts   # Data access layer (Repository pattern) — ALL SQL lives here
  types.ts        # Domain types (Recipe, RecipeSummary, Category)
test/
  repository.test.ts          # Repository tests (bun:test)
  fixtures/
    create-fixture.ts         # Generates test SQLite from real Paprika schema
    test-paprika.sqlite       # Test fixture (committed)
```

## Key Architecture Decisions

- **Repository pattern**: MCP tool handlers never touch SQLite directly. All schema knowledge is in `repository.ts`.
- **bun:sqlite** (built-in): Native SQLite access via Bun runtime. Opens the database file directly in read-only mode — no WASM, no native compilation, no extra dependencies.
- **Live reads**: The database file is opened directly (not loaded into memory). Queries reflect Paprika's latest state without restarting the server. WAL mode enables concurrent reads while Paprika writes.
- **Currently read-only, future write path**: Paprika owns writes today. The `readonly` option on `PaprikaRepository` is configurable (defaults to `true`) to support future write operations for category management.

## Paprika's SQLite Schema (Core Data)

This is a Core Data SQLite store. All tables/columns use the `Z` prefix convention.

### Main Tables

- `ZRECIPE` — recipes (Z_PK is internal PK, ZUID is the stable unique ID)
- `ZRECIPECATEGORY` — category names (ZUID, ZNAME, ZPARENT for hierarchy)
- `Z_12CATEGORIES` — many-to-many join: `Z_12RECIPES` -> `ZRECIPE.Z_PK`, `Z_13CATEGORIES` -> `ZRECIPECATEGORY.Z_PK`
- `ZGROCERYITEM`, `ZGROCERYLIST`, `ZGROCERYAISLE` — grocery lists
- `ZPANTRYITEM` — pantry inventory
- `ZMEAL`, `ZMEALTYPE` — meal planning
- `ZMENU`, `ZMENUITEM` — menus

### Important Schema Quirks

- **Core Data timestamps**: `ZCREATED` etc. are seconds since **2001-01-01T00:00:00Z** (NSDate epoch), NOT Unix epoch. Offset: `+978307200` seconds to convert to Unix.
- **Booleans are integers**: `ZINTRASH`, `ZONFAVORITES`, `ZISPINNED` — 0/1.
- **Trashed recipes**: Always filter `WHERE ZINTRASH = 0`.
- **Join table naming**: `Z_12CATEGORIES` — the numbers are Core Data entity indices, not meaningful.

### ZRECIPE Columns (the important ones)

ZUID, ZNAME, ZINGREDIENTS, ZDIRECTIONS, ZDESCRIPTIONTEXT, ZNOTES, ZNUTRITIONALINFO, ZPREPTIME, ZCOOKTIME, ZTOTALTIME, ZSERVINGS, ZDIFFICULTY, ZRATING (int), ZSOURCE, ZSOURCEURL, ZIMAGEURL, ZONFAVORITES (0/1), ZISPINNED (0/1), ZINTRASH (0/1), ZCREATED (Core Data timestamp)

## Database Location

Default macOS path: `~/Library/Group Containers/72KVKW69K8.com.hindsightlabs.paprika.mac.v3/Data/Database/Paprika.sqlite`

Override with `PAPRIKA_DB_PATH` env var.

## Current Tool Inventory

All four tools declare an `outputSchema` and return `structuredContent` alongside the
JSON text block. Structured content must be a JSON object, so list-shaped results are
wrapped in an envelope. All four set `openWorldHint: false` — this server reads one
local file.

`search_recipes` semantics, which the tool descriptions must keep stating accurately:
`query` is a literal substring match (LIKE metacharacters are escaped) and is *not*
tokenized, so multi-word queries only match contiguous text. `category` is an exact,
case-insensitive name match (`= ? COLLATE NOCASE`), not a pattern.

| Tool | Input | Returns |
|------|-------|---------|
| `list_recipes` | offset, limit | `{ total, offset, limit, recipes: RecipeSummary[] }` |
| `get_recipe` | uid | Full Recipe with ingredients/directions |
| `search_recipes` | query?, category?, maxResults | `{ resultCount, recipes: RecipeSummary[] }` |
| `list_categories` | (none) | `{ categories: Category[] }` with recipe counts |

## What's Not Built Yet

- Category management / write operations (planned — will use bun:sqlite write mode)
- Grocery list / pantry item tools (tables exist: ZGROCERYITEM, ZPANTRYITEM)
- Meal plan tools (tables exist: ZMEAL, ZMEALTYPE, ZMENU, ZMENUITEM)
- Photo serving (photos exist on disk at `../Photos/<UUID>/`)

## Style

- Zod schemas for all MCP tool inputs and outputs
- Domain types in types.ts are inferred from Zod schemas (`RecipeSchema`, `RecipeSummarySchema`,
  `CategorySchema`) so tool `outputSchema`s can't drift from what the repository returns;
  raw row types stay in repository.ts
- Error returns (`isError: true`) carry plain text only — the SDK skips output validation for
  them, and structured content on an error path would not be validated
- All current tool annotations set `readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true`
- Tests use bun:test with a SQLite fixture built from Paprika's real schema
