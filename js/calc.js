(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.GauchoCalc = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function toCount(value) {
    const number = Math.floor(Number(value));
    if (!Number.isFinite(number) || number < 0) return 0;
    return number;
  }

  function cloneCounts(source) {
    const copy = {};
    for (const key of Object.keys(source || {})) copy[key] = toCount(source[key]);
    return copy;
  }

  function indexRecipes(recipes) {
    const byOutput = {};
    for (const recipe of recipes || []) {
      if (!byOutput[recipe.outputId]) byOutput[recipe.outputId] = [];
      byOutput[recipe.outputId].push(recipe);
    }
    return byOutput;
  }

  function emptyNode(itemId, requested) {
    return {
      itemId,
      requested,
      fromStock: 0,
      toCraft: requested,
      kind: "base",
      recipeId: null,
      crafts: 0,
      produced: 0,
      children: [],
      recipeIds: [],
    };
  }

  function walk(itemId, qty, ctx, trail) {
    const requested = toCount(qty);
    const node = emptyNode(itemId, requested);
    if (requested <= 0) {
      node.toCraft = 0;
      return node;
    }
    if (trail.indexOf(itemId) !== -1) {
      node.kind = "cycle";
      ctx.warnings.push({ type: "ciclo", itemId });
      return node;
    }

    const have = toCount(ctx.inventory[itemId]);
    const use = Math.min(have, requested);
    ctx.inventory[itemId] = have - use;
    node.fromStock = use;
    node.toCraft = requested - use;
    if (node.toCraft <= 0) {
      node.kind = "stock";
      return node;
    }
    if (ctx.hold.has(itemId)) {
      node.kind = "base";
      return node;
    }

    const recipes = ctx.byOutput[itemId] || [];
    if (recipes.length === 0) {
      node.kind = "base";
      return node;
    }

    let recipe = null;
    if (recipes.length === 1) recipe = recipes[0];
    else recipe = recipes.find((entry) => entry.id === ctx.recipeChoice[itemId]) || null;

    if (!recipe) {
      node.kind = "choice";
      node.recipeIds = recipes.map((entry) => entry.id);
      return node;
    }
    if (!recipe.outputQty || recipe.outputQty < 1) {
      node.kind = "base";
      ctx.warnings.push({ type: "rendimento", itemId, recipeId: recipe.id });
      return node;
    }

    const crafts = Math.ceil(node.toCraft / recipe.outputQty);
    node.kind = "craft";
    node.recipeId = recipe.id;
    node.crafts = crafts;
    node.produced = crafts * recipe.outputQty;
    node.children = recipe.ingredients.map((ingredient) => {
      if (!ingredient.consumed) {
        const need = toCount(ingredient.qty);
        const owned = toCount(ctx.original[ingredient.itemId]);
        const missing = Math.max(0, need - owned);
        const current = ctx.required[ingredient.itemId] || { need: 0, missing: 0 };
        ctx.required[ingredient.itemId] = {
          need: Math.max(current.need, need),
          missing: Math.max(current.missing, missing),
        };
        const required = emptyNode(ingredient.itemId, need);
        required.kind = "required";
        required.toCraft = missing;
        required.fromStock = Math.min(owned, need);
        required.consumed = false;
        return required;
      }
      return walk(ingredient.itemId, ingredient.qty * crafts, ctx, trail.concat(itemId));
    });
    return node;
  }

  function sumBases(node, totals) {
    if (!node) return;
    if (node.kind === "base" || node.kind === "choice" || node.kind === "cycle") {
      if (node.toCraft > 0) totals[node.itemId] = (totals[node.itemId] || 0) + node.toCraft;
    }
    for (const child of node.children || []) sumBases(child, totals);
  }

  function run(recipes, itemId, qty, options) {
    const safeQty = toCount(qty);
    const byOutput = indexRecipes(recipes);
    const original = cloneCounts(options && options.inventory);
    const ctx = {
      byOutput,
      inventory: cloneCounts(original),
      original,
      recipeChoice: (options && options.recipeChoice) || {},
      hold: new Set((options && options.hold) || []),
      required: {},
      warnings: [],
    };
    const tree = walk(itemId, safeQty, ctx, []);
    const bases = {};
    sumBases(tree, bases);
    return { tree, bases, required: ctx.required, warnings: ctx.warnings };
  }

  function calculate(recipes, itemId, qty, options) {
    const gross = run(recipes, itemId, qty, {
      inventory: {},
      recipeChoice: options && options.recipeChoice,
      hold: options && options.hold,
    });
    const net = run(recipes, itemId, qty, options || {});
    return {
      grossTree: gross.tree,
      netTree: net.tree,
      grossBases: gross.bases,
      netBases: net.bases,
      grossRequired: gross.required,
      netRequired: net.required,
      warnings: gross.warnings,
    };
  }

  return { calculate };
});
