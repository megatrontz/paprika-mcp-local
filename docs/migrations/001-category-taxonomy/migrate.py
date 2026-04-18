#!/usr/bin/env python3
"""
Paprika Recipe Category Migration Script

Applies classifications from classified-all.json to the Paprika SQLite database.
Handles Core Data bookkeeping: Z_OPT, Z_ENT, Z_PRIMARYKEY.Z_MAX.

Usage:
    python3 migrate.py --dry-run --db PATH --classifications PATH    # Preview
    python3 migrate.py --apply   --db PATH --classifications PATH    # Apply
"""

import argparse
import json
import sqlite3
import sys
import uuid
from collections import defaultdict
from datetime import datetime, timezone, timedelta

# --- Constants ---
CATEGORY_Z_ENT = 13
CORE_DATA_EPOCH_OFFSET = 978307200  # seconds between Unix epoch and 2001-01-01

# Our complete taxonomy - the only categories that should exist after migration
TAXONOMY = {
    # Cuisine
    "American", "Asian", "Caribbean", "Chinese", "French", "Indian",
    "Italian", "Japanese", "Korean", "Mediterranean", "Mexican", "Thai",
    # Protein
    "Beef", "Chicken", "Pork", "Seafood", "Vegetarian",
    # Meal Type
    "Breakfast", "Beverage", "Dessert", "Pasta", "Salad", "Sandwich",
    "Sauce/Condiment", "Sides", "Soup", "Tacos",
    # Equipment
    "Cast Iron", "Dutch Oven", "Griddle", "Grill", "Instant Pot",
    "One-Pot", "Oven", "Sheet Pan", "Slow Cooker", "Smoker", "Sous Vide", "Wok",
    # Effort/Occasion
    "Batch Cooking", "Holiday", "Summer", "Thanksgiving", "Weeknight",
    "Weekend Project",
    # Source
    "177 Milk Street", "NYT Cooking", "Serious Eats",
}

# Map existing DB categories to taxonomy categories (or None to delete)
# Key: existing ZNAME, Value: taxonomy name or None
CATEGORY_REMAP = {
    # Direct matches (keep as-is)
    "American": "American",
    "Asian": "Asian",
    "Batch Cooking": "Batch Cooking",
    "Breakfast": "Breakfast",
    "Chinese": "Chinese",
    "Dessert": "Dessert",
    "Holiday": "Holiday",
    "Indian": "Indian",
    "Instant Pot": "Instant Pot",
    "Italian": "Italian",
    "Japanese": "Japanese",
    "Korean": "Korean",
    "Mexican": "Mexican",
    "One-Pot": "One-Pot",
    "Seafood": "Seafood",
    "Sides": "Sides",
    "Slow Cooker": "Slow Cooker",
    "Soup": "Soup",
    "Sous Vide": "Sous Vide",
    "Summer": "Summer",
    "Tacos": "Tacos",
    "Thai": "Thai",
    "Thanksgiving": "Thanksgiving",
    "Vegetarian": "Vegetarian",
    "Weeknight": "Weeknight",

    # Renames
    "Beverages": "Beverage",
    "Sandwiches": "Sandwich",

    # Lowercase dupes -> canonical form
    "breakfast": "Breakfast",
    "seafood": "Seafood",
    "salads": "Salad",
    "pasta": "Pasta",
    "sauces": "Sauce/Condiment",

    # Drop these (set to None)
    "American (New/Old)": None,
    "baking": None,
    "Chili": None,
    "Cookbooks": None,
    "Dinner": None,
    "Labor Intensive": None,
    "LLM-Gemini": None,
    "Main Course": None,
    "muffins": None,
    "my-creations": None,
    "Paleo": None,
    "Poultry": None,
    "quickies": None,
    "Roasting": None,
}


def core_data_timestamp():
    """Current timestamp in Core Data epoch (seconds since 2001-01-01)."""
    now = datetime.now(timezone.utc)
    return now.timestamp() - CORE_DATA_EPOCH_OFFSET


def generate_uid():
    """Generate a UUID string matching Paprika's format."""
    return str(uuid.uuid4()).upper()


