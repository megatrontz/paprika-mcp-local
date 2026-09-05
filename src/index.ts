#!/usr/bin/env bun

/**
 * Paprika MCP Server
 *
 * A read-only MCP server that exposes Paprika Recipe Manager's local SQLite
 * database. Designed to run as a stdio transport server spawned by Claude Desktop.
 *
 * Architecture:
 *   Claude Desktop --stdio--> this process --readonly--> Paprika.sqlite
 *
 * The server exposes four tools:
 *   - list_recipes:    paginated summary of all recipes
 *   - get_recipe:      full detail for a single recipe by UID
 *   - search_recipes:  full-text search by name/ingredients/description, filterable by category
 *   - list_categories: all categories with recipe counts
 *
 * Database path resolution (in order of precedence):
 *   1. PAPRIKA_DB_PATH environment variable
 *   2. Default macOS location for Paprika 3
 */

import "zod/compile";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { homedir } from "node:os";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { PaprikaRepository } from "./repository.js";

// ---------------------------------------------------------------------------
// Database path resolution
// ---------------------------------------------------------------------------

const DEFAULT_DB_PATH = join(
  homedir(),
  "Library",
  "Group Containers",
  "72KVKW69K8.com.hindsightlabs.paprika.mac.v3",
  "Data",
  "Database",
  "Paprika.sqlite"
);

function resolveDbPath(): string {
  const envPath = process.env.PAPRIKA_DB_PATH;
  if (envPath) {
    if (!existsSync(envPath)) {
      throw new Error(`PAPRIKA_DB_PATH points to a file that doesn't exist: ${envPath}`);
    }
    return envPath;
  }

  if (!existsSync(DEFAULT_DB_PATH)) {
    throw new Error(
      `Paprika database not found at default location: ${DEFAULT_DB_PATH}\n` +
        `Set the PAPRIKA_DB_PATH environment variable to the correct path.`
    );
  }

  return DEFAULT_DB_PATH;
}

// ---------------------------------------------------------------------------
// Server setup
// ---------------------------------------------------------------------------

const dbPath = resolveDbPath();
const repo = new PaprikaRepository(dbPath);

// bun:sqlite opens synchronously — no async init needed.

const server = new McpServer({
  name: "paprika-mcp",
  version: "1.0.0",
});

// ---------------------------------------------------------------------------
// Tool: list_recipes
// ---------------------------------------------------------------------------

server.registerTool(
  "list_recipes",
  {
    title: "List Recipes",
    description:
      "List all recipes in Paprika (summary view: name, categories, rating, time, servings). " +
      "Use this to get an overview of what's available for meal planning. " +
      "Returns an array of recipe summaries. Use get_recipe with a UID for full details.",
    inputSchema: z.object({
      offset: z
        .number()
        .int()
        .min(0)
        .default(0)
        .describe("Number of recipes to skip (for pagination)"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .default(50)
        .describe("Maximum number of recipes to return (1-100)"),
    }),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
    },
  },
  async ({ offset, limit }) => {
    const all = repo.listRecipes();
    const page = all.slice(offset, offset + limit);

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              total: all.length,
              offset,
              limit,
              recipes: page,
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

// ---------------------------------------------------------------------------
// Tool: get_recipe
// ---------------------------------------------------------------------------

server.registerTool(
  "get_recipe",
  {
    title: "Get Recipe",
    description:
      "Get full details of a single recipe by its UID, including ingredients, " +
      "directions, notes, nutritional info, and metadata. " +
      "Use list_recipes or search_recipes first to find the UID.",
    inputSchema: z.object({
      uid: z.string().describe("The unique identifier of the recipe"),
    }),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
    },
  },
  async ({ uid }) => {
    const recipe = repo.getRecipe(uid);

    if (!recipe) {
      return {
        content: [{ type: "text" as const, text: `Recipe not found: ${uid}` }],
        isError: true,
      };
    }

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(recipe, null, 2),
        },
      ],
    };
  }
);

// ---------------------------------------------------------------------------
// Tool: search_recipes
// ---------------------------------------------------------------------------

server.registerTool(
  "search_recipes",
  {
    title: "Search Recipes",
    description:
      "Search recipes by keyword (matches name, ingredients, and description) " +
      "and/or filter by category name. At least one of query or category must be provided. " +
      "Returns recipe summaries — use get_recipe for full details.",
    inputSchema: z.object({
      query: z
        .string()
        .optional()
        .describe(
          "Search term to match against recipe name, ingredients, and description"
        ),
      category: z
        .string()
        .optional()
        .describe(
          "Exact category name to filter by (case-sensitive, e.g. 'Weeknight', 'Asian')"
        ),
      maxResults: z
        .number()
        .int()
        .min(1)
        .max(100)
        .default(25)
        .describe("Maximum results to return (1-100)"),
    }),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
    },
  },
  async ({ query, category, maxResults }) => {
    if (!query && !category) {
      return {
        content: [
          {
            type: "text" as const,
            text: "At least one of 'query' or 'category' must be provided",
          },
        ],
        isError: true,
      };
    }

    const results = repo.searchRecipes({ query, category, maxResults });

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              resultCount: results.length,
              recipes: results,
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

// ---------------------------------------------------------------------------
// Tool: list_categories
// ---------------------------------------------------------------------------

server.registerTool(
  "list_categories",
  {
    title: "List Categories",
    description:
      "List all recipe categories with the number of recipes in each. " +
      "Useful for understanding the recipe collection's organization " +
      "and for finding valid category names to use with search_recipes.",
    inputSchema: z.object({}),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
    },
  },
  async () => {
    const categories = repo.listCategories();

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(categories, null, 2),
        },
      ],
    };
  }
);

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------

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

main().catch((err) => {
  console.error("Failed to start Paprika MCP server:", err);
  process.exit(1);
});
