const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { calculate } = require("../js/calc.js");

let passed = 0;

function test(name, fn) {
  fn();
  passed += 1;
  console.log("ok", name);
}

function recipe(id, outputId, outputQty, ingredients) {
  return { id, outputId, outputQty, ingredients };
}

function ing(itemId, qty, consumed = true) {
  return { itemId, qty, consumed };
}

test("desdobra um nível e soma a quantidade pedida", () => {
  const recipes = [recipe("lã", "novelo", 1, [ing("la", 2)])];
  const result = calculate(recipes, "novelo", 3, {});
  assert.deepStrictEqual(result.grossBases, { la: 6 });
  assert.deepStrictEqual(result.netBases, { la: 6 });
});

test("soma o mesmo material em ramos diferentes", () => {
  const recipes = [
    recipe("tecido", "tecido", 1, [ing("novelo", 1), ing("corda", 1)]),
    recipe("novelo", "novelo", 1, [ing("la", 2)]),
    recipe("corda", "corda", 1, [ing("la", 1), ing("junco", 1)]),
  ];
  const result = calculate(recipes, "tecido", 2, {});
  assert.deepStrictEqual(result.grossBases, { la: 6, junco: 2 });
});

test("arredonda a fornada para cima pelo rendimento", () => {
  const recipes = [recipe("pregos", "prego", 10, [ing("ferro", 3)])];
  const result = calculate(recipes, "prego", 11, {});
  assert.deepStrictEqual(result.grossBases, { ferro: 6 });
  assert.equal(result.grossTree.crafts, 2);
  assert.equal(result.grossTree.produced, 20);
});

test("não escolhe sozinho quando há duas receitas", () => {
  const recipes = [
    recipe("ferro", "prego", 10, [ing("ferro", 3)]),
    recipe("sucata", "prego", 2, [ing("sucata", 10)]),
  ];
  const pending = calculate(recipes, "prego", 4, {});
  assert.equal(pending.grossTree.kind, "choice");
  assert.deepStrictEqual(pending.grossBases, { prego: 4 });

  const chosen = calculate(recipes, "prego", 4, { recipeChoice: { prego: "sucata" } });
  assert.equal(chosen.grossTree.kind, "craft");
  assert.deepStrictEqual(chosen.grossBases, { sucata: 20 });
});

test("desconta estoque do produto e dos intermediários", () => {
  const recipes = [
    recipe("tecido", "tecido", 1, [ing("novelo", 1), ing("corda", 1)]),
    recipe("novelo", "novelo", 1, [ing("la", 2)]),
    recipe("corda", "corda", 1, [ing("junco", 1)]),
  ];
  const covered = calculate(recipes, "tecido", 2, { inventory: { tecido: 1, novelo: 1, la: 1 } });
  assert.deepStrictEqual(covered.grossBases, { la: 4, junco: 2 });
  assert.deepStrictEqual(covered.netBases, { junco: 1 });

  const partial = calculate(recipes, "tecido", 2, { inventory: { novelo: 1, la: 1 } });
  assert.deepStrictEqual(partial.netBases, { la: 1, junco: 2 });
});

test("separa ingrediente exigido e não consumido", () => {
  const recipes = [recipe("machado", "machado", 1, [ing("pedra", 2, true), ing("martelo", 1, false)])];
  const result = calculate(recipes, "machado", 3, { inventory: { martelo: 1 } });
  assert.deepStrictEqual(result.grossBases, { pedra: 6 });
  assert.deepStrictEqual(result.grossRequired.martelo, { need: 1, missing: 1 });
  assert.deepStrictEqual(result.netRequired.martelo, { need: 1, missing: 0 });
  assert.equal(result.netTree.children.some((child) => child.kind === "required"), true);
});

test("parar numa etapa impede o desdobramento", () => {
  const recipes = [
    recipe("a", "a", 1, [ing("b", 2)]),
    recipe("b", "b", 1, [ing("c", 4)]),
  ];
  const result = calculate(recipes, "a", 1, { hold: ["b"] });
  assert.deepStrictEqual(result.grossBases, { b: 2 });
});

test("interrompe ciclo", () => {
  const recipes = [
    recipe("a", "a", 1, [ing("b", 1)]),
    recipe("b", "b", 1, [ing("a", 1)]),
  ];
  const result = calculate(recipes, "a", 1, {});
  assert.equal(result.warnings.some((warning) => warning.type === "ciclo"), true);
  assert.equal(result.grossTree.kind, "craft");
});

test("quantidade zero não pede material", () => {
  const recipes = [recipe("lã", "novelo", 1, [ing("la", 2)])];
  const result = calculate(recipes, "novelo", 0, {});
  assert.deepStrictEqual(result.grossBases, {});
});

const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "catalog.json"), "utf8"));

test("o catálogo não traz região, fonte nem fabricação", () => {
  assert.equal(catalog.meta.itemCount, catalog.items.length);
  assert.equal(catalog.meta.recipeCount, catalog.recipes.length);
  assert.equal(catalog.items.filter((item) => item.icon).length, catalog.meta.matchedIcons);
  for (const item of catalog.items) {
    assert.equal(item.source, undefined);
    assert.equal(item.region, undefined);
    assert.equal(item.station, undefined);
    assert.equal(item.notes, undefined);
    if (item.icon) assert.equal(fs.existsSync(path.join(__dirname, "..", item.icon)), true);
    else assert.equal(item.iconMatch, "nenhuma");
  }
  const ids = new Set(catalog.items.map((item) => item.id));
  for (const recipe of catalog.recipes) {
    assert.equal(ids.has(recipe.outputId), true);
    assert.ok(recipe.outputQty > 0);
    for (const ingredient of recipe.ingredients) {
      assert.equal(ids.has(ingredient.itemId), true);
      assert.equal(ingredient.consumed, true);
      assert.ok(ingredient.qty > 0);
    }
  }
});

test("receitas reais do arquivo desdobram como no CSV", () => {
  const fabric = calculate(catalog.recipes, "fiber-fabric", 1, {});
  assert.deepStrictEqual(fabric.grossBases, { reeds: 1, wool: 2 });

  const candle = calculate(catalog.recipes, "candle", 2, {});
  assert.deepStrictEqual(candle.grossBases, {
    "medicinal-herb-red-echinacea": 4,
    grass: 6,
  });

  const orange = calculate(catalog.recipes, "orange-wool", 1, {});
  assert.deepStrictEqual(orange.grossBases, {
    wool: 1,
    "medicinal-herb-white-chamomile": 3,
  });

  const cuca = calculate(catalog.recipes, "cuca", 1, {});
  assert.deepStrictEqual(cuca.grossBases, { egg: 2, milk: 2, wheat: 2 });

  const nails = calculate(catalog.recipes, "nail", 10, {});
  assert.equal(nails.grossTree.kind, "choice");
  const iron = calculate(catalog.recipes, "nail", 10, {
    recipeChoice: { nail: "so-nails-for-iron-piece-recipe" },
  });
  assert.deepStrictEqual(iron.grossBases, { "iron-ore": 15 });
});

console.log(`\n${passed} testes passaram`);
