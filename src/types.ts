/**
 * Domain types for Paprika recipe data.
 *
 * These are the clean, consumer-facing types that the MCP tools return.
 * They decouple our public API from Paprika's Core Data SQLite schema
 * (which uses Z-prefixed columns, integer booleans, and Core Data timestamps).
 */

export interface Recipe {
  uid: string;
  name: string;
  ingredients: string | null;
  directions: string | null;
  description: string | null;
  notes: string | null;
  nutritionalInfo: string | null;
  prepTime: string | null;
  cookTime: string | null;
  totalTime: string | null;
  servings: string | null;
  difficulty: string | null;
  rating: number | null;
  source: string | null;
  sourceUrl: string | null;
  imageUrl: string | null;
  isFavorite: boolean;
  isPinned: boolean;
  categories: string[];
  created: string | null; // ISO 8601
}

export interface RecipeSummary {
  uid: string;
  name: string;
  categories: string[];
  rating: number | null;
  totalTime: string | null;
  servings: string | null;
  isFavorite: boolean;
  source: string | null;
}

export interface Category {
  uid: string;
  name: string;
  recipeCount: number;
}
