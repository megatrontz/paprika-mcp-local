# Migration 001: Category Taxonomy Overhaul

This folder captures the work of a multi-hour data cleaning session where we
audited Paprika's messy category system, designed a new 7-dimensional taxonomy,
classified 350 recipes against it, and applied the changes to the live SQLite
database. The migration completed successfully on 2026-04-12.

The intent of this export is to serve as source material for building a
**Paprika data cleaning skill** that can be re-used for future cleanup work
(times, ratings, duplicates, descriptions, etc.).

## Files in this folder

- `migrate.py` — The Python migration script that applied categories to the
  live database. Demonstrates the safe-write pattern (plan, dry-run, verify,
  apply) and handles all Core Data bookkeeping. Takes `--db` and
  `--classifications` path arguments.
- `classification-rules.md` — The shared rules doc that served as context
  anchor for parallel subagent classification. Contains the 7-dimension
  taxonomy and detailed rules for every dimension.

The raw session transcript and the 350-recipe classifications JSON that
originally lived here have been omitted from the public repo — they
contained personal recipe data. The migration script expects the
classifications file as a `{uid: {"categories": [...], ...}}` JSON map;
see `load_classifications` in `migrate.py`.

## Key architectural decisions worth carrying forward

### 1. Plan / Dry-run / Verify / Apply

Every destructive DB operation should go through these four phases:

1. **Plan** — build an immutable plan object describing every change without
   touching the DB. Makes the operation reviewable.
2. **Dry-run** — apply the plan inside a transaction against the backup copy,
   verify the resulting state matches expectations, then ROLLBACK.
3. **Apply** — same transaction, but on the live file, COMMIT if verify passes.
4. **Verify** — post-migration integrity check + per-row diff against the
   intended state.

See `migrate.py::plan_migration`, `apply_migration`, `verify_post_migration`.

### 2. Wipe-and-rebuild beats incremental diff for join tables

The first version of the migration tried to compute minimal join-table diffs
(which rows to remove, which to add). It produced 2 mismatches because the
remapping logic interacted poorly with the duplicate-merge step.

The fix: for each recipe being updated, wipe ALL its join rows and rebuild
from the desired state. Idempotent, simpler, and an order of magnitude easier
to reason about. The small perf cost doesn't matter at this scale.

### 3. Core Data bookkeeping is non-negotiable

Paprika's SQLite is a Core Data store. Writes that skip the bookkeeping will
either fail to sync or corrupt state:

- `Z_OPT` (optimistic locking) must increment on any row update.
- `Z_ENT` (entity type ID) must match for inserts.
- `Z_PRIMARYKEY.Z_MAX` must be bumped when inserting new rows with a higher PK.
- Timestamps use Core Data epoch (2001-01-01), not Unix epoch. Offset:
  +978307200 seconds.

### 4. Shared rules doc as context anchor for parallel agents

Classification of 350 recipes was done by 7 parallel subagents, each handling
a batch of 50. Consistency across batches came from every agent reading the
same `classification-rules.md` before starting. This preserves decisions like
"kielbasa → Pork, not Beef" across agent invocations without passing giant
prompts.

### 5. Backup that persists outside the sandbox

The live DB was copied to a persistent location outside the sandbox
(e.g. `~/Paprika-backup-pre-migration-YYYYMMDD.sqlite`) before writes, verified byte-identical via MD5, and checked with
`PRAGMA integrity_check`. Rollback is a single file copy. Do not rely on
sandbox-local backups — those can disappear with the session.

## Known gotchas discovered during the session

- **better-sqlite3 fails to compile in the sandbox** (node-gyp 403 on header
  download). The MCP server uses `bun:sqlite` now; this migration script uses
  Python's stdlib `sqlite3`.
- **Duplicate category names**: Paprika allowed two "Thanksgiving" rows with
  different PKs. The merge step handles this by moving all joins to the
  keeper PK before deleting the duplicate.
- **Case variants look like duplicates but aren't**: `breakfast` vs
  `Breakfast`, `seafood` vs `Seafood`. The `CATEGORY_REMAP` table in
  `migrate.py` handles these explicitly.
- **Aggressive auto-classification agents can regress good data**. Round 2
  of the protein cleanup agent added Chicken tags based on chicken stock in
  ingredients, and removed Beef from a prime rib recipe. Always require a
  human review step before writing to the DB.
- **Paprika holds a database lock while open**. Quit Paprika before writes,
  relaunch after commit to trigger cloud sync.

## What's still open (future cleanup passes)

- Prep/cook/total times are missing on ~38% / ~87% of recipes.
- Ratings are mostly 0. Could be assisted by extracting review signal from
  source URLs or by recipe popularity heuristics.
- 5 pairs of duplicate recipes by name.
- Many recipes have sparse or missing descriptions.
- Post-migration: Turkey was split out from Chicken as its own category
  (10 recipes moved). Similar splits might be warranted for Lamb, Duck,
  Game, Venison if those show up meaningfully.

## Skill-creation notes

When converting this into a skill, the reusable pieces are:

1. The four-phase write pattern (plan/dry-run/verify/apply).
2. The Core Data bookkeeping primitives (Z_OPT bump, Z_ENT lookup,
   Z_PRIMARYKEY.Z_MAX update, Core Data epoch helpers).
3. The backup-then-verify-checksum helper.
4. The parallel-subagent + shared-rules-doc pattern for any classification
   or cleanup task where the taxonomy is large enough that a single pass
   through one agent would lose context.
5. The wipe-and-rebuild pattern for join-table updates.

The one-shot specifics (the 7-dimension taxonomy, the classification rules,
the specific category remap table) should NOT be baked into the skill.
They should be inputs the skill accepts. A future cleanup for ratings or
times will have its own rules doc but use the same infrastructure.