def load_classifications(path):
    """Load classified-all.json and return dict keyed by UID."""
    with open(path) as f:
        data = json.load(f)
    return {r["uid"]: r for r in data}


def get_existing_state(cur):
    """Snapshot the current database state."""
    # All categories
    cur.execute("SELECT Z_PK, Z_OPT, ZNAME, ZUID FROM ZRECIPECATEGORY")
    categories = {row[0]: {"pk": row[0], "opt": row[1], "name": row[2], "uid": row[3]}
                  for row in cur.fetchall()}

    # All recipes
    cur.execute("SELECT Z_PK, Z_OPT, ZUID FROM ZRECIPE")
    recipes = {}
    for row in cur.fetchall():
        recipes[row[2]] = {"pk": row[0], "opt": row[1], "uid": row[2]}

    # All join rows
    cur.execute("SELECT Z_12RECIPES, Z_13CATEGORIES FROM Z_12CATEGORIES")
    joins = set()
    for row in cur.fetchall():
        joins.add((row[0], row[1]))

    # Category name -> list of PKs (handles dupes like double Thanksgiving)
    name_to_pks = defaultdict(list)
    for pk, cat in categories.items():
        name_to_pks[cat["name"]].append(pk)

    return categories, recipes, joins, name_to_pks


def plan_migration(cur, classifications):
    """
    Build a migration plan without touching the database.
    Returns a plan dict describing all changes.
    """
    categories, recipes, joins, name_to_pks = get_existing_state(cur)
    max_cat_pk = max(categories.keys())

    plan = {
        "categories_to_rename": [],     # (pk, old_name, new_name)
        "categories_to_create": [],     # (new_pk, name, uid)
        "categories_to_delete": [],     # (pk, name) - remove from join table + category table
        "duplicate_pks_to_merge": [],   # (keep_pk, drop_pk, name)
        "joins_to_remove": [],          # (recipe_pk, category_pk)
        "joins_to_add": [],             # (recipe_pk, category_pk)
        "recipe_opt_bumps": [],         # (recipe_pk, old_opt, new_opt)
        "category_opt_bumps": [],       # (category_pk, old_opt, new_opt)
        "new_max_cat_pk": max_cat_pk,
        "recipes_not_in_db": [],        # UIDs in classification but not in DB
        "recipes_not_classified": [],   # UIDs in DB but not in classification
    }

    # --- Step 1: Resolve category table ---
    # Determine which existing categories to keep/rename/delete
    # and which taxonomy categories need new rows

    # Build: taxonomy_name -> PK that will represent it
    taxonomy_pk = {}

    # First pass: handle remaps of existing categories
    for existing_name, target_name in CATEGORY_REMAP.items():
        if existing_name not in name_to_pks:
            continue
        pks = name_to_pks[existing_name]

        if target_name is None:
            # Delete these
            for pk in pks:
                plan["categories_to_delete"].append((pk, existing_name))
            continue

        if target_name in taxonomy_pk:
            # Already have a PK for this taxonomy name, merge dupes
            keep_pk = taxonomy_pk[target_name]
            for pk in pks:
                if pk != keep_pk:
                    plan["duplicate_pks_to_merge"].append((keep_pk, pk, target_name))
        else:
            # Use the first PK, mark rest as dupes
            keep_pk = pks[0]
            taxonomy_pk[target_name] = keep_pk
            if existing_name != target_name:
                plan["categories_to_rename"].append((keep_pk, existing_name, target_name))
            for pk in pks[1:]:
                plan["duplicate_pks_to_merge"].append((keep_pk, pk, existing_name))

    # Handle Thanksgiving duplicate specifically (PKs 1 and 3, same name)
    if "Thanksgiving" in name_to_pks and len(name_to_pks["Thanksgiving"]) > 1:
        pks = name_to_pks["Thanksgiving"]
        keep = pks[0]
        if "Thanksgiving" not in taxonomy_pk:
            taxonomy_pk["Thanksgiving"] = keep
        for pk in pks[1:]:
            if pk != taxonomy_pk.get("Thanksgiving"):
                already_merged = any(d[1] == pk for d in plan["duplicate_pks_to_merge"])
                if not already_merged:
                    plan["duplicate_pks_to_merge"].append(
                        (taxonomy_pk["Thanksgiving"], pk, "Thanksgiving"))

    # Second pass: create missing taxonomy categories
    next_pk = max_cat_pk + 1
    for name in sorted(TAXONOMY):
        if name not in taxonomy_pk:
            uid = generate_uid()
            plan["categories_to_create"].append((next_pk, name, uid))
            taxonomy_pk[name] = next_pk
            next_pk += 1

    plan["new_max_cat_pk"] = next_pk - 1

    # --- Step 2: Plan join table changes per recipe ---
    # Build merge map: drop_pk -> keep_pk
    merge_map = {}
    for keep_pk, drop_pk, _ in plan["duplicate_pks_to_merge"]:
        merge_map[drop_pk] = keep_pk

    # PKs of categories being deleted
    deleted_pks = {pk for pk, _ in plan["categories_to_delete"]}
    # PKs of categories being dropped via merge
    merged_drop_pks = set(merge_map.keys())

    for uid, classification in classifications.items():
        if uid not in recipes:
            plan["recipes_not_in_db"].append(uid)
            continue

        recipe = recipes[uid]
        recipe_pk = recipe["pk"]

        # Current category PKs for this recipe (raw from DB)
        current_cat_pks = {cat_pk for (r_pk, cat_pk) in joins if r_pk == recipe_pk}

        # Desired category PKs (from our classification)
        desired_cat_pks = set()
        for cat_name in classification["proposedCategories"]:
            if cat_name in taxonomy_pk:
                desired_cat_pks.add(taxonomy_pk[cat_name])

        # After merges, the effective current state remaps merged PKs to their keep PKs.
        # We need to diff against this post-merge state.
        # Effective current = remap current through merge_map, minus deleted categories
        effective_current = set()
        for cat_pk in current_cat_pks:
            if cat_pk in deleted_pks:
                continue  # will be removed during delete step
            effective_current.add(merge_map.get(cat_pk, cat_pk))

        # Remove: joins that exist in DB but shouldn't after migration
        # This includes: joins to deleted categories, joins to merged-away PKs,
        # and joins to valid categories that aren't in the desired set.
        to_remove_from_db = set()
        for cat_pk in current_cat_pks:
            if cat_pk in deleted_pks:
                to_remove_from_db.add(cat_pk)
            elif cat_pk in merged_drop_pks:
                # The merge step handles re-linking; we need to remove the old PK join
                # and also remove the keep_pk join if it's not in desired set
                to_remove_from_db.add(cat_pk)
                keep_pk = merge_map[cat_pk]
                if keep_pk not in desired_cat_pks:
                    to_remove_from_db.add(keep_pk)
            elif cat_pk not in desired_cat_pks:
                to_remove_from_db.add(cat_pk)

        # Add: desired PKs not in effective current
        to_add_to_db = desired_cat_pks - effective_current

        for cat_pk in to_remove_from_db:
            # Only remove if the join actually exists
            if cat_pk in current_cat_pks:
                plan["joins_to_remove"].append((recipe_pk, cat_pk))
        for cat_pk in to_add_to_db:
            plan["joins_to_add"].append((recipe_pk, cat_pk))

        # Bump recipe Z_OPT if any joins changed
        if to_remove_from_db or to_add_to_db:
            plan["recipe_opt_bumps"].append(
                (recipe_pk, recipe["opt"], recipe["opt"] + 1))

    # Track unclassified recipes
    classified_uids = set(classifications.keys())
    all_db_uids = set(recipes.keys())
    plan["recipes_not_classified"] = list(all_db_uids - classified_uids)

    # Bump Z_OPT for renamed categories
    for pk, old_name, new_name in plan["categories_to_rename"]:
        cat = categories[pk]
        plan["category_opt_bumps"].append((pk, cat["opt"], cat["opt"] + 1))

    return plan, taxonomy_pk


