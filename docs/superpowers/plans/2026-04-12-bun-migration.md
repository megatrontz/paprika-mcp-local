# Bun Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate paprika-mcp from Node.js + sql.js to Bun + bun:sqlite, enabling live reads, simplifying the toolchain, and adding repository tests.

**Architecture:** Surgical swap — replace the SQLite driver in `repository.ts`, update the entry point and package config, keep the same 3-file structure and all public APIs. Add tests using `bun:test` with a fixture built from Paprika's real schema.

**Tech Stack:** Bun runtime, `bun:sqlite`, `bun:test`, `@modelcontextprotocol/sdk`, `zod`

---

### Task 1: Git Init + Baseline Commit

**Files:**
- Create: `.gitignore`

- [ ] **Step 1: Initialize git**

```bash
cd /path/to/paprika-mcp
git init
```

- [ ] **Step 2: Create .gitignore**

Create `.gitignore`:

```
node_modules/
dist/
*.sqlite
!test/fixtures/test-paprika.sqlite
.DS_Store
```

Note: We ignore all `.sqlite` files (don't want to commit the user's real Paprika DB) but explicitly un-ignore the test fixture.

- [ ] **Step 3: Baseline commit**

```bash
git add .
git commit -m "chore: baseline commit before Bun migration

Captures the Node.js + sql.js state of the project for clean diff history."
```

---

### Task 2: Smoke Test MCP SDK Under Bun

**Files:** None modified — verification only

- [ ] **Step 1: Install Bun if not present**

```bash
bun --version || curl -fsSL https://bun.sh/install | bash
```

- [ ] **Step 2: Run existing server under Bun**

```bash
cd /path/to/paprika-mcp
bun run src/index.ts &
SERVER_PID=$!
sleep 2

# Send an MCP initialize request over stdin
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"smoke-test","version":"0.1.0"}}}' | timeout 5 bun run src/index.ts 2>/dev/null | head -1

kill $SERVER_PID 2>/dev/null
```

Expected: A JSON-RPC response containing `"result"` with server capabilities. If this fails with import errors or transport issues, stop and investigate before proceeding.

- [ ] **Step 3: Document result**

If the smoke test passes, proceed. If it fails, capture the error — the most likely failure mode is the MCP SDK using a Node.js API that Bun doesn't support, which would need investigation before continuing.

---

### Task 3: Swap Repository Layer (sql.js → bun:sqlite)

**Files:**
- Modify: `src/repository.ts`

- [ ] **Step 1: Rewrite repository.ts**

Replace the entire file with the `bun:sqlite` version. The public API is identical — same class name, same method signatures, same return types. What changes: the import, the constructor (synchronous, opens file directly), and query execution (Bun returns objects natively).

