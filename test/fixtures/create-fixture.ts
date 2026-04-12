/**
 * Creates a test SQLite database matching Paprika's real Core Data schema.
 *
 * Run: bun run test/fixtures/create-fixture.ts
 * Output: test/fixtures/test-paprika.sqlite
 */

import { Database } from "bun:sqlite";
import { unlinkSync, existsSync } from "node:fs";
import { join } from "node:path";

const FIXTURE_PATH = join(import.meta.dir, "test-paprika.sqlite");

// Clean up any existing fixture
if (existsSync(FIXTURE_PATH)) {
  unlinkSync(FIXTURE_PATH);
}

const db = new Database(FIXTURE_PATH);

// ---------------------------------------------------------------------------
// Schema DDL — extracted from the real Paprika database
// ---------------------------------------------------------------------------

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

  CREATE INDEX Z_Recipe_byUidIndex ON ZRECIPE (ZUID COLLATE BINARY ASC);
  CREATE INDEX Z_Recipe_byNameIndex ON ZRECIPE (ZNAME COLLATE BINARY ASC);
  CREATE INDEX Z_12CATEGORIES_Z_13CATEGORIES_INDEX ON Z_12CATEGORIES (Z_13CATEGORIES, Z_12RECIPES);
  CREATE INDEX Z_RecipeCategory_byUidIndex ON ZRECIPECATEGORY (ZUID COLLATE BINARY ASC);
`);

// ---------------------------------------------------------------------------
// Test data: Categories
// ---------------------------------------------------------------------------

db.exec(`
  INSERT INTO ZRECIPECATEGORY (Z_PK, Z_ENT, Z_OPT, ZISSYNCED, ZORDERFLAG, ZPARENT, ZNAME, ZSTATUS, ZUID)
  VALUES
    (1, 5, 1, 1, 0, NULL, 'Dinner',    NULL, 'cat-dinner-uid'),
    (2, 5, 1, 1, 0, NULL, 'Dessert',   NULL, 'cat-dessert-uid'),
    (3, 5, 1, 1, 0, NULL, 'Breakfast',  NULL, 'cat-breakfast-uid');
`);

// ---------------------------------------------------------------------------
// Test data: Recipes
// ---------------------------------------------------------------------------

// Core Data timestamp 732196800 = 2024-03-15T12:00:00Z
// (732196800 + 978307200 = 1710504000 Unix seconds = 2024-03-15T12:00:00Z)

db.exec(`
  INSERT INTO ZRECIPE (
    Z_PK, Z_ENT, Z_OPT, ZINTRASH, ZISPINNED, ZISSYNCED, ZONFAVORITES,
    ZPHOTOISDOWNLOADED, ZPHOTOISUPLOADED, ZRATING, ZCREATED,
    ZCOOKTIME, ZDESCRIPTIONTEXT, ZDIFFICULTY, ZDIRECTIONS,
    ZIMAGEURL, ZINGREDIENTS, ZNAME, ZNOTES, ZNUTRITIONALINFO,
    ZPREPTIME, ZSERVINGS, ZSOURCE, ZSOURCEURL, ZTOTALTIME, ZUID
  ) VALUES
    (1, 4, 1, 0, 0, 1, 1,
     0, 0, 5, 732196800.0,
     '20 min', 'Classic Italian pasta dish with eggs, cheese, and pancetta', 'Medium', 'Cook pasta. Fry pancetta. Mix eggs and cheese. Combine.',
     'https://example.com/carbonara.jpg', '400g spaghetti\n150g pancetta\n4 eggs\n100g parmesan\nBlack pepper', 'Spaghetti Carbonara', 'Use guanciale for a more authentic version.', 'Calories: 550 per serving',
     '10 min', '4', 'Italian Cookbook', 'https://example.com/carbonara', '30 min', 'recipe-carbonara-uid'),

    (2, 4, 1, 0, 0, 1, 0,
     0, 0, 4, 732200400.0,
     '15 min', 'Quick weeknight chicken stir fry', NULL, 'Slice chicken. Stir fry vegetables. Add sauce.',
     NULL, '500g chicken breast\n2 bell peppers\nSoy sauce\nGinger\nGarlic', 'Chicken Stir Fry', NULL, NULL,
     '10 min', '3', 'Mom', NULL, '25 min', 'recipe-stirfry-uid'),

    (3, 4, 1, 0, 1, 1, 0,
     0, 0, NULL, 732204000.0,
     '25 min', NULL, 'Easy', 'Melt butter and chocolate. Mix in sugar and eggs. Bake at 350F for 25 minutes.',
     NULL, '200g dark chocolate\n150g butter\n200g sugar\n3 eggs\n100g flour', 'Chocolate Brownies', 'Let cool completely before cutting.', NULL,
     '15 min', '12', NULL, NULL, '40 min', 'recipe-brownies-uid'),

    (4, 4, 1, 0, 0, 1, 0,
     0, 0, 3, 732207600.0,
     '5 min', 'Simple breakfast scrambled eggs', NULL, 'Whisk eggs. Cook in butter over low heat. Season.',
     NULL, '3 eggs\n1 tbsp butter\nSalt\nPepper', 'Scrambled Eggs', NULL, NULL,
     '2 min', '1', NULL, NULL, '7 min', 'recipe-eggs-uid'),

    (5, 4, 1, 1, 0, 1, 0,
     0, 0, 2, 732211200.0,
     NULL, 'This recipe is trashed', NULL, 'Should not appear.',
     NULL, 'Nothing', 'Trashed Recipe', NULL, NULL,
     NULL, NULL, NULL, NULL, NULL, 'recipe-trashed-uid');
`);

// ---------------------------------------------------------------------------
// Test data: Recipe-Category join table
// ---------------------------------------------------------------------------

db.exec(`
  INSERT INTO Z_12CATEGORIES (Z_12RECIPES, Z_13CATEGORIES)
  VALUES
    (1, 1),  -- Spaghetti Carbonara -> Dinner
    (2, 1),  -- Chicken Stir Fry    -> Dinner
    (3, 2),  -- Chocolate Brownies   -> Dessert
    (4, 3),  -- Scrambled Eggs       -> Breakfast
    (5, 1);  -- Trashed Recipe       -> Dinner (should be excluded from counts)
`);

db.close();

console.log(`Test fixture created at: ${FIXTURE_PATH}`);