def print_plan(plan):
    """Pretty-print the migration plan."""
    print("=" * 60)
    print("MIGRATION PLAN")
    print("=" * 60)

    print(f"\n--- Categories to RENAME ({len(plan['categories_to_rename'])}) ---")
    for pk, old, new in plan["categories_to_rename"]:
        print(f"  PK={pk}: '{old}' -> '{new}'")

    print(f"\n--- Categories to CREATE ({len(plan['categories_to_create'])}) ---")
    for pk, name, uid in plan["categories_to_create"]:
        print(f"  PK={pk}: '{name}' (UID={uid[:8]}...)")

    print(f"\n--- Categories to DELETE ({len(plan['categories_to_delete'])}) ---")
    for pk, name in plan["categories_to_delete"]:
        print(f"  PK={pk}: '{name}'")

    print(f"\n--- Duplicate PKs to MERGE ({len(plan['duplicate_pks_to_merge'])}) ---")
    for keep, drop, name in plan["duplicate_pks_to_merge"]:
        print(f"  '{name}': keep PK={keep}, drop PK={drop}")

    print(f"\n--- Join rows to REMOVE ({len(plan['joins_to_remove'])}) ---")
    if len(plan["joins_to_remove"]) <= 20:
        for r_pk, c_pk in plan["joins_to_remove"]:
            print(f"  recipe_pk={r_pk}, category_pk={c_pk}")
    else:
        print(f"  (showing first 20 of {len(plan['joins_to_remove'])})")
        for r_pk, c_pk in plan["joins_to_remove"][:20]:
            print(f"  recipe_pk={r_pk}, category_pk={c_pk}")

    print(f"\n--- Join rows to ADD ({len(plan['joins_to_add'])}) ---")
    if len(plan["joins_to_add"]) <= 20:
        for r_pk, c_pk in plan["joins_to_add"]:
            print(f"  recipe_pk={r_pk}, category_pk={c_pk}")
    else:
        print(f"  (showing first 20 of {len(plan['joins_to_add'])})")
        for r_pk, c_pk in plan["joins_to_add"][:20]:
            print(f"  recipe_pk={r_pk}, category_pk={c_pk}")

    print(f"\n--- Recipe Z_OPT bumps ({len(plan['recipe_opt_bumps'])}) ---")
    print(f"  {len(plan['recipe_opt_bumps'])} recipes will have Z_OPT incremented")

    print(f"\n--- Category Z_OPT bumps ({len(plan['category_opt_bumps'])}) ---")
    for pk, old, new in plan["category_opt_bumps"]:
        print(f"  PK={pk}: {old} -> {new}")

    print(f"\n--- New max category PK: {plan['new_max_cat_pk']} ---")

    if plan["recipes_not_in_db"]:
        print(f"\n--- WARNING: {len(plan['recipes_not_in_db'])} classified recipes NOT in DB ---")
        for uid in plan["recipes_not_in_db"][:5]:
            print(f"  {uid}")

    if plan["recipes_not_classified"]:
        print(f"\n--- INFO: {len(plan['recipes_not_classified'])} DB recipes not classified ---")
        print(f"  (These recipes' existing categories will be cleared if they point to deleted categories)")

    print("\n" + "=" * 60)
    total_writes = (
        len(plan["categories_to_rename"]) +
        len(plan["categories_to_create"]) +
        len(plan["categories_to_delete"]) +
        len(plan["duplicate_pks_to_merge"]) +
        len(plan["joins_to_remove"]) +
        len(plan["joins_to_add"]) +
        len(plan["recipe_opt_bumps"]) +
        len(plan["category_opt_bumps"])
    )
    print(f"TOTAL OPERATIONS: ~{total_writes}")
    print("=" * 60)


