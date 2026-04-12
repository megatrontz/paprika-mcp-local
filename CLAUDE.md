# CLAUDE.md — paprika-mcp

## What This Is

A read-only MCP server (TypeScript, stdio transport) that exposes Paprika Recipe Manager's local SQLite database to Claude Desktop. Architecture: `Claude Desktop --stdio--> this process --readonly--> Paprika.sqlite`.

## Build & Run

```bash
npm install          # sql.js is pure WASM — no native deps
npm run build        # tsc -> dist/
npm run dev          # tsx (no build step, for development)
```

## Project Structure

```
src/
  index.ts        # MCP server entry point — tool registrations, stdio transport, db path resolution
  repository.ts   # Data access layer (Repository pattern) — ALL SQL lives here
  types.ts        # Domain types (Recipe, RecipeSummary, Category)
```

## Key Architecture Decisions

- **Repository pattern**: MCP tool handlers never touch SQLite directly. All schema knowledge is in `repository.ts`.
- **sql.js** (not better-sqlite3): SQLite compiled to WASM. Zero native deps, no node-gyp. Tradeoff: loads entire DB into memory at startup (~3MB, fine for hundreds of recipes).
- **Read-only**: Paprika owns writes. We open the DB read-only. `repo.init()` is async (WASM loading) and must complete before the server connects.

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

## Current Tool Inventory (MVP — read-only)

| Tool | Input | Returns |
|------|-------|---------|
| `list_recipes` | offset, limit | Paginated RecipeSummary[] |
| `get_recipe` | uid | Full Recipe with ingredients/directions |
| `search_recipes` | query?, category?, maxResults | RecipeSummary[] matching keyword/category |
| `list_categories` | (none) | Category[] with recipe counts |

## What's Not Built Yet

- Grocery list / pantry item tools (tables exist: ZGROCERYITEM, ZPANTRYITEM)
- Meal plan tools (tables exist: ZMEAL, ZMEALTYPE, ZMENU, ZMENUITEM)
- Write operations (creating meal plans, adding grocery items back into Paprika)
- Photo serving (photos exist on disk at `../Photos/<UUID>/`)
- Live reload (currently loads DB into memory once at startup)

## Style

- Zod schemas for all MCP tool inputs
- Domain types in types.ts, raw row types declared inline in repository.ts
- All tool annotations set `readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true`