```typescript
/**
 * PaprikaRepository — Data access layer for Paprika's Core Data SQLite database.
 *
 * Design decisions:
 * - Repository pattern: isolates all SQL and schema knowledge here.
 *   MCP tool handlers never touch the database directly.
 * - Uses bun:sqlite for native SQLite access — opens the file directly
 *   in read-only mode, enabling live reads (queries reflect Paprika's
 *   latest state without restarting the server).
 * - Core Data epoch: Paprika stores timestamps as seconds since 2001-01-01T00:00:00Z
 *   (NSDate reference date), not Unix epoch. We convert to ISO 8601 on the way out.
 */

import { Database } from "bun:sqlite";
import type { Recipe, RecipeSummary, Category } from "./types.js";

/** Core Data epoch offset: seconds between 1970-01-01 and 2001-01-01 */
const CORE_DATA_EPOCH_OFFSET = 978307200;

function coreDataTimestampToISO(timestamp: number | null): string | null {
  if (timestamp === null || timestamp === undefined) return null;
  const unixMs = (timestamp + CORE_DATA_EPOCH_OFFSET) * 1000;
  return new Date(unixMs).toISOString();
}

export class PaprikaRepository {
  private db: Database;

  constructor(dbPath: string, options?: { readonly?: boolean }) {
    this.db = new Database(dbPath, {
      readonly: options?.readonly ?? true,
    });
    // Enable WAL mode for better concurrent read performance
    this.db.exec("PRAGMA journal_mode = WAL");
  }

  /**
   * List all recipes (summary view — no ingredients/directions for efficiency).
   * Filters out trashed recipes.
   */
  listRecipes(): RecipeSummary[] {
    const rows = this.db
      .query<
        {
          Z_PK: number;
          ZUID: string;
          ZNAME: string;
          ZRATING: number | null;
          ZTOTALTIME: string | null;
          ZSERVINGS: string | null;
          ZONFAVORITES: number;
          ZSOURCE: string | null;
        },
        []
      >(
        `SELECT Z_PK, ZUID, ZNAME, ZRATING, ZTOTALTIME, ZSERVINGS, ZONFAVORITES, ZSOURCE
         FROM ZRECIPE
         WHERE ZINTRASH = 0
         ORDER BY ZNAME COLLATE NOCASE`
      )
      .all();

    return rows.map((row) => ({
      uid: row.ZUID,
      name: row.ZNAME,
      categories: this.getCategoriesForRecipePk(row.Z_PK),
      rating: row.ZRATING,
      totalTime: row.ZTOTALTIME,
      servings: row.ZSERVINGS,
      isFavorite: row.ZONFAVORITES === 1,
      source: row.ZSOURCE,
    }));
  }

  /**
   * Get a single recipe by UID with full detail (ingredients, directions, etc.).
   */
  getRecipe(uid: string): Recipe | null {
    const row = this.db
      .query<
        {
          Z_PK: number;
          ZUID: string;
          ZNAME: string;
          ZINGREDIENTS: string | null;
          ZDIRECTIONS: string | null;
          ZDESCRIPTIONTEXT: string | null;
          ZNOTES: string | null;
          ZNUTRITIONALINFO: string | null;
          ZPREPTIME: string | null;
          ZCOOKTIME: string | null;
          ZTOTALTIME: string | null;
          ZSERVINGS: string | null;
          ZDIFFICULTY: string | null;
          ZRATING: number | null;
          ZSOURCE: string | null;
          ZSOURCEURL: string | null;
          ZIMAGEURL: string | null;
          ZONFAVORITES: number;
          ZISPINNED: number;
          ZCREATED: number | null;
        },
        [string]
      >(
        `SELECT Z_PK, ZUID, ZNAME, ZINGREDIENTS, ZDIRECTIONS, ZDESCRIPTIONTEXT,
                ZNOTES, ZNUTRITIONALINFO, ZPREPTIME, ZCOOKTIME, ZTOTALTIME,
                ZSERVINGS, ZDIFFICULTY, ZRATING, ZSOURCE, ZSOURCEURL,
                ZIMAGEURL, ZONFAVORITES, ZISPINNED, ZCREATED
         FROM ZRECIPE
         WHERE ZUID = ? AND ZINTRASH = 0`
      )
      .get(uid);

    if (!row) return null;

    return {
      uid: row.ZUID,
      name: row.ZNAME,
      ingredients: row.ZINGREDIENTS,
      directions: row.ZDIRECTIONS,
      description: row.ZDESCRIPTIONTEXT,
      notes: row.ZNOTES,
      nutritionalInfo: row.ZNUTRITIONALINFO,
      prepTime: row.ZPREPTIME,
      cookTime: row.ZCOOKTIME,
      totalTime: row.ZTOTALTIME,
      servings: row.ZSERVINGS,
      difficulty: row.ZDIFFICULTY,
      rating: row.ZRATING,
      source: row.ZSOURCE,
      sourceUrl: row.ZSOURCEURL,
      imageUrl: row.ZIMAGEURL,
      isFavorite: row.ZONFAVORITES === 1,
      isPinned: row.ZISPINNED === 1,
      categories: this.getCategoriesForRecipePk(row.Z_PK),
      created: coreDataTimestampToISO(row.ZCREATED),
    };
  }

  /**
   * Search recipes by name and/or ingredients using SQLite LIKE.
   * At least one of query or category must be provided.
   */
  searchRecipes(opts: {
    query?: string;
    category?: string;
    maxResults?: number;
  }): RecipeSummary[] {
    const conditions: string[] = ["r.ZINTRASH = 0"];
    const params: (string | number)[] = [];

    if (opts.query) {
      conditions.push(
        "(r.ZNAME LIKE ? OR r.ZINGREDIENTS LIKE ? OR r.ZDESCRIPTIONTEXT LIKE ?)"
      );
      const pattern = `%${opts.query}%`;
      params.push(pattern, pattern, pattern);
    }

    if (opts.category) {
      conditions.push(
        `r.Z_PK IN (
          SELECT j.Z_12RECIPES FROM Z_12CATEGORIES j
          JOIN ZRECIPECATEGORY c ON c.Z_PK = j.Z_13CATEGORIES
          WHERE c.ZNAME LIKE ?
        )`
      );
      params.push(opts.category);
    }

    const limit = opts.maxResults ?? 50;
    params.push(limit);

    const sql = `SELECT r.Z_PK, r.ZUID, r.ZNAME, r.ZRATING, r.ZTOTALTIME, r.ZSERVINGS, r.ZONFAVORITES, r.ZSOURCE
       FROM ZRECIPE r
       WHERE ${conditions.join(" AND ")}
       ORDER BY r.ZNAME COLLATE NOCASE
       LIMIT ?`;

    const rows = this.db.query(sql).all(...params) as Array<{
      Z_PK: number;
      ZUID: string;
      ZNAME: string;
      ZRATING: number | null;
      ZTOTALTIME: string | null;
      ZSERVINGS: string | null;
      ZONFAVORITES: number;
      ZSOURCE: string | null;
    }>;

    return rows.map((row) => ({
      uid: row.ZUID,
      name: row.ZNAME,
      categories: this.getCategoriesForRecipePk(row.Z_PK),
      rating: row.ZRATING,
      totalTime: row.ZTOTALTIME,
      servings: row.ZSERVINGS,
      isFavorite: row.ZONFAVORITES === 1,
      source: row.ZSOURCE,
    }));
  }

  /**
   * List all categories with their recipe counts.
   */
  listCategories(): Category[] {
    const rows = this.db
      .query<
        {
          ZUID: string;
          ZNAME: string;
          recipe_count: number;
        },
        []
      >(
        `SELECT c.ZUID, c.ZNAME, COUNT(j.Z_12RECIPES) as recipe_count
         FROM ZRECIPECATEGORY c
         LEFT JOIN Z_12CATEGORIES j ON j.Z_13CATEGORIES = c.Z_PK
         LEFT JOIN ZRECIPE r ON r.Z_PK = j.Z_12RECIPES AND r.ZINTRASH = 0
         GROUP BY c.Z_PK
         ORDER BY c.ZNAME COLLATE NOCASE`
      )
      .all();

    return rows.map((row) => ({
      uid: row.ZUID,
      name: row.ZNAME,
      recipeCount: row.recipe_count,
    }));
  }

  /**
   * Resolve category names for a recipe's internal PK.
   * This encapsulates the Core Data join table convention.
   */
  private getCategoriesForRecipePk(pk: number): string[] {
    const rows = this.db
      .query<{ ZNAME: string }, [number]>(
        `SELECT c.ZNAME
         FROM ZRECIPECATEGORY c
         JOIN Z_12CATEGORIES j ON j.Z_13CATEGORIES = c.Z_PK
         WHERE j.Z_12RECIPES = ?
         ORDER BY c.ZNAME COLLATE NOCASE`
      )
      .all(pk);

    return rows.map((r) => r.ZNAME);
  }

  close(): void {
    this.db.close();
  }
}
```