def apply_migration(cur, plan, classifications, taxonomy_pk):
    """
    Execute the migration plan against the database.

    Strategy: handle category table first (create/rename/delete/merge),
    then do a clean wipe-and-rebuild of join rows for all classified recipes.
    This avoids ordering bugs with merge+remove interactions.
    """
    # --- Phase 1: Category table changes ---

    # 1. Rename categories
    for pk, old_name, new_name in plan["categories_to_rename"]:
        cur.execute("UPDATE ZRECIPECATEGORY SET ZNAME = ? WHERE Z_PK = ?",
                    (new_name, pk))

    # 2. Create new categories
    for pk, name, uid in plan["categories_to_create"]:
        cur.execute("""
            INSERT INTO ZRECIPECATEGORY (Z_PK, Z_ENT, Z_OPT, ZISSYNCED, ZORDERFLAG, ZPARENT, ZNAME, ZSTATUS, ZUID)
            VALUES (?, ?, 1, 0, 0, NULL, ?, NULL, ?)
        """, (pk, CATEGORY_Z_ENT, name, uid))

    # 3. Delete duplicate categories (just remove the row + its joins)
    for keep_pk, drop_pk, name in plan["duplicate_pks_to_merge"]:
        cur.execute("DELETE FROM Z_12CATEGORIES WHERE Z_13CATEGORIES = ?",
                    (drop_pk,))
        cur.execute("DELETE FROM ZRECIPECATEGORY WHERE Z_PK = ?", (drop_pk,))

    # 4. Delete dropped categories
    for pk, name in plan["categories_to_delete"]:
        cur.execute("DELETE FROM Z_12CATEGORIES WHERE Z_13CATEGORIES = ?", (pk,))
        cur.execute("DELETE FROM ZRECIPECATEGORY WHERE Z_PK = ?", (pk,))

    # --- Phase 2: Rebuild joins for classified recipes ---
    # For each classified recipe, wipe existing joins and insert the desired set.
    # This is idempotent and avoids merge/remove ordering issues.

    cur.execute("SELECT Z_PK, ZUID, Z_OPT FROM ZRECIPE")
    uid_to_recipe = {row[1]: {"pk": row[0], "opt": row[2]} for row in cur.fetchall()}

    for uid, classification in classifications.items():
        if uid not in uid_to_recipe:
            continue

        recipe_pk = uid_to_recipe[uid]["pk"]
        old_opt = uid_to_recipe[uid]["opt"]

        # Wipe all existing joins for this recipe
        cur.execute("DELETE FROM Z_12CATEGORIES WHERE Z_12RECIPES = ?", (recipe_pk,))

        # Insert desired joins
        for cat_name in classification["proposedCategories"]:
            cat_pk = taxonomy_pk.get(cat_name)
            if cat_pk:
                cur.execute("""
                    INSERT INTO Z_12CATEGORIES (Z_12RECIPES, Z_13CATEGORIES)
                    VALUES (?, ?)
                """, (recipe_pk, cat_pk))

        # Bump Z_OPT
        cur.execute("UPDATE ZRECIPE SET Z_OPT = ? WHERE Z_PK = ?",
                    (old_opt + 1, recipe_pk))

    # --- Phase 3: Bump category Z_OPTs for renamed categories ---
    for cat_pk, old_opt, new_opt in plan["category_opt_bumps"]:
        cur.execute("UPDATE ZRECIPECATEGORY SET Z_OPT = ? WHERE Z_PK = ?",
                    (new_opt, cat_pk))

    # --- Phase 4: Update Z_PRIMARYKEY ---
    cur.execute("UPDATE Z_PRIMARYKEY SET Z_MAX = ? WHERE Z_ENT = ?",
                (plan["new_max_cat_pk"], CATEGORY_Z_ENT))


