(function () {
  const KEY = "gaucho-origins-user-v1";
  const CATEGORIES = ["não informado", "ingrediente", "ferramenta", "animal", "geral", "personagem", "missão", "outro"];
  const GENERIC = '<svg viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" fill="#14110e"></rect><path d="M10 40h44" stroke="#b5523a" stroke-width="2"></path><path d="M10 46h44" stroke="#2f5342" stroke-width="4"></path><circle cx="32" cy="24" r="7" fill="none" stroke="#f3ecdf" stroke-width="1.5"></circle></svg>';

  const ui = {
    query: "",
    category: "",
    region: "",
    person: "",
    station: "",
    view: "itens",
    itemId: null,
    personId: null,
    wide: window.matchMedia("(min-width: 1100px)").matches,
    pickerItem: null,
    pickerQuery: "",
    pickerFolder: "Todos",
    pickerLimit: 60,
  };

  let catalog = null;
  let mapping = { items: {}, regions: [], people: {} };
  let itemsById = {};
  let peopleById = {};
  let recipesById = {};
  let recipesByOutput = {};
  let user = loadUser();

  const listEl = document.getElementById("list");
  const detailEl = document.getElementById("detail");
  const filtersEl = document.getElementById("filters");
  const searchEl = document.getElementById("search");

  function loadUser() {
    try {
      const parsed = JSON.parse(localStorage.getItem(KEY) || "");
      if (parsed && parsed.version === 1) return sanitizeUser(parsed);
    } catch (error) {}
    return blankUser();
  }

  function blankUser() {
    return { version: 1, items: {}, people: {}, inventory: {}, recipeChoice: {}, hold: [], qty: {}, compact: false };
  }

  function sanitizeUser(data) {
    const next = blankUser();
    next.compact = Boolean(data.compact);
    next.hold = Array.isArray(data.hold) ? data.hold.filter((id) => typeof id === "string") : [];
    for (const key of ["items", "people", "inventory", "recipeChoice", "qty"]) {
      if (data[key] && typeof data[key] === "object") next[key] = data[key];
    }
    return next;
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(user)); } catch (error) {}
  }

  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[char]));
  }

  function norm(value) {
    return String(value ?? "").toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
  }

  function missing(value) {
    return value && String(value).trim() ? esc(value) : '<span class="missing">não informado</span>';
  }

  function iconHtml(src, label, variant) {
    const extra = variant ? ` ${variant}` : "";
    if (!src) return `<span class="icon-frame${extra}" role="img" aria-label="${esc(label || "Ícone genérico")}">${GENERIC}</span>`;
    return `<span class="icon-frame${extra}"><img src="${esc(src)}" alt="" decoding="async"></span>`;
  }

  function findPerson(value) {
    const key = norm(value);
    if (!key || !catalog) return null;
    return catalog.people.find((person) => {
      const view = viewPerson(person.id);
      const assetName = String(view.asset || "").split("/").pop().replace(/\.png$/i, "");
      return [person.id, person.fileName, person.name, view.name, view.asset, assetName].some((part) => norm(part) === key);
    }) || null;
  }

  function regionRecord(value) {
    const key = norm(value);
    if (!key) return null;
    return (mapping.regions || []).find((region) => norm(region.id) === key || norm(region.nome) === key) || null;
  }

  function regionName(value) {
    const region = regionRecord(value);
    if (region && region.nome) return region.nome;
    if (region) return region.id;
    return String(value || "").trim();
  }

  function faceHtml(icon, text, options) {
    const settings = options || {};
    const variant = settings.large ? "" : "mini";
    const picture = icon || settings.generic ? iconHtml(icon, text || "não informado", variant) : "";
    const caption = text ? esc(text) : '<span class="missing">não informado</span>';
    const body = `${picture}<span>${caption}</span>`;
    if (settings.action && settings.id) {
      return `<button type="button" class="with-icon" data-action="${settings.action}" data-id="${esc(settings.id)}">${body}</button>`;
    }
    return `<span class="with-icon">${body}</span>`;
  }

  function characterFace(value) {
    const person = findPerson(value);
    if (!person) return missing(value);
    const view = viewPerson(person.id);
    return faceHtml(view.icon, view.name);
  }

  function regionFace(value) {
    const region = regionRecord(value);
    const name = regionName(value);
    if (!region && !name) return missing("");
    return faceHtml(region && region.icone, name);
  }

  function itemMap(id) {
    return mapping.items[id] || {};
  }

  function personMap(id) {
    return (mapping.people || {})[id] || {};
  }

  function characterRegion(source) {
    const person = findPerson(source);
    if (!person) return "";
    const view = viewPerson(person.id);
    return view && view.region ? view.region : "";
  }

  function viewItem(id) {
    const base = itemsById[id];
    const map = itemMap(id);
    const over = user.items[id] || {};
    if (!base) return null;
    const picked = (key, fallback) => Object.prototype.hasOwnProperty.call(over, key) ? over[key] : fallback;
    const source = picked("source", map.onde_conseguir || "");
    const ownRegion = picked("region", map.regiao || "");
    const fromCharacter = !String(ownRegion || "").trim() ? characterRegion(source) : "";
    return {
      id,
      fileName: base.name,
      name: picked("name", map.nome || base.name),
      category: over.category || base.category,
      source,
      region: String(ownRegion || "").trim() ? ownRegion : fromCharacter,
      regionFromCharacter: Boolean(fromCharacter),
      station: picked("station", map.local_fabricacao || ""),
      notes: picked("notes", map.notas || ""),
      origin: over.origin || "",
      icon: Object.prototype.hasOwnProperty.call(over, "icon") ? over.icon : base.icon,
      iconCustom: Object.prototype.hasOwnProperty.call(over, "icon"),
      iconMatch: base.iconMatch,
      hints: base.hints || [],
    };
  }

  function viewPerson(id) {
    const base = peopleById[id];
    const map = personMap(id);
    const over = user.people[id] || {};
    if (!base) return null;
    const picked = (key, fallback) => Object.prototype.hasOwnProperty.call(over, key) ? over[key] : fallback;
    return {
      id,
      fileName: base.name,
      asset: map.asset || base.icon,
      name: picked("name", map.nome || base.name),
      region: picked("region", map.regiao || ""),
      notes: picked("notes", ""),
      origin: over.origin || "",
      icon: base.icon,
      nameOrigin: base.nameOrigin,
      fileNote: map.notas || "",
    };
  }

  function recipesFor(id) {
    return recipesByOutput[id] || [];
  }

  function saleLines(itemId) {
    if (!catalog || itemId === "coin") return [];
    const name = viewItem(itemId).name;
    const lines = [];
    for (const recipe of catalog.recipes) {
      if (recipe.outputId !== "coin") continue;
      for (const ingredient of recipe.ingredients) {
        if (ingredient.itemId !== itemId) continue;
        const coins = recipe.outputQty;
        const unit = coins === 1 ? "moeda" : "moedas";
        const sold = ingredient.qty === 1 ? name : `${ingredient.qty}× ${name}`;
        lines.push(`${sold} → ${coins} ${unit}`);
      }
    }
    return lines;
  }

  function saleHtml(itemId) {
    return saleLines(itemId).map((line) => `<p class="sale">${esc(line)}</p>`).join("");
  }

  function recipeLabel(recipe) {
    const inputs = recipe.ingredients.map((ingredient) => `${ingredient.qty}× ${viewItem(ingredient.itemId).name}`).join(" + ");
    return `${inputs} → ${recipe.outputQty}× ${viewItem(recipe.outputId).name}`;
  }

  function fieldFallback(entity, id, field) {
    const base = entity === "person" ? peopleById[id] : itemsById[id];
    const map = entity === "person" ? personMap(id) : itemMap(id);
    if (field === "name") return (map.nome || base.name || "").trim();
    if (field === "category") return base.category || "";
    if (field === "source") return (map.onde_conseguir || "").trim();
    if (field === "region") return (map.regiao || "").trim();
    if (field === "station") return (map.local_fabricacao || "").trim();
    if (field === "notes") return (map.notas || "").trim();
    return "";
  }

  function patchEntity(entity, id, field, value) {
    const bucket = entity === "person" ? user.people : user.items;
    const base = entity === "person" ? peopleById[id] : itemsById[id];
    if (!base) return;
    bucket[id] = bucket[id] || {};
    const clean = String(value || "").trim();
    if (clean === fieldFallback(entity, id, field)) {
      delete bucket[id][field];
    } else {
      bucket[id][field] = clean.slice(0, 4000);
    }
    if (!Object.keys(bucket[id]).length) delete bucket[id];
    save();
  }

  function knownRegions() {
    const regions = new Set();
    for (const item of catalog.items) {
      const region = viewItem(item.id).region;
      if (region) regions.add(region);
    }
    for (const person of catalog.people) {
      const region = viewPerson(person.id).region;
      if (region) regions.add(region);
    }
    return [...regions].sort((a, b) => a.localeCompare(b, "pt"));
  }

  function personNames(person) {
    return [person.name, person.fileName, person.id];
  }

  function itemBlob(item) {
    const view = viewItem(item.id);
    const sourcePerson = findPerson(view.source);
    const region = regionRecord(view.region);
    const parts = [view.name, view.fileName, view.category, view.source, sourcePerson && viewPerson(sourcePerson.id).name, view.region, region && region.nome, view.station, view.notes, view.origin];
    for (const recipe of recipesFor(item.id)) {
      parts.push(recipe.name, recipe.sourceFile);
      for (const ingredient of recipe.ingredients) {
        const other = viewItem(ingredient.itemId);
        const ingredientPerson = findPerson(other.source);
        const ingredientRegion = regionRecord(other.region);
        parts.push(other.name, other.fileName, other.source, ingredientPerson && viewPerson(ingredientPerson.id).name, other.region, ingredientRegion && ingredientRegion.nome);
      }
    }
    return norm(parts.join(" "));
  }

  function matchesPerson(source, person) {
    const hay = norm(source);
    if (!hay) return false;
    return personNames(viewPerson(person.id)).some((name) => norm(name) === hay);
  }

  function filteredItems() {
    return catalog.items.filter((item) => {
      if (item.id === "coin") return false;
      const view = viewItem(item.id);
      if (ui.category && view.category !== ui.category) return false;
      if (!sameRegion(view.region, ui.region)) return false;
      if (ui.station === "__none__" && view.station) return false;
      if (ui.station && ui.station !== "__none__" && norm(view.station) !== norm(ui.station)) return false;
      if (ui.person && !matchesPerson(view.source, peopleById[ui.person])) return false;
      if (ui.query && !itemBlob(item).includes(norm(ui.query))) return false;
      return true;
    }).sort((a, b) => viewItem(a.id).name.localeCompare(viewItem(b.id).name, "pt"));
  }

  function peopleWithItems() {
    return catalog.people.filter((person) => catalog.items.some((item) => item.id !== "coin" && matchesPerson(viewItem(item.id).source, person)));
  }

  function sameRegion(stored, filterValue) {
    if (!filterValue) return true;
    if (filterValue === "__none__") return !String(stored || "").trim();
    const left = regionRecord(stored);
    const right = regionRecord(filterValue);
    if (left && right) return left.id === right.id;
    return norm(stored) === norm(filterValue);
  }

  function regionChoices() {
    const choices = (mapping.regions || []).map((region) => ({
      id: region.id,
      label: region.nome || region.id,
    }));
    const known = new Set(choices.map((choice) => norm(choice.id)));
    for (const item of catalog.items) {
      const value = viewItem(item.id).region;
      if (value && !regionRecord(value) && !known.has(norm(value))) {
        known.add(norm(value));
        choices.push({ id: value, label: value });
      }
    }
    return choices;
  }

  function optionList(values, current, emptyLabel, noneLabel) {
    const options = [`<option value="">${esc(emptyLabel)}</option>`];
    if (noneLabel) options.push(`<option value="__none__"${current === "__none__" ? " selected" : ""}>${esc(noneLabel)}</option>`);
    for (const value of values) {
      options.push(`<option value="${esc(value)}"${value === current ? " selected" : ""}>${esc(value)}</option>`);
    }
    return options.join("");
  }

  function renderFilters() {
    const people = peopleWithItems()
      .map((person) => ({ id: person.id, name: viewPerson(person.id).name }))
      .sort((a, b) => a.name.localeCompare(b.name, "pt"));
    filtersEl.innerHTML = `
      <label><span>Região</span><select data-filter="region"><option value="">Todas</option><option value="__none__"${ui.region === "__none__" ? " selected" : ""}>não informado</option>${regionChoices().map((region) => `<option value="${esc(region.id)}"${region.id === ui.region ? " selected" : ""}>${esc(region.label)}</option>`).join("")}</select></label>
      <label><span>Personagem</span><select data-filter="person"><option value="">Todos</option>${people.map((person) => `<option value="${esc(person.id)}"${person.id === ui.person ? " selected" : ""}>${esc(person.name)}</option>`).join("")}</select></label>`;
  }

  function renderChrome() {
    document.documentElement.classList.toggle("compact", Boolean(user.compact));
    document.documentElement.classList.toggle("sheet-open", Boolean(ui.itemId));
    document.getElementById("compact-button").setAttribute("aria-pressed", user.compact ? "true" : "false");
  }

  function renderCards(items) {
    if (!items.length) {
      return `<p class="missing">Nenhum item com esses filtros. Fonte e região só entram na busca depois que você preenche.</p>`;
    }
    return `<div class="cards">${items.map((item) => {
      const view = viewItem(item.id);
      const recipes = recipesFor(item.id);
      const preview = recipes.length === 1
        ? `<ul class="ings">${recipes[0].ingredients.map((ingredient) => {
          const other = viewItem(ingredient.itemId);
          return `<li>${faceHtml(other.icon, `${ingredient.qty}× ${other.name}`, { generic: true })}</li>`;
        }).join("")}</ul>`
        : `<ul class="ings"><li>${recipes.length ? `${recipes.length} receitas` : "sem receita no arquivo"}</li></ul>`;
      return `<button type="button" class="card${item.id === ui.itemId ? " is-open" : ""}" data-action="open-item" data-id="${esc(item.id)}">
        ${iconHtml(view.icon, view.name)}
        <span>
          <h2>${esc(view.name)}</h2>
          ${saleHtml(item.id)}
          ${preview}
          <ul class="meta">
            <li>${characterFace(view.source)}</li>
            <li>${regionFace(view.region)}</li>
          </ul>
        </span>
      </button>`;
    }).join("")}</div>`;
  }

  function renderTable(items) {
    const body = items.map((item) => {
      const recipes = recipesFor(item.id);
      if (!recipes.length) return recipeBlock(item, null);
      return recipes.map((recipe) => recipeBlock(item, recipe)).join("");
    }).join("");
    return `<div class="guide-wrap"><table class="guide">
      <thead><tr><th>Item</th><th>Ingredientes</th><th>Onde conseguir</th><th>Região</th></tr></thead>
      <tbody>${body || `<tr><td colspan="4"><span class="missing">Nenhum item com esses filtros.</span></td></tr>`}</tbody>
    </table></div>`;
  }

  function recipeBlock(item, recipe) {
    const view = viewItem(item.id);
    const ingredients = recipe ? recipe.ingredients : [];
    const span = Math.max(ingredients.length, 1);
    const itemCell = `<div class="item-cell">${iconHtml(view.icon, view.name)}<div>
      <button type="button" class="linkish" data-action="open-item" data-id="${esc(item.id)}">${esc(view.name)}</button>
      ${saleHtml(item.id)}
    </div></div>`;
    const placeCells = (rows) => `<td${rows > 1 ? ` rowspan="${rows}"` : ""}>${characterFace(view.source)}</td><td${rows > 1 ? ` rowspan="${rows}"` : ""}>${regionFace(view.region)}</td>`;
    if (!ingredients.length) {
      return `<tr><td>${itemCell}</td><td><span class="missing">sem receita no arquivo</span></td>${placeCells(1)}</tr>`;
    }
    return ingredients.map((ingredient, index) => {
      const other = viewItem(ingredient.itemId);
      return `<tr>
        ${index === 0 ? `<td rowspan="${span}">${itemCell}</td>` : ""}
        <td>${faceHtml(other.icon, `${ingredient.qty}× ${other.name}`, { generic: true, action: "open-item", id: ingredient.itemId })}${ingredient.consumed ? "" : ' <span class="badge warn">não consumido</span>'}</td>
        ${index === 0 ? placeCells(span) : ""}
      </tr>`;
    }).join("");
  }

  function renderList() {
    renderChrome();
    const items = filteredItems();
    const compact = document.documentElement.classList.contains("compact");
    listEl.innerHTML = !compact && ui.wide ? renderTable(items) : renderCards(items);
  }

  function characterField(id, value) {
    const person = findPerson(value);
    const selected = person ? person.id : "";
    const options = catalog.people.map((entry) => {
      const view = viewPerson(entry.id);
      return `<option value="${esc(entry.id)}"${entry.id === selected ? " selected" : ""}>${esc(view.name)}</option>`;
    }).join("");
    const preview = person ? iconHtml(viewPerson(person.id).icon, viewPerson(person.id).name) : "";
    return `<div class="pair">${preview}<label class="field"><span>Personagem</span><select data-entity="item" data-id="${esc(id)}" data-field="source"><option value="">não informado</option>${options}</select></label></div>`;
  }

  function regionField(id, value) {
    const current = regionRecord(value);
    const selected = current ? current.id : value;
    const custom = value && !current ? `<option value="${esc(value)}" selected>${esc(value)}</option>` : "";
    const options = custom + (mapping.regions || []).map((region) => `<option value="${esc(region.id)}"${region.id === selected ? " selected" : ""}>${esc(region.nome || region.id)}</option>`).join("");
    const preview = current && current.icone ? iconHtml(current.icone, regionName(value) || "Região") : "";
    return `<div class="pair">${preview}<label class="field"><span>Região</span><select data-entity="item" data-id="${esc(id)}" data-field="region"><option value="">não informado</option>${options}</select></label></div>`;
  }

  function renderDetail() {
    if (!ui.itemId || !itemsById[ui.itemId]) {
      detailEl.hidden = true;
      detailEl.innerHTML = "";
      renderChrome();
      return;
    }
    const view = viewItem(ui.itemId);
    const recipes = recipesFor(ui.itemId);
    const regions = knownRegions().map((region) => `<option value="${esc(region)}"></option>`).join("");
    const people = catalog.people.map((person) => `<option value="${esc(viewPerson(person.id).name)}"></option>`).join("");
    const iconNote = view.iconCustom
      ? "Ícone escolhido por você."
      : view.iconMatch === "segura"
        ? "Ícone associado pelo nome do arquivo."
        : view.iconMatch === "confirmada"
          ? "Ícone indicado para este item."
          : "Ícone genérico. Nenhum arquivo corresponde com segurança.";
    detailEl.hidden = false;
    detailEl.innerHTML = `
      <div class="detail-top">
        <button type="button" class="ghost" data-action="close">Voltar</button>
        <button type="button" class="ghost jump" data-action="jump">Materiais</button>
      </div>
      <div class="identity">
        ${iconHtml(view.icon, view.name)}
        <div>
          <label class="sr" for="item-name">Nome</label>
          <input id="item-name" class="name-input" data-entity="item" data-id="${esc(view.id)}" data-field="name" value="${esc(view.name)}">
          ${saleHtml(view.id)}
          <p class="file-note">Nome no arquivo: ${esc(view.fileName)}</p>
          <p class="file-note">${esc(iconNote)}</p>
        </div>
      </div>
      <label class="field"><span>Categoria</span><select data-entity="item" data-id="${esc(view.id)}" data-field="category">${CATEGORIES.map((category) => `<option${category === view.category ? " selected" : ""}>${esc(category)}</option>`).join("")}</select></label>
      <div class="section">
        <h2>Ingredientes</h2>
        ${recipes.length ? recipes.map(renderRecipe).join("") : '<p class="missing">Sem receita no arquivo.</p>'}
      </div>
      <div class="section">
        <h2>Onde conseguir este item</h2>
        <p class="file-note">Onde conseguir usa o id de data/personagens.csv, por exemplo ferreiro. Se a região do item estiver vazia, entra a região desse personagem.</p>
        ${view.regionFromCharacter ? '<p class="file-note">Região copiada do personagem.</p>' : ""}
        ${characterField(view.id, view.source)}
        ${regionField(view.id, view.region)}
        <label class="field"><span>Notas</span><textarea class="area" data-entity="item" data-id="${esc(view.id)}" data-field="notes" placeholder="não informado">${esc(view.notes)}</textarea></label>
        <label class="field"><span>Origem da informação</span><input class="text" data-entity="item" data-id="${esc(view.id)}" data-field="origin" value="${esc(view.origin)}" placeholder="não informado"></label>
        <div class="row-actions">
          <button type="button" class="tiny" data-action="origin" data-entity="item" data-id="${esc(view.id)}" data-origin="observado no jogo">Marcar como observado no jogo</button>
          <button type="button" class="tiny" data-action="origin" data-entity="item" data-id="${esc(view.id)}" data-origin="">Limpar origem</button>
          <button type="button" class="tiny" data-action="icon" data-id="${esc(view.id)}">Corrigir ícone</button>
        </div>
        <p class="file-note">Origem vazia significa não informado. As quantidades continuam as do arquivo.</p>
        ${!view.icon && view.hints.length ? '<p class="file-note">Há arquivos com nome parecido. Em Corrigir ícone dá para vê-los; nenhum foi associado sozinho.</p>' : ""}
      </div>
      <div class="section" id="calculadora">
        <h2>Materiais básicos</h2>
        <p class="file-note">A conta expande as receitas, soma o que se repete e desconta o estoque.</p>
        <div class="stepper">
          <button type="button" data-action="qty" data-dir="-1" aria-label="Diminuir quantidade">−</button>
          <label class="sr" for="qty-input">Quantidade</label>
          <input id="qty-input" data-qty-input value="${esc(user.qty[view.id] || 1)}" inputmode="numeric">
          <button type="button" data-action="qty" data-dir="1" aria-label="Aumentar quantidade">+</button>
        </div>
        <div id="calc-out"></div>
      </div>
      <datalist id="region-list">${regions}</datalist>
      <datalist id="people-list">${people}</datalist>`;
    renderChrome();
    renderCalc();
  }

  function renderRecipe(recipe) {
    const rows = recipe.ingredients.map((ingredient) => {
      const other = viewItem(ingredient.itemId);
      return `<button type="button" class="ingredient" data-action="open-item" data-id="${esc(ingredient.itemId)}">
        ${iconHtml(other.icon, other.name)}
        <span>
          <strong>${ingredient.qty}× ${esc(other.name)}</strong>
          <span class="badge ${ingredient.consumed ? "quiet" : "warn"}">${ingredient.consumed ? "consumido" : "não consumido"}</span>
          <p>${characterFace(other.source)}</p>
          <p>${regionFace(other.region)}</p>
        </span>
      </button>`;
    }).join("");
    return `<article class="recipe">
      <h3>${esc(recipeLabel(recipe))}</h3>
      <p>Produz ${recipe.outputQty}</p>
      <p class="file-note">Extraído de gaucho-recipes.csv · ${esc(recipe.sourceFile)}</p>
      ${rows}
    </article>`;
  }

  function currentQty() {
    if (!Object.prototype.hasOwnProperty.call(user.qty, ui.itemId)) return 1;
    const value = Math.floor(Number(user.qty[ui.itemId]));
    return Number.isFinite(value) && value > 0 ? value : 0;
  }

  function renderCalc() {
    const host = document.getElementById("calc-out");
    if (!host || !ui.itemId) return;
    const result = window.GauchoCalc.calculate(catalog.recipes, ui.itemId, currentQty(), {
      inventory: user.inventory,
      recipeChoice: user.recipeChoice,
      hold: user.hold,
    });
    host.innerHTML = `${renderSummary(result)}${renderRequired(result)}${renderWarnings(result)}${renderTree(result.netTree, true)}`;
  }

  function renderSummary(result) {
    const ids = [...new Set([...Object.keys(result.grossBases), ...Object.keys(result.netBases)])];
    if (!ids.length) return `<p class="callout">Nenhum material básico para esta quantidade. Se houver mais de uma receita, escolha uma na árvore abaixo.</p>`;
    const rows = ids.map((id) => {
      const view = viewItem(id);
      const have = Object.prototype.hasOwnProperty.call(user.inventory, id) ? user.inventory[id] : "";
      return `<li class="sum-row">
        <button type="button" class="sum-item" data-action="open-item" data-id="${esc(id)}">${iconHtml(view.icon, view.name)}<span>${esc(view.name)}</span></button>
        <p>Receita <strong>${result.grossBases[id] || 0}</strong></p>
        <label><span>Tenho</span><input data-inv="${esc(id)}" inputmode="numeric" value="${esc(have)}" placeholder="0"></label>
        <p>Falta <strong>${result.netBases[id] || 0}</strong></p>
      </li>`;
    }).join("");
    return `<p class="file-note">Receita é o total sem estoque. Falta desconta o que você já tem, também no meio da cadeia.</p><ul class="summary">${rows}</ul>`;
  }

  function renderRequired(result) {
    const ids = Object.keys(result.grossRequired || {});
    if (!ids.length) return "";
    const rows = ids.map((id) => {
      const view = viewItem(id);
      const gross = result.grossRequired[id];
      const net = result.netRequired[id] || gross;
      return `<li class="sum-row">
        <button type="button" class="sum-item" data-action="open-item" data-id="${esc(id)}">${iconHtml(view.icon, view.name)}<span>${esc(view.name)}</span></button>
        <p>Exigido <strong>${gross.need}</strong></p>
        <p></p>
        <p>Falta <strong>${net.missing}</strong></p>
      </li>`;
    }).join("");
    return `<h3>Exigido e não consumido</h3><ul class="summary">${rows}</ul>`;
  }

  function renderWarnings(result) {
    if (!result.warnings.length) return "";
    return `<p class="callout">A conta parou num ciclo: uma receita volta para um item que já estava sendo fabricado.</p>`;
  }

  function renderTree(node, root) {
    if (!node) return "";
    const view = viewItem(node.itemId);
    const recipe = node.recipeId ? recipesById[node.recipeId] : null;
    let status = "Sem desdobrar.";
    if (node.kind === "craft") {
      status = `${recipeLabel(recipe)}. ${node.crafts} ${node.crafts === 1 ? "fornada" : "fornadas"}, produz ${node.produced}.`;
      if (node.produced > node.toCraft) status += ` Pedido ${node.toCraft}; a fornada rende ${node.produced}.`;
    } else if (node.kind === "choice") status = "Há mais de uma receita. Escolha qual usar.";
    else if (node.kind === "cycle") status = "Ciclo. A conta parou aqui.";
    else if (node.kind === "stock") status = `Coberto pelo estoque (${node.fromStock}).`;
    else if (node.kind === "required") status = "Exigido e não consumido.";
    if (node.fromStock && node.kind !== "stock") status = `${node.fromStock} do estoque. ${status}`;

    const choice = node.kind === "choice" ? `<label class="choice"><span>Receita</span><select data-choice="${esc(node.itemId)}"><option value="">escolher</option>${node.recipeIds.map((id) => `<option value="${esc(id)}">${esc(recipeLabel(recipesById[id]))}</option>`).join("")}</select></label>` : "";
    const canHold = node.kind !== "required" && node.kind !== "stock" && recipesFor(node.itemId).length > 0;
    const held = user.hold.includes(node.itemId);
    const hold = canHold ? `<button type="button" class="tiny" data-action="hold" data-id="${esc(node.itemId)}">${held ? "Desdobrar receita" : "Parar nesta etapa"}</button>` : "";
    const open = root
      ? `<button type="button" class="linkish" data-action="noop">${esc(view.name)}</button>`
      : `<button type="button" class="linkish" data-action="open-item" data-id="${esc(node.itemId)}">${esc(view.name)}</button>`;
    const children = (node.children || []).map((child) => renderTree(child, false)).join("");
    return `<div class="tree-node">
      <p>${open} <strong>×${node.requested}</strong></p>
      <p class="file-note">${esc(status)}</p>
      ${choice}${hold}
      ${children}
    </div>`;
  }

  function renderIconDialog() {
    const view = viewItem(ui.pickerItem);
    if (!view) return;
    const folders = ["Todos", ...new Set(catalog.icons.map((icon) => icon.folder))];
    const query = norm(ui.pickerQuery);
    const filtered = catalog.icons.filter((icon) => {
      if (ui.pickerFolder !== "Todos" && icon.folder !== ui.pickerFolder) return false;
      if (!query) return true;
      return norm(`${icon.label} ${icon.file} ${icon.folder}`).includes(query);
    });
    const hints = view.hints.length ? `<div class="hints">${view.hints.map((hint) => `<button type="button" class="ghost" data-action="use-icon" data-path="${esc(hint.icon)}">${esc(hint.file)} — ${esc(hint.reason)}</button>`).join("")}</div>` : "";
    document.getElementById("icon-dialog-body").innerHTML = `
      <p class="file-note">${esc(view.fileName)}</p>
      ${hints}
      <div class="row-actions">
        <button type="button" class="tiny" data-action="clear-icon">Usar ícone genérico</button>
        <button type="button" class="tiny" data-action="auto-icon">Voltar à associação automática</button>
      </div>
      <label class="field"><span>Buscar arquivo</span><input id="picker-search" class="text" value="${esc(ui.pickerQuery)}" placeholder="nome do arquivo"></label>
      <div class="tabs">${folders.map((folder) => `<button type="button" class="tiny" data-action="folder" data-folder="${esc(folder)}" aria-pressed="${folder === ui.pickerFolder ? "true" : "false"}">${esc(folder)}</button>`).join("")}</div>
      <div class="icon-grid">${filtered.slice(0, ui.pickerLimit).map((icon) => `<button type="button" class="icon-option" data-action="use-icon" data-path="${esc(icon.path)}"><img src="${esc(icon.path)}" alt=""><span>${esc(icon.label)}</span></button>`).join("")}</div>
      ${filtered.length > ui.pickerLimit ? `<button type="button" class="ghost" data-action="more-icons">Mostrar mais ${filtered.length - ui.pickerLimit}</button>` : `<p class="file-note">${filtered.length} ícones</p>`}`;
  }

  function openItem(id) {
    if (!itemsById[id]) return;
    ui.view = "itens";
    ui.itemId = id;
    ui.personId = null;
    const next = `#/item/${encodeURIComponent(id)}`;
    if (location.hash !== next) location.hash = next;
    else renderAll();
  }

  function readHash() {
    const hash = decodeURIComponent(location.hash.replace(/^#/, ""));
    const item = hash.match(/^\/item\/([^/]+)/);
    ui.view = "itens";
    ui.personId = null;
    ui.itemId = item && itemsById[item[1]] ? item[1] : null;
  }

  function renderAll() {
    if (!catalog) return;
    renderFilters();
    renderList();
    renderDetail();
  }

  function setQty(next) {
    const value = Math.max(1, Math.floor(Number(next)) || 1);
    user.qty[ui.itemId] = value;
    save();
    const input = document.getElementById("qty-input");
    if (input && document.activeElement !== input) input.value = String(value);
    renderCalc();
  }

  function onClick(event) {
    const target = event.target.closest("[data-action]");
    if (!target) return;
    const action = target.dataset.action;
    const id = target.dataset.id;
    if (action === "open-item") openItem(id);
    else if (action === "close") history.length > 1 ? history.back() : (location.hash = "#/");
    else if (action === "compact") {
      user.compact = !user.compact;
      save();
      renderAll();
    } else if (action === "help") document.getElementById("help-dialog").showModal();
    else if (action === "data") document.getElementById("data-dialog").showModal();
    else if (action === "close-dialog") document.getElementById(target.dataset.dialog).close();
    else if (action === "jump") document.getElementById("calculadora")?.scrollIntoView({ behavior: "smooth", block: "start" });
    else if (action === "qty") setQty(currentQty() + Number(target.dataset.dir));
    else if (action === "hold") {
      user.hold = user.hold.includes(id) ? user.hold.filter((entry) => entry !== id) : user.hold.concat(id);
      save();
      renderCalc();
    } else if (action === "origin") {
      patchEntity(target.dataset.entity, id, "origin", target.dataset.origin);
      renderAll();
    } else if (action === "icon") {
      ui.pickerItem = id;
      ui.pickerQuery = "";
      ui.pickerFolder = "Todos";
      ui.pickerLimit = 60;
      renderIconDialog();
      document.getElementById("icon-dialog").showModal();
    } else if (action === "use-icon") {
      user.items[ui.pickerItem] = user.items[ui.pickerItem] || {};
      user.items[ui.pickerItem].icon = target.dataset.path || null;
      save();
      document.getElementById("icon-dialog").close();
      renderAll();
    } else if (action === "clear-icon") {
      user.items[ui.pickerItem] = user.items[ui.pickerItem] || {};
      user.items[ui.pickerItem].icon = null;
      save();
      document.getElementById("icon-dialog").close();
      renderAll();
    } else if (action === "auto-icon") {
      if (user.items[ui.pickerItem]) delete user.items[ui.pickerItem].icon;
      if (user.items[ui.pickerItem] && !Object.keys(user.items[ui.pickerItem]).length) delete user.items[ui.pickerItem];
      save();
      document.getElementById("icon-dialog").close();
      renderAll();
    } else if (action === "folder") {
      ui.pickerFolder = target.dataset.folder;
      ui.pickerLimit = 60;
      renderIconDialog();
    } else if (action === "more-icons") {
      ui.pickerLimit += 60;
      renderIconDialog();
    } else if (action === "export") exportNotes();
    else if (action === "import") document.getElementById("import-file").click();
    else if (action === "reset" && confirm("Apagar anotações, estoque e ícones corrigidos neste aparelho?")) {
      const compact = user.compact;
      user = blankUser();
      user.compact = compact;
      save();
      renderAll();
    }
  }

  function onInput(event) {
    const target = event.target;
    if (target.id === "search") {
      ui.query = target.value;
      renderList();
      return;
    }
    if (target.id === "picker-search") {
      ui.pickerQuery = target.value;
      ui.pickerLimit = 60;
      const caret = target.selectionStart;
      renderIconDialog();
      const again = document.getElementById("picker-search");
      if (again) {
        again.focus();
        again.setSelectionRange(caret, caret);
      }
      return;
    }
    if (target.dataset.inv) {
      const key = target.dataset.inv;
      const clean = target.value.trim();
      if (!clean) delete user.inventory[key];
      else user.inventory[key] = Math.max(0, Math.floor(Number(clean) || 0));
      save();
      const caret = target.selectionStart;
      renderCalc();
      const safe = window.CSS && CSS.escape ? CSS.escape(key) : key;
      const again = document.querySelector(`[data-inv="${safe}"]`);
      if (again) {
        again.focus();
        again.setSelectionRange(caret, caret);
      }
      return;
    }
    if (target.dataset.qtyInput) {
      user.qty[ui.itemId] = Math.max(0, Math.floor(Number(target.value) || 0));
      save();
      renderCalc();
      return;
    }
    if (target.dataset.field) {
      patchEntity(target.dataset.entity, target.dataset.id, target.dataset.field, target.value);
      renderList();
      if (["region", "station", "source", "name"].includes(target.dataset.field)) renderFilters();
    }
  }

  function onChange(event) {
    const target = event.target;
    if (target.dataset.filter) {
      ui[target.dataset.filter] = target.value;
      renderList();
      return;
    }
    if (target.dataset.choice) {
      if (target.value) user.recipeChoice[target.dataset.choice] = target.value;
      else delete user.recipeChoice[target.dataset.choice];
      save();
      renderCalc();
      return;
    }
    if (target.dataset.field && ["category", "source", "region"].includes(target.dataset.field)) {
      patchEntity(target.dataset.entity, target.dataset.id, target.dataset.field, target.value);
      renderAll();
    }
  }

  function exportNotes() {
    const blob = new Blob([JSON.stringify(user, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "gaucho-origins-anotacoes.json";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(link.href);
  }

  async function importNotes(file) {
    try {
      const data = JSON.parse(await file.text());
      if (!data || data.version !== 1) throw new Error("formato");
      user = sanitizeUser(data);
      save();
      readHash();
      renderAll();
    } catch (error) {
      alert("Não consegui ler este arquivo. Use um JSON exportado por este guia.");
    }
  }

  function parseCsv(text) {
    const rows = [];
    let row = [];
    let cell = "";
    let quoted = false;
    const source = String(text || "").replace(/^\uFEFF/, "");
    for (let index = 0; index < source.length; index += 1) {
      const char = source[index];
      if (quoted) {
        if (char === '"' && source[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else if (char === '"') quoted = false;
        else cell += char;
      } else if (char === '"') quoted = true;
      else if (char === ",") {
        row.push(cell);
        cell = "";
      } else if (char === "\n") {
        row.push(cell);
        rows.push(row);
        row = [];
        cell = "";
      } else if (char !== "\r") cell += char;
    }
    if (cell || row.length) {
      row.push(cell);
      rows.push(row);
    }
    const header = rows.shift() || [];
    return rows.filter((entry) => entry.some((value) => value.trim())).map((entry) => {
      const record = {};
      header.forEach((key, index) => { record[key] = entry[index] || ""; });
      return record;
    });
  }

  function indexMapping(rows) {
    const items = {};
    for (const row of rows) {
      if (row.id) items[row.id] = row;
    }
    return items;
  }

  function indexCatalog() {
    itemsById = Object.fromEntries(catalog.items.map((item) => [item.id, item]));
    peopleById = Object.fromEntries(catalog.people.map((person) => [person.id, person]));
    recipesById = Object.fromEntries(catalog.recipes.map((recipe) => [recipe.id, recipe]));
    recipesByOutput = {};
    for (const recipe of catalog.recipes) {
      if (!recipesByOutput[recipe.outputId]) recipesByOutput[recipe.outputId] = [];
      recipesByOutput[recipe.outputId].push(recipe);
    }
  }

  async function start() {
    applyCompactEarly();
    try {
      const response = await fetch("./data/catalog.json", { cache: "no-store" });
      if (!response.ok) throw new Error("sem catalogo");
      catalog = await response.json();
    } catch (error) {
      listEl.innerHTML = `<p class="error">Não encontrei os dados. No Mac, deixe o <strong>iniciar.sh</strong> aberto e use http://localhost:8731. Abrir o arquivo direto no navegador não carrega o guia.</p>`;
      return;
    }
    try {
      const mapResponse = await fetch("./data/mapeamento.csv", { cache: "no-store" });
      if (mapResponse.ok) mapping.items = indexMapping(parseCsv(await mapResponse.text()));
      const regionResponse = await fetch("./data/regioes.csv", { cache: "no-store" });
      if (regionResponse.ok) mapping.regions = parseCsv(await regionResponse.text());
      const peopleResponse = await fetch("./data/personagens.csv", { cache: "no-store" });
      if (peopleResponse.ok) mapping.people = indexMapping(parseCsv(await peopleResponse.text()));
    } catch (error) {
      mapping = { items: {}, regions: [], people: {} };
    }
    indexCatalog();
    readHash();
    renderAll();
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(() => {});
  }

  function applyCompactEarly() {
    document.documentElement.classList.toggle("compact", Boolean(user.compact));
    document.getElementById("compact-button").setAttribute("aria-pressed", user.compact ? "true" : "false");
  }

  document.addEventListener("click", onClick);
  document.addEventListener("input", onInput);
  document.addEventListener("change", onChange);
  window.addEventListener("hashchange", () => { readHash(); renderAll(); });
  window.matchMedia("(min-width: 1100px)").addEventListener("change", (event) => {
    ui.wide = event.matches;
    renderList();
  });
  document.getElementById("import-file").addEventListener("change", (event) => {
    const file = event.target.files && event.target.files[0];
    if (file) importNotes(file);
    event.target.value = "";
  });
  searchEl.addEventListener("search", () => { ui.query = searchEl.value; renderList(); });

  start();
})();
