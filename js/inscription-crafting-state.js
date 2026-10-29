(function (root, factory) {
  "use strict";
  var api = factory(typeof module === "object" && module.exports ? require("./inscription-rules.js") : root.InscriptionRules);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.InscriptionCraftingState = api;
})(typeof window !== "undefined" ? window : null, function (Rules) {
  "use strict";
  var KEY = "qinshi_inscription_crafting_v1", sequence = 0;
  function copy(value) { return JSON.parse(JSON.stringify(value)); }
  function fail(message) { throw new Error(message); }
  function object(value) { return !!value && typeof value === "object" && !Array.isArray(value); }
  function quantity(value) { if (!Number.isSafeInteger(value) || value < 0) fail("数量必须为非负安全整数"); return value; }
  function concrete(value) {
    var result = Rules.validate(value);
    if (!result.valid) fail(result.errors.join("；"));
    return result.material;
  }
  function empty() { return { schemaVersion: 1, idSequence: 0, actual: [], goals: [], workspaces: {}, draft: {} }; }
  function workspace() { return { inventory: [], stage: "b2", selection: [], pending: null }; }
  function refreshSpeedProbability(pending, output, materials) {
    // Only the old duplicate-blue-speed 1/9 model changed. Keep the sampled
    // material and all inventory quantities, while refreshing its model label.
    if (!output || pending.probability !== 1/9 || output.probability !== 1/17 || !Array.isArray(materials) || materials.length !== 2) return;
    var first=materials[0], second=materials[1];
    if (first.quality==='b2' && second.quality==='b2' && ['鬼遁','龙遁'].includes(first.dun) && first.dun===second.dun &&
        first.terms.length===1 && second.terms.length===1 && first.terms[0].tier==='?' && second.terms[0].tier==='?' && first.terms[0].attr===second.terms[0].attr &&
        output.material.terms.some(function(t){return t.attr===first.terms[0].attr&&t.tier==='M';})) pending.probability=output.probability;
  }
  function requireWorkspace(state, id) {
    if (!state.goals.some(function (g) { return g.id === id; }) || !Object.hasOwn(state.workspaces, id)) fail("目标不存在");
    return state.workspaces[id];
  }
  function goalData(value) {
    if (!object(value)) fail("目标格式无效");
    if (Rules.prefixes.indexOf(value.prefix) < 0) fail("请选择正确前缀");
    var dun = Rules.normalizeDun(value.dun), best = Rules.bestTargets(dun, value.quality, value.attrs);
    if (!best.targets.length) fail(best.reason);
    var terms = value.targetTerms || best.targets[0];
    var candidate = { prefix: value.prefix, dun: dun, quality: value.quality, origin: "crafted", terms: terms };
    var sig = Rules.signature(candidate);
    var matched = best.targets.find(function (t) { return Rules.signature(Object.assign({}, candidate, { terms: t })) === sig; });
    if (!matched) fail("具体目标与所选最高属性组合不符");
    return { name: typeof value.name === "string" ? value.name : "未命名目标", prefix: value.prefix, dun: dun,
      quality: value.quality, attrs: value.attrs.map(Rules.normalizeAttr), targetTerms: copy(matched), discipleKey: typeof value.discipleKey === "string" ? value.discipleKey : null };
  }
  function checkInventory(entries) {
    if (!Array.isArray(entries)) fail("库存数据无效");
    var seen = new Set();
    entries.forEach(function (entry) {
      if (!object(entry) || quantity(entry.quantity) === 0) fail("库存数量无效");
      var material = concrete(entry.material), sig = Rules.signature(material);
      if (entry.signature !== sig || seen.has(sig)) fail("库存签名无效或重复");
      seen.add(sig);
    });
  }
  function selected(ws, selection, goal) {
    if (!Array.isArray(selection)) fail("材料选择无效");
    var counts = new Map(), materials = [];
    selection.forEach(function (sig) {
      if (typeof sig !== "string") fail("请选择具体库存材料");
      var entry = ws.inventory.find(function (item) { return item.signature === sig; });
      var used = (counts.get(sig) || 0) + 1; counts.set(sig, used);
      if (!entry || used > entry.quantity) fail("虚拟库存材料不足");
      if (goal && (entry.material.prefix !== goal.prefix || entry.material.dun !== goal.dun)) fail("所选材料必须与目标同前缀、遁位");
      materials.push(entry.material);
    });
    var preview = Rules.preview(materials);
    if (!preview.valid) fail(preview.errors.join("；"));
    return { materials: materials, preview: preview, inputs: Array.from(counts, function (entry) { return { signature: entry[0], quantity: entry[1] }; }) };
  }
  function checkState(state) {
    if (!object(state) || state.schemaVersion !== 1 || !Number.isSafeInteger(state.idSequence) || state.idSequence < 0 || !Array.isArray(state.goals) || !object(state.workspaces) || !object(state.draft)) fail("存档结构或版本不支持");
    checkInventory(state.actual);
    var ids = new Set();
    state.goals.forEach(function (goal) {
      if (!object(goal) || typeof goal.id !== "string" || !goal.id || ["__proto__", "constructor", "prototype"].includes(goal.id) || ids.has(goal.id)) fail("目标标识无效或重复");
      ids.add(goal.id); goalData(goal);
      var ws = state.workspaces[goal.id];
      if (!object(ws) || !Rules.qualities.some(function (q) { return q.id === ws.stage; }) || !Array.isArray(ws.selection)) fail("工作台数据无效");
      checkInventory(ws.inventory);
      if (!ws.selection.every(function (sig) { return typeof sig === "string"; })) fail("选择数据无效");
      if (ws.pending !== null) {
        var pending = ws.pending;
        if (!object(pending) || typeof pending.id !== "string" || !pending.id || !Array.isArray(pending.selection) || !Array.isArray(pending.inputs)) fail("待提交事务无效");
        var recipe = selected(ws, pending.selection, goal);
        if (JSON.stringify(recipe.inputs) !== JSON.stringify(pending.inputs) || JSON.stringify(ws.selection) !== JSON.stringify(pending.selection)) fail("待提交材料已改变");
        var result = concrete(pending.result), output = recipe.preview.outcomes.find(function (o) { return Rules.signature(o.material) === Rules.signature(result); });
        refreshSpeedProbability(pending,output,recipe.materials);
        if (!output || result.origin !== "crafted" || pending.probability !== output.probability || pending.quality !== recipe.preview.quality) fail("待提交结果无效");
      }
    });
    if (Object.keys(state.workspaces).some(function (id) { return !ids.has(id); })) fail("工作台没有对应目标");
    return state;
  }
  function setEntry(entries, material, amount) {
    quantity(amount);
    var sig = Rules.signature(material), index = entries.findIndex(function (entry) { return entry.signature === sig; });
    if (amount === 0) { if (index >= 0) entries.splice(index, 1); return; }
    var entry = { signature: sig, material: material, quantity: amount };
    if (index >= 0) entries[index] = entry; else entries.push(entry);
    entries.sort(function (a,b) { return a.signature < b.signature ? -1 : a.signature > b.signature ? 1 : 0; });
  }
  function createStore(storage, options) {
    options = options || {};
    if (!storage || typeof storage.getItem !== "function" || typeof storage.setItem !== "function") fail("账号存储不可用");
    function read() {
      var raw = storage.getItem(KEY);
      if (raw === null || raw === undefined) return empty();
      try { return checkState(JSON.parse(raw)); }
      catch (error) { fail("合成存档损坏或版本不支持；原始数据已保留，禁止覆盖：" + error.message); }
    }
    function uniqueId(state) {
      var seed = options.uuid ? options.uuid() : (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : Date.now().toString(36) + "-" + (++sequence).toString(36) + "-" + Math.random().toString(36).slice(2));
      if (typeof seed !== "string" || !seed || ["__proto__", "constructor", "prototype"].includes(seed) || state.idSequence === Number.MAX_SAFE_INTEGER) fail("无法生成唯一事务标识");
      var id = seed + ":" + (++state.idSequence);
      if (state.goals.some(function (g) { return g.id === id; }) || Object.values(state.workspaces).some(function (ws) { return ws.pending && ws.pending.id === id; })) fail("无法生成唯一事务标识");
      return id;
    }
    function change(fn) {
      function accountId() { var account=typeof storage.currentAccount === "function" ? storage.currentAccount() : null; return account ? account.id : null; }
      var account=accountId(), before=storage.getItem(KEY), state = read(), result = fn(state);
      checkState(state);
      // Recheck after injectable callbacks (rng/uuid) and immediately before the
      // single write. Never overwrite a reentrant edit or a newly selected account.
      if (accountId() !== account || storage.getItem(KEY) !== before) fail("当前账号或合成存档已改变，请刷新后重试");
      try { if (storage.setItem(KEY, JSON.stringify(state)) === false) fail("存储拒绝写入"); }
      catch (error) { fail("合成数据保存失败，未提交：" + error.message); }
      return result === undefined ? copy(state) : result;
    }
    function draw(state, id, random, retry) {
      var ws = requireWorkspace(state, id);
      if (retry && !ws.pending) fail("没有待重试的合成");
      if (!retry && ws.pending) fail("请先提交或清除待提交结果");
      var selection = retry ? ws.pending.selection : ws.selection, recipe = selected(ws, selection, state.goals.find(function (g) { return g.id===id; }));
      var outcome = Rules.sample(recipe.preview.outcomes, random);
      ws.pending = { id: retry ? ws.pending.id : uniqueId(state), selection: selection.slice(), inputs: recipe.inputs,
        result: copy(outcome.material), probability: outcome.probability, quality: recipe.preview.quality };
    }
    return {
      snapshot: function () { return copy(read()); },
      inspect: function () { try { return { valid: true, errors: [], state: copy(read()) }; } catch (error) { return { valid: false, errors: [error.message], raw: storage.getItem(KEY), state: null }; } },
      saveGoal: function (value) { return change(function (state) {
        var goal = goalData(value), id = value.id;
        if (id !== undefined) {
          requireWorkspace(state, id);
          var old = state.goals.find(function (g) { return g.id === id; });
          if (["prefix", "dun", "quality"].some(function (key) { return old[key] !== goal[key]; }) || JSON.stringify(old.targetTerms) !== JSON.stringify(goal.targetTerms)) fail("已有目标不可静默更换；请另存新目标");
          state.goals[state.goals.indexOf(old)] = Object.assign(goal, { id: id });
        } else { id = uniqueId(state); state.goals.push(Object.assign(goal, { id: id })); state.workspaces[id] = workspace(); }
        return id;
      }); },
      deleteGoal: function (id) { return change(function (state) { requireWorkspace(state,id); state.goals = state.goals.filter(function (g) { return g.id !== id; }); delete state.workspaces[id]; }); },
      setActual: function (value, amount) { var material = concrete(value); quantity(amount); return change(function (state) { setEntry(state.actual, material, amount); }); },
      copyActual: function (id) { return change(function (state) { var ws=requireWorkspace(state,id); ws.inventory=copy(state.actual); ws.pending=null; ws.selection=[]; }); },
      addVirtual: function (id, value, amount) { var material=concrete(value); quantity(amount); return change(function (state) { var ws=requireWorkspace(state,id), sig=Rules.signature(material), entry=ws.inventory.find(function (x) { return x.signature===sig; }); setEntry(ws.inventory,material,quantity((entry ? entry.quantity : 0)+amount)); ws.pending=null; }); },
      setVirtual: function (id, value, amount) { var material=concrete(value); quantity(amount); return change(function (state) { var ws=requireWorkspace(state,id); setEntry(ws.inventory,material,amount); ws.pending=null; }); },
      setSelection: function (id, values) { return change(function (state) { var ws=requireWorkspace(state,id); var selection=Array.isArray(values) ? values.map(function (value) { return typeof value === "string" ? value : Rules.signature(concrete(value)); }) : values; var recipe=selected(ws,selection,state.goals.find(function (g) { return g.id===id; })); ws.selection=selection.slice(); ws.stage=recipe.materials[0].quality; ws.pending=null; }); },
      setStage: function (id, quality) { return change(function (state) { if (!Rules.qualities.some(function (q) { return q.id===quality; })) fail("品质无效"); var ws=requireWorkspace(state,id); ws.stage=quality; ws.selection=[]; ws.pending=null; }); },
      roll: function (id, random) { return change(function (state) { draw(state,id,random,false); }); },
      retry: function (id, random) { return change(function (state) { draw(state,id,random,true); }); },
      commitPending: function (id, action, token) { return change(function (state) {
        var ws=requireWorkspace(state,id), pending=ws.pending;
        if (!pending || token !== pending.id) fail("待提交事务不存在或已失效");
        if (action !== "next" && action !== "repeat") fail("提交操作必须为next或repeat");
        selected(ws,pending.selection,state.goals.find(function (g) { return g.id===id; }));
        pending.inputs.forEach(function (input) { var entry=ws.inventory.find(function (e) { return e.signature===input.signature; }); setEntry(ws.inventory,entry.material,entry.quantity-input.quantity); });
        var sig=Rules.signature(pending.result), existing=ws.inventory.find(function (e) { return e.signature===sig; });
        setEntry(ws.inventory,pending.result,quantity((existing ? existing.quantity : 0)+1));
        if (action === "next") { ws.stage=pending.quality; ws.selection=[]; }
        ws.pending=null;
      }); },
      clearPending: function (id) { return change(function (state) { requireWorkspace(state,id).pending=null; }); },
      resetSimulation: function (id) { return change(function (state) { requireWorkspace(state,id); state.workspaces[id]=workspace(); }); },
      updateDraft: function (value) { if (!object(value)) fail("草稿格式无效"); return change(function (state) { state.draft=copy(value); }); },
      saveSimple: function (value, expected, accountId) { return change(function (state) {
        var account = typeof storage.currentAccount === "function" ? storage.currentAccount() : null;
        if ((account ? account.id : null) !== accountId) fail("账号已切换，请重新打开铭文分区");
        var current = state.draft.simpleWorkbench;
        if ((current === undefined ? null : JSON.stringify(current)) !== expected) fail("模拟现场已在其他页面更新，请重新打开分区后再操作");
        checkSimple(value);
        // Deliberately retain the old goals, inventory, workspaces and drafts.
        state.draft.simpleWorkbench = copy(value);
      }); }
    };
  }
  function defaultTarget() { return { discipleKey: "", slot: "", dun: "", quality: "o2", attrs: ["", "", ""], xTerm: null }; }
  function blankSimulation() { return { stage: "b2", inputs: [], pending: null }; }
  function targetAfterContextChange(previous, next) {
    var target = copy(next);
    if (["discipleKey", "slot", "dun", "quality"].some(function (key) { return previous[key] !== target[key]; })) {
      var quality = Rules.qualities.find(function (item) { return item.id === target.quality; });
      if (quality) target.attrs = Array(quality.count).fill("");
    }
    return target;
  }
  function context(target) {
    var pair = target.slot.split("|");
    // An unspecified disciple represents any ONE common prefix, never mixed prefixes.
    return { prefix: target.discipleKey ? pair[0] : Rules.prefixes[0], dun: target.discipleKey ? pair[1] : target.dun };
  }
  function xOptions(target) {
    var position=context(target),best=Rules.bestTargets(position.dun,target.quality,target.attrs),wanted=new Set();
    best.targets.forEach(function(terms){terms.forEach(function(term){wanted.add(term.attr+':'+term.tier);});});
    return Rules.termsFor(position.dun,target.quality).filter(function(term){return term.tier!=='?'&&!wanted.has(term.attr+':'+term.tier);});
  }
  function infer(value) {
    var errors = [];
    for (var i = 0; i < 2; i++) {
      var checked = Rules.validate(Object.assign({}, value, { origin: i ? "crafted" : "wash" }));
      if (checked.valid) return checked.material;
      errors = errors.concat(checked.errors);
    }
    fail("此材料不存在合法的洗练或合成来源：" + Array.from(new Set(errors)).join("；"));
  }
  function simulationPreview(value) {
    var sim = value.simulation, recipe = Rules.recipes[sim.stage], position = context(value.target);
    if (!recipe) fail("当前阶段没有后续合成配方");
    if (sim.inputs.length !== recipe.count) fail("请填满本次" + recipe.count + "枚材料");
    var materials = sim.inputs.map(function (terms) {
      return infer({ prefix: position.prefix, dun: position.dun, quality: sim.stage, terms: terms });
    });
    var result = Rules.preview(materials);
    if (!result.valid) fail(result.errors.join("；"));
    return result;
  }
  function checkSimple(value) {
    if (!object(value) || value.version !== 1 || !object(value.target) || !object(value.simulation)) fail("轻量模拟现场格式无效");
    var target = value.target, q = Rules.qualities.find(function (item) { return item.id === target.quality; });
    if (!q || ![target.discipleKey, target.slot, target.dun].every(function (s) { return typeof s === "string" && s.length <= 300; })) fail("目标筛选格式无效");
    if (!Array.isArray(target.attrs) || target.attrs.length !== q.count || target.attrs.some(function (a) { return a !== "" && !Rules.attributes.some(function (x) { return x.id === a; }); })) fail("目标属性数量或名称无效");
    if (target.dun && !Rules.duns.some(function (d) { return d.id === target.dun; })) fail("目标遁位无效");
    if (target.slot && !Rules.prefixes.some(function (prefix) { return Rules.duns.some(function (d) { return target.slot === prefix + "|" + d.id; }); })) fail("弟子铭文位置无效");
    if (target.xTerm != null && (!object(target.xTerm) || !xOptions(target).some(function(term){return term.attr===target.xTerm.attr&&term.tier===target.xTerm.tier;}))) fail("具体杂词 X 不符合当前遁位、品质或目标属性，请重新选择");
    var sim = value.simulation, stage = Rules.qualities.find(function (item) { return item.id === sim.stage; }), recipe = Rules.recipes[sim.stage];
    if (!stage || !Array.isArray(sim.inputs) || sim.inputs.length > (recipe ? recipe.count : 0)) fail("模拟阶段或材料数量无效");
    sim.inputs.forEach(function (terms) {
      if (!Array.isArray(terms) || terms.length !== stage.count || terms.some(function (t) { return t !== null && (!object(t) || !Rules.attributes.some(function (a) { return a.id === t.attr; }) || !["H", "M", "L", "U", "?"].includes(t.tier)); })) fail("材料草稿格式无效");
    });
    if (sim.pending !== null) {
      var pending = sim.pending;
      if (!object(pending) || typeof pending.id !== "string" || !pending.id || !object(pending.material)) fail("模拟结果格式无效");
      var checked = Rules.validate(pending.material), preview = simulationPreview(value);
      var match = checked.valid && preview.outcomes.find(function (o) { return Rules.signature(o.material) === Rules.signature(checked.material); });
      var dun=context(value.target).dun;
      refreshSpeedProbability(pending,match,sim.inputs.map(function(terms){return {quality:sim.stage,dun:dun,terms:terms};}));
      if (!match || pending.material.origin !== "crafted" || pending.probability !== match.probability) fail("模拟结果与本次材料不匹配");
    }
    return value;
  }
  function createWorkbench(storage) {
    var legacy = createStore(storage);
    function inspect() {
      var found = legacy.inspect();
      if (!found.valid) return found;
      try {
        var saved = found.state.draft.simpleWorkbench, value;
        if (saved !== undefined) value = checkSimple(copy(saved));
        else {
          value = { version: 1, target: defaultTarget(), simulation: blankSimulation() };
          var old = found.state.draft["crafting-paths"] || found.state.draft["crafting-simulator"], f = old && old.form;
          if (f && Rules.qualities.some(function (q) { return q.id === f.quality; })) {
            value.target.quality = f.quality;
            var count = Rules.qualities.find(function (q) { return q.id === f.quality; }).count;
            value.target.attrs = Array.from({ length: count }, function (_, i) { return Array.isArray(f.attrs) && Rules.attributes.some(function (a) { return a.id === f.attrs[i]; }) ? f.attrs[i] : ""; });
            value.target.discipleKey = typeof f.discipleKey === "string" ? f.discipleKey : "";
            value.target.dun = Rules.normalizeDun(f.dun) || "";
            if (value.target.discipleKey && Rules.prefixes.includes(f.prefix) && value.target.dun) value.target.slot = f.prefix + "|" + value.target.dun;
          }
        }
        return { valid: true, state: checkSimple(value), token: saved === undefined ? null : JSON.stringify(saved), errors: [] };
      } catch (error) { return { valid: false, state: null, errors: [error.message] }; }
    }
    return {
      inspect: inspect,
      save: function (value, expected, accountId) { legacy.saveSimple(value, expected, accountId); return inspect(); }
    };
  }
  return { KEY: KEY, createStore: createStore, createWorkbench: createWorkbench, blankSimulation: blankSimulation, targetAfterContextChange: targetAfterContextChange, context: context, xOptions: xOptions, infer: infer, preview: simulationPreview };
});
