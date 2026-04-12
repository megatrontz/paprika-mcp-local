/**
 * Tests for PaprikaRepository against the test fixture database.
 *
 * These tests define the expected behavior of the data access layer.
 * They exercise every public method and edge case using a pre-built
 * SQLite fixture that mirrors Paprika's real Core Data schema.
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { join } from "node:path";
import { PaprikaRepository } from "../src/repository.js";

const FIXTURE_PATH = join(import.meta.dir, "fixtures", "test-paprika.sqlite");

let repo: PaprikaRepository;

beforeAll(() => {
  repo = new PaprikaRepository(FIXTURE_PATH, { readonly: true });
});

afterAll(() => {
  repo.close();
});

// ---------------------------------------------------------------------------
// listRecipes()
// ---------------------------------------------------------------------------

describe("listRecipes", () => {
  test("returns 4 non-trashed recipes", () => {
    const recipes = repo.listRecipes();
    expect(recipes).toHaveLength(4);
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

  test("maps isFavorite boolean correctly", () => {
    const recipes = repo.listRecipes();
    const carbonara = recipes.find((r) => r.name === "Spaghetti Carbonara");
    const stirFry = recipes.find((r) => r.name === "Chicken Stir Fry");

    expect(carbonara!.isFavorite).toBe(true);
    expect(stirFry!.isFavorite).toBe(false);
  });

  test("includes categories for each recipe", () => {
    const recipes = repo.listRecipes();
    const carbonara = recipes.find((r) => r.name === "Spaghetti Carbonara");
    const brownies = recipes.find((r) => r.name === "Chocolate Brownies");

    expect(carbonara!.categories).toEqual(["Dinner"]);
    expect(brownies!.categories).toEqual(["Dessert"]);
  });
});

// ---------------------------------------------------------------------------
// getRecipe(uid)
// ---------------------------------------------------------------------------

describe("getRecipe", () => {
  test("returns full detail with all fields", () => {
    const recipe = repo.getRecipe("recipe-carbonara-uid");

    expect(recipe).not.toBeNull();
    expect(recipe!.uid).toBe("recipe-carbonara-uid");
    expect(recipe!.name).toBe("Spaghetti Carbonara");
    expect(recipe!.ingredients).toContain("spaghetti");
    expect(recipe!.directions).toContain("Cook pasta");
    expect(recipe!.description).toContain("Classic Italian");
    expect(recipe!.notes).toContain("guanciale");
    expect(recipe!.nutritionalInfo).toContain("Calories");
    expect(recipe!.prepTime).toBe("10 min");
    expect(recipe!.cookTime).toBe("20 min");
    expect(recipe!.totalTime).toBe("30 min");
    expect(recipe!.servings).toBe("4");
    expect(recipe!.difficulty).toBe("Medium");
    expect(recipe!.rating).toBe(5);
    expect(recipe!.source).toBe("Italian Cookbook");
    expect(recipe!.sourceUrl).toBe("https://example.com/carbonara");
    expect(recipe!.imageUrl).toBe("https://example.com/carbonara.jpg");
    expect(recipe!.isFavorite).toBe(true);
    expect(recipe!.isPinned).toBe(false);
    expect(recipe!.categories).toEqual(["Dinner"]);
  });

  test("converts Core Data timestamp to ISO 8601", () => {
    const recipe = repo.getRecipe("recipe-carbonara-uid");
    // 732196800 + 978307200 = 1710504000 Unix seconds = 2024-03-15T12:00:00.000Z
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

// ---------------------------------------------------------------------------
// searchRecipes()
// ---------------------------------------------------------------------------

describe("searchRecipes", () => {
  test("matches name", () => {
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

  test("combines query and category", () => {
    const results = repo.searchRecipes({
      query: "chicken",
      category: "Dinner",
    });
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe("Chicken Stir Fry");
  });

  test("excludes trashed from category results", () => {
    const results = repo.searchRecipes({ category: "Dinner" });
    const names = results.map((r) => r.name);
    expect(names).not.toContain("Trashed Recipe");
  });

  test("respects maxResults", () => {
    const results = repo.searchRecipes({ category: "Dinner", maxResults: 1 });
    expect(results).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// listCategories()
// ---------------------------------------------------------------------------

describe("listCategories", () => {
  test("returns all 3 categories", () => {
    const categories = repo.listCategories();
    expect(categories).toHaveLength(3);
  });

  test("has correct recipe counts (trashed excluded)", () => {
    const categories = repo.listCategories();
    const dinner = categories.find((c) => c.name === "Dinner");
    const dessert = categories.find((c) => c.name === "Dessert");
    const breakfast = categories.find((c) => c.name === "Breakfast");

    // Dinner has Carbonara + Stir Fry (2), NOT Trashed Recipe (3)
    expect(dinner!.recipeCount).toBe(2);
    expect(dessert!.recipeCount).toBe(1);
    expect(breakfast!.recipeCount).toBe(1);
  });

  test("sorts by name case-insensitively", () => {
    const categories = repo.listCategories();
    const names = categories.map((c) => c.name);
    expect(names).toEqual(["Breakfast", "Dessert", "Dinner"]);
  });
});
