/**
 * Domain types for Paprika recipe data.
 *
 * These are the clean, consumer-facing types that the MCP tools return.
 * They decouple our public API from Paprika's Core Data SQLite schema
 * (which uses Z-prefixed columns, integer booleans, and Core Data timestamps).
 *
 * Each type is defined as a Zod schema and the TypeScript type is inferred from
 * it. The schemas double as the building blocks of every tool's `outputSchema`,
 * so the declared MCP output shape and the compiler's view of the repository
 * return values can never drift apart.
 */

import { z } from "zod";

export const RecipeSchema = z.object({
  uid: z.string().describe("Stable unique identifier for the recipe"),
  name: z.string().describe("Recipe name"),
  ingredients: z.string().nullable().describe("Ingredient list, newline-separated"),
  directions: z.string().nullable().describe("Cooking directions, newline-separated"),
  description: z.string().nullable().describe("Short description of the recipe"),
  notes: z.string().nullable().describe("Free-form notes"),
  nutritionalInfo: z.string().nullable().describe("Nutritional information"),
  prepTime: z.string().nullable().describe("Prep time as free text, e.g. '15 min'"),
  cookTime: z.string().nullable().describe("Cook time as free text, e.g. '30 min'"),
  totalTime: z.string().nullable().describe("Total time as free text"),
  servings: z.string().nullable().describe("Servings as free text, e.g. '4 servings'"),
  difficulty: z.string().nullable().describe("Difficulty as free text, e.g. 'Easy'"),
  rating: z.number().nullable().describe("Star rating, typically 0-5"),
  source: z.string().nullable().describe("Where the recipe came from"),
  sourceUrl: z.string().nullable().describe("URL the recipe was imported from"),
  imageUrl: z.string().nullable().describe("URL of the recipe's image"),
  isFavorite: z.boolean().describe("Whether the recipe is marked as a favorite"),
  isPinned: z.boolean().describe("Whether the recipe is pinned"),
  categories: z.array(z.string()).describe("Names of the categories the recipe belongs to"),
  created: z.string().nullable().describe("Creation timestamp, ISO 8601"),
});

export type Recipe = z.infer<typeof RecipeSchema>;

export const RecipeSummarySchema = z.object({
  uid: z.string().describe("Stable unique identifier — pass to get_recipe for full detail"),
  name: z.string().describe("Recipe name"),
  categories: z.array(z.string()).describe("Names of the categories the recipe belongs to"),
  rating: z.number().nullable().describe("Star rating, typically 0-5"),
  totalTime: z.string().nullable().describe("Total time as free text"),
  servings: z.string().nullable().describe("Servings as free text, e.g. '4 servings'"),
  isFavorite: z.boolean().describe("Whether the recipe is marked as a favorite"),
  source: z.string().nullable().describe("Where the recipe came from"),
});

export type RecipeSummary = z.infer<typeof RecipeSummarySchema>;

export const CategorySchema = z.object({
  uid: z.string().describe("Stable unique identifier for the category"),
  name: z.string().describe("Category name — use with search_recipes' category filter"),
  recipeCount: z.number().int().describe("Number of non-trashed recipes in this category"),
});

export type Category = z.infer<typeof CategorySchema>;
