# Paprika Recipe Classification Rules

This document is the single source of truth for classifying recipes into the new taxonomy. Every recipe should be classified against ALL dimensions — a well-tagged recipe will have entries from multiple dimensions (e.g., a recipe might be: Japanese, Chicken, Weeknight, Sheet Pan, One-Pot).

## General Principles

1. **Multi-tag generously.** A recipe can and should have tags from multiple dimensions. "Chicken Teriyaki Rice Bowls" should get: Japanese, Asian, Chicken, Weeknight, Wok.
2. **When in doubt, include the tag.** It's better to over-tag than under-tag. The user can always remove a tag; missing tags make recipes invisible to search.
3. **Use ALL available signals.** Recipe name, ingredients, source, cook/prep times, and directions all carry information. Don't rely on a single field.
4. **Asian is a parent tag.** If a recipe is tagged Chinese, Japanese, Korean, Thai, or Indian, it should ALSO get the "Asian" tag. This lets the user browse broadly ("what Asian food do I have?") or narrowly ("show me Japanese").
5. **Every recipe should get at least one tag from Cuisine and one from Meal Type.** Protein and Equipment are encouraged but not always applicable (e.g., a vinaigrette has no protein, no special equipment).

---

## Dimension 1: Cuisine

Classify based on the dominant flavor profile, key ingredients, and cooking tradition. Use recipe name, ingredients, and source as signals.

| Category | Assign when... |
|----------|---------------|
| **American** | Classic American comfort food, BBQ, burgers, mac and cheese, chili, Thanksgiving classics, New American style. Southern, Cajun/Creole, and Tex-Mex dishes that don't fit cleanly into Mexican. |
| **Asian** | ANY recipe from an Asian cuisine. Always co-tag with the specific cuisine below when identifiable. Use as a standalone only when the recipe blends multiple Asian traditions or is generically "Asian-inspired." |
| **Caribbean** | Jerk seasoning, Caribbean stew, Cuban recipes, Jamaican flavors. Ingredients: scotch bonnet, allspice, plantain, sour orange. |
| **Chinese** | Sichuan, Cantonese, and other Chinese regional cuisines. Ingredients: soy sauce + Shaoxing wine, five-spice, hoisin, oyster sauce, doubanjiang, Sichuan peppercorn. Always co-tag with Asian. |
| **French** | Classic French techniques and dishes. Coq au vin, bourguignon, au poivre, beurre blanc, confit. Source: French cookbooks or explicitly French recipes. |
| **Indian** | Curry (non-Thai), tikka, tandoori, dal, garam masala, turmeric-heavy dishes with cumin/coriander/cardamom. Always co-tag with Asian. |
| **Italian** | Pasta (Italian-style), risotto, parmigiana, Italian sausage dishes, olive oil + garlic + basil/oregano as a base. Sicilian, Neapolitan, Roman. |
| **Japanese** | Miso, teriyaki, ramen, donburi, soy + mirin + sake flavor base, dashi. Always co-tag with Asian. |
| **Korean** | Kimchi, gochujang, gochugaru, Korean BBQ, jjim, bibimbap. Always co-tag with Asian. |
| **Mediterranean** | Greek, Turkish, Middle Eastern, North African. Lemon + olive oil + herbs, tahini, feta, yogurt-based sauces, za'atar, sumac, Aleppo pepper, hummus. |
| **Mexican** | Enchiladas, tacos (Mexican-style), pozole, tinga, salsa verde, chipotle, adobo, cumin + chili powder base. Includes explicitly Tex-Mex. |
| **Thai** | Thai curry (coconut milk + curry paste), fish sauce + lime + basil, pad thai, Thai chili. Always co-tag with Asian. |

### Cuisine edge cases

- **Fusion dishes** (e.g., "Asian Pulled Pork Tacos"): tag ALL relevant cuisines. That one gets Asian + Mexican.
- **"American with Asian influence"** (e.g., gochujang glazed chicken): tag both American and the specific Asian cuisine.
- **Vietnamese**: tag as Asian. We don't have a dedicated Vietnamese category, but pho, banh mi, bo luc lac all get Asian.
- **Portuguese, Spanish**: tag as Mediterranean.

---

## Dimension 2: Protein

Classify based on the PRIMARY protein. If a recipe features two proteins equally, tag both.