def verify_post_migration(cur, classifications, taxonomy_pk):
    """Verify the database state after migration."""
    print("\n" + "=" * 60)
    print("POST-MIGRATION VERIFICATION")
    print("=" * 60)

    # Check category count
    cur.execute("SELECT COUNT(*) FROM ZRECIPECATEGORY")
    cat_count = cur.fetchone()[0]
    print(f"\nCategories in DB: {cat_count} (expected: {len(TAXONOMY)})")

    # Check all taxonomy categories exist
    cur.execute("SELECT ZNAME FROM ZRECIPECATEGORY")
    db_names = {row[0] for row in cur.fetchall()}
    missing = TAXONOMY - db_names
    extra = db_names - TAXONOMY
    if missing:
        print(f"  MISSING from DB: {missing}")
    if extra:
        print(f"  EXTRA in DB: {extra}")
    if not missing and not extra:
        print("  All taxonomy categories present, no extras.")

    # Check join count
    cur.execute("SELECT COUNT(*) FROM Z_12CATEGORIES")
    join_count = cur.fetchone()[0]
    print(f"\nJoin rows: {join_count}")

    # Verify a sample of recipes
    cur.execute("SELECT Z_PK, ZUID FROM ZRECIPE")
    all_recipes = {row[1]: row[0] for row in cur.fetchall()}

    cur.execute("SELECT Z_PK, ZNAME FROM ZRECIPECATEGORY")
    pk_to_name = {row[0]: row[1] for row in cur.fetchall()}

    mismatches = 0
    checked = 0
    for uid, classification in classifications.items():
        if uid not in all_recipes:
            continue
        recipe_pk = all_recipes[uid]

        cur.execute("""
            SELECT Z_13CATEGORIES FROM Z_12CATEGORIES WHERE Z_12RECIPES = ?
        """, (recipe_pk,))
        actual_cat_pks = {row[0] for row in cur.fetchall()}
        actual_names = {pk_to_name.get(pk, f"UNKNOWN_PK_{pk}") for pk in actual_cat_pks}
        expected_names = set(classification["proposedCategories"])

        if actual_names != expected_names:
            mismatches += 1
            if mismatches <= 5:
                print(f"\n  MISMATCH: {classification['name']}")
                print(f"    Expected: {sorted(expected_names)}")
                print(f"    Actual:   {sorted(actual_names)}")
                print(f"    Missing:  {sorted(expected_names - actual_names)}")
                print(f"    Extra:    {sorted(actual_names - expected_names)}")
        checked += 1

    print(f"\nVerified {checked} recipes: {mismatches} mismatches")

    # Check Z_PRIMARYKEY
    cur.execute("SELECT Z_MAX FROM Z_PRIMARYKEY WHERE Z_ENT = ?", (CATEGORY_Z_ENT,))
    z_max = cur.fetchone()[0]
    cur.execute("SELECT MAX(Z_PK) FROM ZRECIPECATEGORY")
    actual_max = cur.fetchone()[0]
    print(f"\nZ_PRIMARYKEY.Z_MAX: {z_max} (actual max PK: {actual_max})")
    if z_max < actual_max:
        print("  WARNING: Z_MAX is less than actual max PK!")

    print("\n" + "=" * 60)
    return mismatches == 0