Key changes from the original:
- `import { Database } from "bun:sqlite"` replaces `initSqlJs`
- Constructor opens file directly (synchronous, no `init()` needed)
- `readonly` option defaults to `true` but is configurable for future write path
- `db.query<RowType, ParamType>(sql).all(...params)` replaces the manual `queryAll` helper
- `db.query<RowType, ParamType>(sql).get(param)` replaces `queryOne`
- `searchRecipes` uses spread params with a cast since the param count is dynamic

- [ ] **Step 2: Verify the file compiles**

```bash
cd /path/to/paprika-mcp
bunx tsc --noEmit src/repository.ts
```

Expected: No errors (may require Task 5's tsconfig changes first — if so, do Task 5 Step 1 before this verification).

---

### Task 4: Update Server Entry Point

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Update index.ts**

Three changes:
1. Shebang: `node` → `bun`
2. Remove `repo.init()` call (constructor handles it now)
3. Simplify `main()` since repo is ready at construction

Replace the shebang line:

```
#!/usr/bin/env bun
```

Remove the `repo.init()` line from `main()`. The function becomes:

```typescript
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Graceful shutdown
  process.on("SIGINT", () => {
    repo.close();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    repo.close();
    process.exit(0);
  });
}
```

Everything else in the file stays identical — all tool registrations, Zod schemas, `resolveDbPath()`, imports (except removing the unused `readFileSync` if it was imported here — check: it's not, it was only in `repository.ts`).

- [ ] **Step 2: Verify the file compiles**

```bash
bunx tsc --noEmit src/index.ts
```

---

### Task 5: Update Package Config

**Files:**
- Modify: `package.json`
- Modify: `tsconfig.json`

- [ ] **Step 1: Update tsconfig.json**

Add `"types": ["bun-types"]` to `compilerOptions`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "types": ["bun-types"]
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 2: Update package.json**

```json
{
  "name": "paprika-mcp",
  "version": "1.0.0",
  "description": "MCP server for reading Paprika Recipe Manager's SQLite database",
  "type": "module",
  "main": "src/index.ts",
  "scripts": {
    "build": "tsc",
    "start": "bun run src/index.ts",
    "dev": "bun --watch src/index.ts",
    "test": "bun test"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.29.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@types/bun": "latest",
    "typescript": "^5.6.0"
  }
}
```

Changes: removed `sql.js`, `@types/sql.js`, `@types/node`, `tsx`. Added `@types/bun`. Updated `main`, all scripts. Added `test` script.

- [ ] **Step 3: Install new dependencies**

```bash
cd /path/to/paprika-mcp
rm -rf node_modules package-lock.json
bun install
```

Expected: `bun.lockb` created, `node_modules/` populated with fewer packages.

- [ ] **Step 4: Type-check the whole project**

```bash
cd /path/to/paprika-mcp
bunx tsc --noEmit
```

Expected: No type errors.

- [ ] **Step 5: Commit the migration**

```bash
git add src/repository.ts src/index.ts package.json tsconfig.json bun.lockb
git rm package-lock.json 2>/dev/null || true
git commit -m "feat: migrate from Node.js + sql.js to Bun + bun:sqlite

- Replace sql.js (WASM) with bun:sqlite (native) for SQLite access
- Enable live reads: queries reflect Paprika's latest state without restart
- Drop tsx, @types/sql.js, @types/node dev dependencies
- Simplify repository: synchronous constructor, no async init() needed
- Update scripts to use bun runtime directly (no build step for dev)"
```

---

### Task 6: Build Test Fixture From Real Schema

**Files:**
- Create: `test/fixtures/create-fixture.ts`
- Create: `test/fixtures/test-paprika.sqlite` (generated)

- [ ] **Step 1: Create the fixture generator script**

This script uses the real Paprika schema DDL (extracted from the actual database) and inserts known test data.

Create `test/fixtures/create-fixture.ts`:

```typescript
/**
 * Generates a test SQLite fixture using Paprika's real Core Data schema.
 *
 * Schema extracted from:
 *   ~/Library/Group Containers/72KVKW69K8.com.hindsightlabs.paprika.mac.v3/Data/Database/Paprika.sqlite
 *
 * Run: bun run test/fixtures/create-fixture.ts
 */

import { Database } from "bun:sqlite";
import { unlinkSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";

const FIXTURE_PATH = join(dirname(import.meta.path), "test-paprika.sqlite");

// Clean up any existing fixture
if (existsSync(FIXTURE_PATH)) {
  unlinkSync(FIXTURE_PATH);
}

const db = new Database(FIXTURE_PATH);

// ─── Schema (from real Paprika database) ─────────────────────────────────────

db.exec(`
  CREATE TABLE ZRECIPE (
    Z_PK INTEGER PRIMARY KEY,
    Z_ENT INTEGER,
    Z_OPT INTEGER,
    ZINTRASH INTEGER,
    ZISPINNED INTEGER,
    ZISSYNCED INTEGER,
    ZONFAVORITES INTEGER,
    ZPHOTOISDOWNLOADED INTEGER,
    ZPHOTOISUPLOADED INTEGER,
    ZRATING INTEGER,
    ZCREATED TIMESTAMP,
    ZCOOKTIME VARCHAR,
    ZDESCRIPTIONTEXT VARCHAR,
    ZDIFFICULTY VARCHAR,
    ZDIRECTIONS VARCHAR,
    ZIMAGEURL VARCHAR,
    ZINGREDIENTS VARCHAR,
    ZNAME VARCHAR,
    ZNOTES VARCHAR,
    ZNUTRITIONALINFO VARCHAR,
    ZPHOTO VARCHAR,
    ZPHOTOHASH VARCHAR,
    ZPHOTOLARGE VARCHAR,
    ZPREPTIME VARCHAR,
    ZSCALE VARCHAR,
    ZSELECTEDDIRECTION VARCHAR,
    ZSELECTEDINGREDIENTS VARCHAR,
    ZSERVINGS VARCHAR,
    ZSOURCE VARCHAR,
    ZSOURCEURL VARCHAR,
    ZSTATUS VARCHAR,
    ZSYNCHASH VARCHAR,
    ZTOTALTIME VARCHAR,
    ZUID VARCHAR
  );

  CREATE TABLE ZRECIPECATEGORY (
    Z_PK INTEGER PRIMARY KEY,
    Z_ENT INTEGER,
    Z_OPT INTEGER,
    ZISSYNCED INTEGER,
    ZORDERFLAG INTEGER,
    ZPARENT INTEGER,
    ZNAME VARCHAR,
    ZSTATUS VARCHAR,
    ZUID VARCHAR
  );

  CREATE TABLE Z_12CATEGORIES (
    Z_12RECIPES INTEGER,
    Z_13CATEGORIES INTEGER,
    PRIMARY KEY (Z_12RECIPES, Z_13CATEGORIES)
  );

  -- Indexes used by our queries
  CREATE INDEX Z_Recipe_byUidIndex ON ZRECIPE (ZUID COLLATE BINARY ASC);
  CREATE INDEX Z_Recipe_byNameIndex ON ZRECIPE (ZNAME COLLATE BINARY ASC);
  CREATE INDEX Z_12CATEGORIES_Z_13CATEGORIES_INDEX ON Z_12CATEGORIES (Z_13CATEGORIES, Z_12RECIPES);
  CREATE INDEX Z_RecipeCategory_byUidIndex ON ZRECIPECATEGORY (ZUID COLLATE BINARY ASC);
`);

// ─── Test Data ───────────────────────────────────────────────────────────────

// Core Data epoch offset: 978307200 seconds between 1970-01-01 and 2001-01-01
// Test timestamp: 2024-03-15T12:00:00Z = Unix 1710504000 = Core Data 732196800
const MARCH_15_2024_CORE_DATA = 732196800;

// Categories
db.exec(`
  INSERT INTO ZRECIPECATEGORY (Z_PK, Z_ENT, Z_OPT, ZISSYNCED, ZORDERFLAG, ZPARENT, ZNAME, ZSTATUS, ZUID)
  VALUES
    (1, 7, 1, 1, 0, NULL, 'Dinner',    NULL, 'cat-dinner-uid'),
    (2, 7, 1, 1, 1, NULL, 'Dessert',   NULL, 'cat-dessert-uid'),
    (3, 7, 1, 1, 2, NULL, 'Breakfast', NULL, 'cat-breakfast-uid');
`);

// Recipes (5 total: 4 active, 1 trashed)
db.exec(`
  INSERT INTO ZRECIPE (
    Z_PK, Z_ENT, Z_OPT, ZINTRASH, ZISPINNED, ZISSYNCED, ZONFAVORITES,
    ZPHOTOISDOWNLOADED, ZPHOTOISUPLOADED, ZRATING, ZCREATED,
    ZCOOKTIME, ZDESCRIPTIONTEXT, ZDIFFICULTY, ZDIRECTIONS, ZIMAGEURL,
    ZINGREDIENTS, ZNAME, ZNOTES, ZNUTRITIONALINFO, ZPREPTIME,
    ZSERVINGS, ZSOURCE, ZSOURCEURL, ZTOTALTIME, ZUID
  ) VALUES
    (1, 6, 1, 0, 0, 1, 1, 0, 0, 5, ${MARCH_15_2024_CORE_DATA},
     '30 min', 'A classic Italian pasta dish', 'Easy', 'Cook pasta. Make sauce. Combine.',
     NULL, '1 lb spaghetti\n2 eggs\n4 oz pancetta\n1 cup parmesan',
     'Spaghetti Carbonara', 'Use guanciale for authentic version',
     'Calories: 450', '15 min', '4', 'Bon Appetit', 'https://bonappetit.com/carbonara',
     '45 min', 'recipe-carbonara-uid'),

    (2, 6, 1, 0, 0, 1, 0, 0, 0, 4, ${MARCH_15_2024_CORE_DATA - 86400},
     '20 min', 'Quick weeknight chicken stir fry', 'Easy',
     'Slice chicken. Heat wok. Stir fry vegetables. Add sauce.',
     NULL, '1 lb chicken breast\n2 cups broccoli\nsoy sauce\nginger',
     'Chicken Stir Fry', NULL, NULL, '10 min', '2', 'Woks of Life',
     'https://woksoflife.com/stirfry', '30 min', 'recipe-stirfry-uid'),

    (3, 6, 1, 0, 1, 1, 0, 0, 0, NULL, ${MARCH_15_2024_CORE_DATA - 172800},
     '25 min', 'Rich chocolate brownies', 'Medium',
     'Melt chocolate. Mix batter. Bake at 350F for 25 minutes.',
     NULL, '8 oz dark chocolate\n1 cup butter\n1.5 cups sugar\n3 eggs\n1 cup flour',
     'Chocolate Brownies', 'Do not overbake', NULL, '15 min', '12',
     'Sally''s Baking Addiction', NULL, '40 min', 'recipe-brownies-uid'),

    (4, 6, 1, 0, 0, 1, 0, 0, 0, 3, ${MARCH_15_2024_CORE_DATA - 259200},
     '0 min', 'Fluffy scrambled eggs with herbs', 'Easy',
     'Whisk eggs. Cook low and slow. Fold in herbs.',
     NULL, '4 eggs\n2 tbsp butter\nfresh chives\nsalt and pepper',
     'Scrambled Eggs', NULL, NULL, '5 min', '2', NULL, NULL,
     '5 min', 'recipe-eggs-uid'),

    (5, 6, 1, 1, 0, 1, 0, 0, 0, 2, ${MARCH_15_2024_CORE_DATA - 345600},
     '10 min', 'This recipe is in the trash', 'Easy',
     'Should not appear in results.',
     NULL, 'nothing', 'Trashed Recipe', NULL, NULL, '5 min', '1',
     NULL, NULL, '15 min', 'recipe-trashed-uid');
`);

// Category assignments (join table)
// Carbonara -> Dinner
// Stir Fry -> Dinner
// Brownies -> Dessert
// Eggs -> Breakfast
// Trashed Recipe -> Dinner (should still not appear due to ZINTRASH filter)
db.exec(`
  INSERT INTO Z_12CATEGORIES (Z_12RECIPES, Z_13CATEGORIES) VALUES
    (1, 1),
    (2, 1),
    (3, 2),
    (4, 3),
    (5, 1);
`);

db.close();

console.log(`Test fixture created: ${FIXTURE_PATH}`);
```

- [ ] **Step 2: Generate the fixture**

```bash
cd /path/to/paprika-mcp
bun run test/fixtures/create-fixture.ts
```

Expected: `Test fixture created: .../test/fixtures/test-paprika.sqlite`

- [ ] **Step 3: Verify fixture contents**

```bash
sqlite3 test/fixtures/test-paprika.sqlite "SELECT ZNAME, ZINTRASH FROM ZRECIPE ORDER BY Z_PK"
```

Expected:
```
Spaghetti Carbonara|0
Chicken Stir Fry|0
Chocolate Brownies|0
Scrambled Eggs|0
Trashed Recipe|1
```

- [ ] **Step 4: Commit fixture**

```bash
git add test/fixtures/create-fixture.ts test/fixtures/test-paprika.sqlite
git commit -m "test: add SQLite fixture from real Paprika schema

Schema DDL extracted from actual Paprika database. Test data includes
5 recipes (1 trashed), 3 categories, and join table entries for
validating all repository query paths."
```

---

### Task 7: Write Repository Tests

**Files:**
- Create: `test/repository.test.ts`

- [ ] **Step 1: Write all repository tests**

Create `test/repository.test.ts`:

```typescript
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { join, dirname } from "node:path";
import { PaprikaRepository } from "../src/repository.js";

const FIXTURE_PATH = join(
  dirname(import.meta.path),
  "fixtures",
  "test-paprika.sqlite"
);

let repo: PaprikaRepository;

beforeAll(() => {
  repo = new PaprikaRepository(FIXTURE_PATH, { readonly: true });
});

afterAll(() => {
  repo.close();
});

// ─── listRecipes ─────────────────────────────────────────────────────────────

describe("listRecipes", () => {
  test("returns all non-trashed recipes", () => {
    const recipes = repo.listRecipes();
    expect(recipes).toHaveLength(4);

    const names = recipes.map((r) => r.name);
    expect(names).toContain("Spaghetti Carbonara");
    expect(names).toContain("Chicken Stir Fry");
    expect(names).toContain("Chocolate Brownies");
    expect(names).toContain("Scrambled Eggs");
  });

  test("excludes trashed recipes", () => {
    const recipes = repo.listRecipes();
    const names = recipes.map((r) => r.name);
    expect(names).not.toContain("Trashed Recipe");
  });

  test("sorts by name case-insensitively", () => {
    const recipes = repo.listRecipes();
    const names = recipes.map((r) => r.name);
    expect(names).toEqual([
      "Chicken Stir Fry",
      "Chocolate Brownies",
      "Scrambled Eggs",
      "Spaghetti Carbonara",
    ]);
  });

  test("maps isFavorite from integer to boolean", () => {
    const recipes = repo.listRecipes();
    const carbonara = recipes.find((r) => r.name === "Spaghetti Carbonara");
    const stirFry = recipes.find((r) => r.name === "Chicken Stir Fry");
    expect(carbonara?.isFavorite).toBe(true);
    expect(stirFry?.isFavorite).toBe(false);
  });

  test("includes categories for each recipe", () => {
    const recipes = repo.listRecipes();
    const carbonara = recipes.find((r) => r.name === "Spaghetti Carbonara");
    expect(carbonara?.categories).toEqual(["Dinner"]);
  });
});

// ─── getRecipe ───────────────────────────────────────────────────────────────

describe("getRecipe", () => {
  test("returns full recipe detail by UID", () => {
    const recipe = repo.getRecipe("recipe-carbonara-uid");
    expect(recipe).not.toBeNull();
    expect(recipe!.name).toBe("Spaghetti Carbonara");
    expect(recipe!.ingredients).toContain("spaghetti");
    expect(recipe!.directions).toContain("Cook pasta");
    expect(recipe!.description).toBe("A classic Italian pasta dish");
    expect(recipe!.notes).toBe("Use guanciale for authentic version");
    expect(recipe!.nutritionalInfo).toBe("Calories: 450");
    expect(recipe!.prepTime).toBe("15 min");
    expect(recipe!.cookTime).toBe("30 min");
    expect(recipe!.totalTime).toBe("45 min");
    expect(recipe!.servings).toBe("4");
    expect(recipe!.difficulty).toBe("Easy");
    expect(recipe!.rating).toBe(5);
    expect(recipe!.source).toBe("Bon Appetit");
    expect(recipe!.sourceUrl).toBe("https://bonappetit.com/carbonara");
    expect(recipe!.isFavorite).toBe(true);
    expect(recipe!.isPinned).toBe(false);
    expect(recipe!.categories).toEqual(["Dinner"]);
  });

  test("converts Core Data timestamp to ISO 8601", () => {
    const recipe = repo.getRecipe("recipe-carbonara-uid");
    // Core Data timestamp 732196800 + 978307200 offset = Unix 1710504000
    // = 2024-03-15T12:00:00.000Z
    expect(recipe!.created).toBe("2024-03-15T12:00:00.000Z");
  });

  test("returns null for unknown UID", () => {
    const recipe = repo.getRecipe("nonexistent-uid");
    expect(recipe).toBeNull();
  });

  test("returns null for trashed recipe UID", () => {
    const recipe = repo.getRecipe("recipe-trashed-uid");
    expect(recipe).toBeNull();
  });
});

// ─── searchRecipes ───────────────────────────────────────────────────────────

describe("searchRecipes", () => {
  test("matches recipe name", () => {
    const results = repo.searchRecipes({ query: "Carbonara" });
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe("Spaghetti Carbonara");
  });

  test("matches ingredients", () => {
    const results = repo.searchRecipes({ query: "pancetta" });
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe("Spaghetti Carbonara");
  });

  test("matches description", () => {
    const results = repo.searchRecipes({ query: "weeknight" });
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe("Chicken Stir Fry");
  });

  test("filters by category", () => {
    const results = repo.searchRecipes({ category: "Dinner" });
    expect(results).toHaveLength(2);
    const names = results.map((r) => r.name);
    expect(names).toContain("Spaghetti Carbonara");
    expect(names).toContain("Chicken Stir Fry");
  });

  test("combines query and category filter", () => {
    const results = repo.searchRecipes({
      query: "chicken",
      category: "Dinner",
    });
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe("Chicken Stir Fry");
  });

  test("excludes trashed recipes from category results", () => {
    // Trashed recipe is in Dinner category but should not appear
    const results = repo.searchRecipes({ category: "Dinner" });
    const names = results.map((r) => r.name);
    expect(names).not.toContain("Trashed Recipe");
  });

  test("respects maxResults limit", () => {
    const results = repo.searchRecipes({ query: "e", maxResults: 2 });
    expect(results.length).toBeLessThanOrEqual(2);
  });
});

// ─── listCategories ──────────────────────────────────────────────────────────

describe("listCategories", () => {
  test("returns all categories with recipe counts", () => {
    const categories = repo.listCategories();
    expect(categories).toHaveLength(3);

    const dinner = categories.find((c) => c.name === "Dinner");
    const dessert = categories.find((c) => c.name === "Dessert");
    const breakfast = categories.find((c) => c.name === "Breakfast");

    // Dinner: Carbonara + Stir Fry (trashed recipe not counted)
    expect(dinner?.recipeCount).toBe(2);
    // Dessert: Brownies
    expect(dessert?.recipeCount).toBe(1);
    // Breakfast: Eggs
    expect(breakfast?.recipeCount).toBe(1);
  });

  test("does not count trashed recipes in category totals", () => {
    const categories = repo.listCategories();
    const dinner = categories.find((c) => c.name === "Dinner");
    // Trashed recipe is assigned to Dinner but should not be counted
    expect(dinner?.recipeCount).toBe(2);
  });

  test("sorts by name case-insensitively", () => {
    const categories = repo.listCategories();
    const names = categories.map((c) => c.name);
    expect(names).toEqual(["Breakfast", "Dessert", "Dinner"]);
  });
});
```

- [ ] **Step 2: Run the tests**

```bash
cd /path/to/paprika-mcp
bun test
```

Expected: All tests pass. If any fail, fix the repository code or test expectations before proceeding.

- [ ] **Step 3: Commit tests**

```bash
git add test/repository.test.ts
git commit -m "test: add repository tests covering all query paths

Tests run against a fixture built from Paprika's real schema.
Covers: listRecipes, getRecipe, searchRecipes, listCategories,
trash filtering, category joins, timestamp conversion, sorting."
```

---

### Task 8: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update CLAUDE.md**

Replace the full contents of `CLAUDE.md` with:

```markdown
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

| Tool | Input | Returns |
|------|-------|---------|
| `list_recipes` | offset, limit | Paginated RecipeSummary[] |
| `get_recipe` | uid | Full Recipe with ingredients/directions |
| `search_recipes` | query?, category?, maxResults | RecipeSummary[] matching keyword/category |
| `list_categories` | (none) | Category[] with recipe counts |

## What's Not Built Yet

- Category management / write operations (planned — will use bun:sqlite write mode)
- Grocery list / pantry item tools (tables exist: ZGROCERYITEM, ZPANTRYITEM)
- Meal plan tools (tables exist: ZMEAL, ZMEALTYPE, ZMENU, ZMENUITEM)
- Photo serving (photos exist on disk at `../Photos/<UUID>/`)

## Style

- Zod schemas for all MCP tool inputs
- Domain types in types.ts, raw row types declared inline in repository.ts
- All current tool annotations set `readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true`
- Tests use bun:test with a SQLite fixture built from Paprika's real schema
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md for Bun migration

Reflect bun:sqlite, live reads, updated commands, test structure,
and future write path for category management."
```

---

### Task 9: Final Verification

**Files:** None modified — verification only

- [ ] **Step 1: Run all tests**

```bash
cd /path/to/paprika-mcp
bun test
```

Expected: All tests pass.

- [ ] **Step 2: Type-check**

```bash
bunx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Smoke test the MCP server**

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"smoke-test","version":"0.1.0"}}}' | timeout 5 bun run src/index.ts 2>/dev/null | head -1
```

Expected: JSON-RPC response with server capabilities (name: "paprika-mcp", version: "1.0.0").

- [ ] **Step 4: Verify tool listing**

```bash
echo -e '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"test","version":"0.1.0"}}}\n{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' | timeout 5 bun run src/index.ts 2>/dev/null | tail -1
```

Expected: JSON-RPC response listing all four tools: `list_recipes`, `get_recipe`, `search_recipes`, `list_categories`.

- [ ] **Step 5: Final commit (if any fixups were needed)**

Only if previous steps required changes:

```bash
git add -A
git commit -m "fix: address issues found during final verification"
```