| Category | Assign when... |
|----------|---------------|
| **Beef** | Beef chuck, steak, short ribs, ground beef, beef cheeks. |
| **Chicken** | Chicken breasts, thighs, drumsticks, ground chicken, whole chicken. Also includes turkey (there is no separate turkey tag). |
| **Pork** | Pork shoulder, pork chops, bacon (as main protein not garnish), sausage (when it's the star), pulled pork, guanciale/pancetta as primary. |
| **Seafood** | Fish (salmon, cod, mahi mahi, sardines), shrimp, crab, lobster, duck is NOT seafood. |

### Protein edge cases

- **Duck**: tag as Chicken (it's the closest poultry category).
- **Sausage**: tag as Pork unless it's chicken sausage.
- **Bacon/pancetta as garnish** (e.g., in a pasta where it's a flavor component, not the star): do NOT tag Pork.
- **Vegetarian recipes with optional meat**: tag as Vegetarian only. Don't tag the optional protein.
- **Eggs as main protein** (e.g., egg cups): no protein tag.

---

## Dimension 3: Diet

| Category | Assign when... |
|----------|---------------|
| **Vegetarian** | Contains no meat, poultry, or fish. Eggs and dairy are fine. Recipes that are inherently vegetarian (salads, veggie sides, desserts) get this tag. Sauces/condiments that are vegetarian get this tag. |

### Diet edge cases

- **Sides that happen to be vegetarian** (roasted broccoli, green beans): YES, tag Vegetarian.
- **Recipes with optional meat**: tag Vegetarian.
- **Desserts**: tag Vegetarian (unless they contain gelatin, which is rare in this collection).

---

## Dimension 4: Meal Type

Classify based on when/how the recipe is typically eaten.

| Category | Assign when... |
|----------|---------------|
| **Breakfast** | Eggs, muffins, coffee cake, smoothies, pancakes, breakfast-specific dishes. |
| **Beverage** | Cocktails, smoothies, drinks. Can co-tag with Breakfast if it's a breakfast smoothie. |
| **Dessert** | Cakes, cookies, brownies, compotes (when sweet), pudding. |
| **Pasta** | Any recipe where pasta/noodles are the primary vehicle. Includes Italian pasta, Asian noodles, mac and cheese, ramen, pho with noodles. |
| **Salad** | Green salads, grain salads, slaws, chopped salads. Includes coleslaw. Potato salad. |
| **Sandwich** | Sandwiches, subs, wraps, burgers, banh mi. Also includes quesadillas. |
| **Sauce/Condiment** | Standalone sauces, dressings, vinaigrettes, pesto, BBQ sauce, chimichurri, salsa, hummus, kimchi, pickles. Things you make to PUT ON other food. |
| **Sides** | Dishes typically served alongside a main: roasted vegetables, rice, green beans, mashed potatoes, bread. |
| **Soup** | Soups, stews, chili, pozole, pho (yes, also Pasta if noodle-based). Includes bisques, chowders. |
| **Tacos** | Tacos specifically. Also tag with Mexican or the relevant cuisine. Fish tacos, chicken tacos, etc. |

### Meal Type edge cases

- **A recipe can be multiple meal types.** Pho is both Soup and Pasta. A taco salad could be Tacos and Salad.
- **"Main course" dishes that don't fit another meal type** (roast chicken, steak, braised chicken): do NOT force them into a meal type. Not every recipe needs a meal type tag. The cuisine + protein + equipment tags are sufficient.
- **Rice bowls**: not Pasta, not Salad. No meal type tag needed — the other dimensions cover it.
- **Compotes**: Dessert if sweet (strawberry compote), Sauce/Condiment if savory.

---

## Dimension 5: Equipment

Classify based on the PRIMARY cooking vessel or method. Use directions, recipe name, and cooking times as signals.

| Category | Assign when... |
|----------|---------------|
| **Cast Iron** | Directions mention cast iron skillet, or recipe involves high-heat searing followed by oven finishing. Pan-seared steaks, skillet chicken, cornbread. |
| **Dutch Oven** | Braising, long covered stovetop/oven cooking, stews cooked in a heavy pot. Directions mention "dutch oven," "braise," "covered pot." Coq au vin, bourguignon, braised anything. |
| **Griddle** | Flatbreads, smash burgers, quesadillas cooked on a flat surface, pancakes. |
| **Grill** | Outdoor grilling, charcoal/gas grill. Directions mention "grill," "grill marks," cooking over direct heat outdoors. Huli huli chicken, grilled fish. |
| **Instant Pot** | Recipe name or source mentions Instant Pot, pressure cooker. Directions reference pressure cooking. |
| **One-Pot** | Everything cooks in a single pot or pan (not pressure cooker or slow cooker). Name or directions emphasize "one pot," "one pan," "one skillet." Skillet dinners, one-pot pastas. |
| **Oven** | Primary cooking happens in the oven. Roasting, baking (savory), casseroles, sheet pan meals. Roast chicken, baked pasta, roasted vegetables. |
| **Sheet Pan** | Specifically a sheet pan / baking sheet meal. Name mentions "sheet pan," or recipe involves spreading ingredients on a sheet and roasting. |
| **Slow Cooker** | Recipe name or directions mention slow cooker, crock pot. Long low-temperature cooking. |
| **Smoker** | Smoking, low and slow with smoke. BBQ that involves actual smoking. |
| **Sous Vide** | Recipe name or directions mention sous vide, immersion circulator, water bath at specific temperature. |
| **Wok** | Stir-frying, wok-based cooking. High heat, quick cooking, tossing. Chinese stir-fries, fried rice. |

### Equipment edge cases

- **Recipes that use the stove in a regular pot/pan**: no equipment tag needed unless it's specifically a cast iron, dutch oven, or wok preparation.
- **A recipe can have multiple equipment tags.** Sous vide steak finished in cast iron gets both Sous Vide and Cast Iron.
- **Sheet Pan vs Oven**: Sheet Pan is a subset of Oven. If it's specifically a sheet pan recipe, tag Sheet Pan (no need to also tag Oven). If it's roasted in a roasting pan or baking dish, tag Oven.
- **Instant Pot vs One-Pot**: Instant Pot recipes should NOT also get One-Pot. They are distinct methods.
- **No-cook recipes** (salads, dressings, smoothies): no equipment tag.

---

## Dimension 6: Effort / Occasion

| Category | Assign when... |
|----------|---------------|
| **Weeknight** | Total effort is manageable on a busy evening. Apply if ANY of these hold: (a) total active time under 45 min, (b) recipe name contains "quick," "easy," "30 minute," "15 minute," "5 minute," "simple," (c) ingredient list is short (≤10 items) with straightforward directions, (d) it's a sheet pan, stir-fry/wok, or simple one-pot meal, (e) source is budget bytes, damn delicious, or similar weeknight-oriented sites. Do NOT assign if: recipe involves braising (>1hr), long marinating, multi-component assembly, or complex technique. |
| **Batch Cooking** | Makes a large quantity, good for meal prep or feeding a crowd. High servings count (6+), or recipe is designed for leftovers/make-ahead. Pulled pork, big pot chili, large batch stew. |
| **Weekend Project** | Requires significant time, technique, or multi-step processes. Assign if ANY of these hold: (a) total time exceeds 2 hours, (b) recipe involves complex technique (making stock, multi-stage cooking, tempering), (c) recipe name or source suggests project-level effort (Franklin BBQ, Serious Eats' "best" or "ultimate" versions), (d) sous vide with long cook times (>2 hours). |
| **Holiday** | Appropriate for holiday entertaining, dinner parties, special occasions. Prime rib, fancy desserts, elaborate dishes you wouldn't make on a Tuesday. |
| **Thanksgiving** | Specifically Thanksgiving-associated: turkey, cranberry, stuffing, traditional sides (mashed potatoes, gravy, green bean casserole), pumpkin desserts. |
| **Summer** | Best suited for warm weather. Grilled dishes, cold salads, light and fresh preparations, no-cook or minimal-heat recipes, outdoor entertaining food. |

### Effort edge cases

- **A recipe can be both Weeknight AND Batch Cooking** if it's quick to make and yields a lot (e.g., one-pot chili).
- **Instant Pot recipes**: many are Weeknight despite long cook times, because active time is low. Judge by active effort, not total time.
- **Slow Cooker recipes**: similar to Instant Pot — often Weeknight because you set it and forget it. But if prep is extensive, it might be a Weekend Project.
- **If time data is missing**, rely on ingredient count, direction complexity, and recipe name/source.

---

## Dimension 7: Source

Only apply these three source categories. Do not create source tags for any other sites.

| Category | Assign when... |
|----------|---------------|
| **Serious Eats** | Source field contains "seriouseats.com" |
| **NYT Cooking** | Source field contains "cooking.nytimes.com" |
| **177 Milk Street** | Source field contains "177milkstreet.com" |

These are exact matches on the source field. No judgment calls needed.

---

## Output Format

For each recipe, produce a JSON object:

```json
{
  "uid": "the ZUID from the database",
  "name": "recipe name",
  "proposedCategories": ["Category1", "Category2", "Category3"],
  "reasoning": "brief explanation of key classification decisions, especially non-obvious ones"
}
```

Use EXACT category names from this document (Title Case as shown). The valid category names are:

**Cuisine:** American, Asian, Caribbean, Chinese, French, Indian, Italian, Japanese, Korean, Mediterranean, Mexican, Thai
**Protein:** Beef, Chicken, Pork, Seafood
**Diet:** Vegetarian
**Meal Type:** Breakfast, Beverage, Dessert, Pasta, Salad, Sandwich, Sauce/Condiment, Sides, Soup, Tacos
**Equipment:** Cast Iron, Dutch Oven, Griddle, Grill, Instant Pot, One-Pot, Oven, Sheet Pan, Slow Cooker, Smoker, Sous Vide, Wok
**Effort/Occasion:** Batch Cooking, Holiday, Summer, Thanksgiving, Weeknight, Weekend Project
**Source:** 177 Milk Street, NYT Cooking, Serious Eats