def main():
    parser = argparse.ArgumentParser(description="Apply category classifications to a Paprika SQLite database.")
    mode_group = parser.add_mutually_exclusive_group(required=True)
    mode_group.add_argument("--dry-run", action="store_true", help="Preview changes without writing")
    mode_group.add_argument("--apply", action="store_true", help="Apply changes to the database")
    parser.add_argument("--db", required=True, help="Path to the Paprika SQLite database (use a backup copy unless you're certain)")
    parser.add_argument("--classifications", required=True, help="Path to the classifications JSON file (uid -> list of categories)")
    args = parser.parse_args()

    mode = "--dry-run" if args.dry_run else "--apply"
    db_path = args.db
    classifications_path = args.classifications

    print(f"Mode: {mode}")
    print(f"Database: {db_path}")
    print(f"Classifications: {classifications_path}")

    classifications = load_classifications(classifications_path)
    print(f"Loaded {len(classifications)} classifications")

    db = sqlite3.connect(db_path)
    cur = db.cursor()

    plan, taxonomy_pk = plan_migration(cur, classifications)
    print_plan(plan)

    if mode == "--dry-run":
        print("\nDRY RUN - no changes written.")
        # Still apply to in-memory to verify, then rollback
        cur.execute("BEGIN")
        apply_migration(cur, plan, classifications, taxonomy_pk)
        success = verify_post_migration(cur, classifications, taxonomy_pk)
        db.rollback()
        print("\nRolled back all changes (dry run).")
        if success:
            print("Verification PASSED - safe to --apply.")
        else:
            print("Verification FAILED - review mismatches before applying.")
    elif mode == "--apply":
        cur.execute("BEGIN")
        apply_migration(cur, plan, classifications, taxonomy_pk)
        success = verify_post_migration(cur, classifications, taxonomy_pk)
        if success:
            db.commit()
            print("\nChanges COMMITTED.")
        else:
            db.rollback()
            print("\nVerification failed - ROLLED BACK.")
            sys.exit(1)

    db.close()


if __name__ == "__main__":
    main()
