/**
 * PaprikaRepository — Data access layer for Paprika's Core Data SQLite database.
 *
 * Design decisions:
 * - Repository pattern: isolates all SQL and schema knowledge here.
 *   MCP tool handlers never touch the database directly.
 * - Read-only: we read the database file into memory via sql.js (SQLite compiled to WASM).
 *   Paprika owns the writes — we re-read on each server startup to get fresh data.
 * - Core Data epoch: Paprika stores timestamps as seconds since 2001-01-01T00:00:00Z
 *   (NSDate reference date), not Unix epoch. We convert to ISO 8601 on the way out.
 *
 * Why sql.js instead of better-sqlite3:
 *   sql.js is pure JavaScript (SQLite compiled to WebAssembly) — no native compilation
 *   step, no node-gyp, works on any platform without build tools.
 */

import initSqlJs, { type Database, type SqlValue } from "sql.js";
import { readFileSync } from "node:fs";
import type { Recipe, RecipeSummary, Category } from "./types.js";

/** Core Data epoch offset: seconds between 1970-01-01 and 2001-01-01 */
const CORE_DATA_EPOCH_OFFSET = 978307200;

function coreDataTimestampToISO(timestamp: number | null): string | null {
  if (timestamp === null || timestamp === undefined) return null;
  const unixMs = (timestamp + CORE_DATA_EPOCH_OFFSET) * 1000;
  return new Date(unixMs).toISOString();
}

/**
 * Helper to run a sql.js query and get typed row objects.
 * sql.js returns { columns: string[], values: any[][] } — this zips them into objects.
 */
function queryAll<T extends Record<string, unknown>>(
  db: Database,
  sql: string,
  params?: SqlValue[]
): T[] {
  const stmt = db.prepare(sql);
  if (params) stmt.bind(params);

  const rows: T[] = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject() as T);
  }
  stmt.free();
  return rows;
}

function queryOne<T extends Record<string, unknown>>(
  db: Database,
  sql: string,
  params?: SqlValue[]
): T | null {
  const results = queryAll<T>(db, sql, params);
  return results[0] ?? null;
}

export class PaprikaRepository {
  private db: Database | null = null;
  private dbPath: string;

  constructor(dbPath: string) {
    this.dbPath = dbPath;
  }

  /** Initialize sql.js WASM and load the database file. Must be called before any queries. */
  async init(): Promise<void> {
    const SQL = await initSqlJs();
    const fileBuffer = readFileSync(this.dbPath);
    this.db = new SQL.Database(fileBuffer);
  }

  private getDb(): Database {
    if (!this.db) {
      throw new Error("Repository not initialized. Call init() first.");
    }
    return this.db;
  }

  /**
   * List all recipes (summary view — no ingredients/directions for efficiency).
   * Filters out trashed recipes.
   */
  listRecipes(): RecipeSummary[] {
    const db = this.getDb();
    const rows = queryAll<{
      Z_PK: number;
      ZUID: string;
      ZNAME: string;
      ZRATING: number | null;
      ZTOTALTIME: string | null;
      ZSERVINGS: string | null;
      ZONFAVORITES: number;
      ZSOURCE: string | null;
    }>(
      db,
      `SELECT Z_PK, ZUID, ZNAME, ZRATING, ZTOTALTIME, ZSERVINGS, ZONFAVORITES, ZSOURCE
       FROM ZRECIPE
       WHERE ZINTRASH = 0
       ORDER BY ZNAME COLLATE NOCASE`
    );

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
    const db = this.getDb();
    const row = queryOne<{
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
    }>(
      db,
      `SELECT Z_PK, ZUID, ZNAME, ZINGREDIENTS, ZDIRECTIONS, ZDESCRIPTIONTEXT,
              ZNOTES, ZNUTRITIONALINFO, ZPREPTIME, ZCOOKTIME, ZTOTALTIME,
              ZSERVINGS, ZDIFFICULTY, ZRATING, ZSOURCE, ZSOURCEURL,
              ZIMAGEURL, ZONFAVORITES, ZISPINNED, ZCREATED
       FROM ZRECIPE
       WHERE ZUID = ? AND ZINTRASH = 0`,
      [uid]
    );

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
    const db = this.getDb();
    const conditions: string[] = ["r.ZINTRASH = 0"];
    const params: SqlValue[] = [];

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

    const rows = queryAll<{
      Z_PK: number;
      ZUID: string;
      ZNAME: string;
      ZRATING: number | null;
      ZTOTALTIME: string | null;
      ZSERVINGS: string | null;
      ZONFAVORITES: number;
      ZSOURCE: string | null;
    }>(
      db,
      `SELECT r.Z_PK, r.ZUID, r.ZNAME, r.ZRATING, r.ZTOTALTIME, r.ZSERVINGS, r.ZONFAVORITES, r.ZSOURCE
       FROM ZRECIPE r
       WHERE ${conditions.join(" AND ")}
       ORDER BY r.ZNAME COLLATE NOCASE
       LIMIT ?`,
      params
    );

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
    const db = this.getDb();
    const rows = queryAll<{
      ZUID: string;
      ZNAME: string;
      recipe_count: number;
    }>(
      db,
      `SELECT c.ZUID, c.ZNAME, COUNT(j.Z_12RECIPES) as recipe_count
       FROM ZRECIPECATEGORY c
       LEFT JOIN Z_12CATEGORIES j ON j.Z_13CATEGORIES = c.Z_PK
       LEFT JOIN ZRECIPE r ON r.Z_PK = j.Z_12RECIPES AND r.ZINTRASH = 0
       GROUP BY c.Z_PK
       ORDER BY c.ZNAME COLLATE NOCASE`
    );

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
    const db = this.getDb();
    const rows = queryAll<{ ZNAME: string }>(
      db,
      `SELECT c.ZNAME
       FROM ZRECIPECATEGORY c
       JOIN Z_12CATEGORIES j ON j.Z_13CATEGORIES = c.Z_PK
       WHERE j.Z_12RECIPES = ?
       ORDER BY c.ZNAME COLLATE NOCASE`,
      [pk]
    );

    return rows.map((r) => r.ZNAME);
  }

  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}
