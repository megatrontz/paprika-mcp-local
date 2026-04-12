# Bun Migration Design — paprika-mcp

**Date:** 2026-04-12
**Approach:** Surgical Swap (runtime migration, preserve architecture)

## Context

paprika-mcp is a read-only MCP server (TypeScript, stdio transport) that exposes Paprika Recipe Manager's local SQLite database to Claude Desktop. It currently runs on Node.js with sql.js (SQLite compiled to WASM). This migration swaps the runtime to Bun, replacing sql.js with Bun's built-in `bun:sqlite`.

## Goals

- Replace sql.js with `bun:sqlite` for native SQLite access
- Enable live reads (queries reflect Paprika's latest state, no restart needed)
- Simplify the toolchain (drop tsx, @types/sql.js, sql.js)
- Add repository tests using `bun:test` with a real SQLite fixture
- Initialize git with clean history

## Non-Goals

- Architectural restructuring (same 3-file structure, same public APIs)
- Write operations (future work for category management — see Design Constraints)
- New MCP tools
- HTTP/SSE transport (stdio is correct for this use case)

## Design Constraints

- **Future write path.** The database will not stay read-only forever — category management via Claude/agents is planned. We open the DB as `{ readonly: true }` now but do not bake read-only assumptions into the type system, class naming, or architecture. Tool annotations remain `readOnlyHint: true` for current tools; future write tools set their own.
- **MCP SDK compatibility.** The MCP SDK uses Node.js APIs (process.stdin/stdout for stdio transport). A smoke test must verify the SDK works under Bun before any rewriting begins.

## Changes by File

### `repository.ts` — Data Access Layer

The largest change. sql.js WASM is replaced with `bun:sqlite`.

| Aspect | Before (sql.js) | After (bun:sqlite) |
|--------|-----------------|---------------------|
| Import | `import initSqlJs` from `"sql.js"` | `import { Database } from "bun:sqlite"` |
| Initialization | Async `init()` — load WASM, read file into buffer, create DB from buffer | Synchronous constructor: `new Database(path, { readonly: true })` |
| `getDb()` guard | Throws if `init()` not called | Removed — DB ready at construction |
| Query helpers | Custom `queryAll`/`queryOne` zipping columns+values into objects | `db.query(sql).all(...params)` returns objects natively |
| Live reads | No — file read into memory once at startup | Yes — file opened directly, WAL-compatible |
| Cleanup | `db.close()` | `db.close()` (same) |

**Unchanged:** Class name `PaprikaRepository`, all public method signatures, all SQL queries, `coreDataTimestampToISO()`, all domain type mapping, `types.ts`.

### `index.ts` — MCP Server Entry Point

Minimal changes:

- Shebang: `#!/usr/bin/env node` → `#!/usr/bin/env bun`
- Remove `await repo.init()` from `main()` (repo ready at construction)
- All tool registrations, Zod schemas, transport setup, shutdown handlers — unchanged

### `types.ts` — Domain Types

No changes.

### `package.json`

| Aspect | Before | After |
|--------|--------|-------|
| Dependencies | `sql.js`, `@modelcontextprotocol/sdk`, `zod` | `@modelcontextprotocol/sdk`, `zod` |
| Dev dependencies | `@types/node`, `@types/sql.js`, `tsx`, `typescript` | `@types/bun`, `typescript` |
| `build` script | `tsc` | `tsc` (type-checking only) |
| `start` script | `node dist/index.js` | `bun run src/index.ts` |
| `dev` script | `tsx src/index.ts` | `bun --watch src/index.ts` |

Net: 6 packages → 3 packages.

### `tsconfig.json`

- Add `"types": ["bun-types"]` to `compilerOptions` so TypeScript recognizes `bun:sqlite` and other Bun globals
- Keep all existing options (`strict: true`, `declaration: true`, etc.)

### `CLAUDE.md`

- Replace sql.js references with `bun:sqlite`
- Reframe "read-only" as current state, not permanent architecture (future write path for categories)
- Update build/run commands
- Note live reads behavior
- Add test section

## Tests

Using `bun:test` with a real SQLite fixture.

### Fixture Creation

- Extract schema from the real Paprika database (`sqlite3 ... .schema`)
- Store the DDL in `test/fixtures/create-fixture.ts`
- Insert known test data: ~5 recipes (1 trashed), 3 categories, join table entries, verifiable Core Data timestamp
- Output: `test/fixtures/test-paprika.sqlite`

### Test Coverage

| Test | Validates |
|------|-----------|
| `listRecipes()` returns non-trashed recipes | Basic query + trash filtering |
| `listRecipes()` excludes trashed recipes | `ZINTRASH = 0` filter |
| `getRecipe(uid)` returns full detail with categories | Join resolution, field mapping, timestamp conversion |
| `getRecipe(uid)` returns null for unknown UID | Not-found path |
| `searchRecipes({ query })` matches name/ingredients/description | LIKE search across columns |
| `searchRecipes({ category })` filters by category | Category join filter |
| `listCategories()` returns counts | GROUP BY + LEFT JOIN count |

### File Structure

```
test/
  fixtures/
    create-fixture.ts      # Bun script: real schema DDL + test data → SQLite file
    test-paprika.sqlite    # Generated fixture (committed)
  repository.test.ts       # All repo tests
```

## Execution Order

1. Git init + .gitignore + baseline commit of current state
2. Smoke test: run existing MCP server under Bun to verify SDK compatibility
3. Swap `repository.ts` (sql.js → bun:sqlite)
4. Update `index.ts` (shebang, remove init)
5. Update `package.json` (deps, scripts)
6. Update `tsconfig.json` (bun types)
7. Extract real Paprika schema, build test fixture
8. Write repository tests
9. Update CLAUDE.md
10. Final verification: `bun run src/index.ts` works as MCP server
