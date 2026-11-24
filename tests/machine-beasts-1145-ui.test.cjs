'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const context = { document: { addEventListener() {} } };
context.window = context;
vm.createContext(context);
for (const file of ['data/machine-beasts.js', 'js/machine-beasts.js', 'js/number-format.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context);
}
const source = fs.readFileSync(path.join(root, 'js/machine-beasts-ui.js'), 'utf8');
vm.runInContext(source.replace('window.MACHINE_BEAST_UI = {',
  'window.testUI = { calcTargetOptions, calcTargetPicker, calculatorInventorySelector, calculatorFragmentControl, calculationProgress, conversionSummary, investmentLists, itemList, researchReference, formatNumber, newRankModeSelector, rankMaterialsNote, planBeastOrder, investmentInventoryLimits, schoolCombination }; window.MACHINE_BEAST_UI = {'), context);
const ui = context.window.testUI;

test('UI number formatting preserves BigInt precision and uses four-digit groups', () => {
  assert.equal(ui.formatNumber(123456789), '1,2345,6789');
  assert.equal(ui.formatNumber(123456789123456789123456789n), '123,4567,8912,3456,7891,2345,6789');
});

test('target options retain values and selection without research labels', () => {
  assert.equal(ui.calcTargetOptions({ maxLevel: 3 }, 2, 1), '<option value="1">1级</option><option value="2" selected>2级</option><option value="3">3级</option>');
});

test('target picker limits visible rows without removing later levels', () => {
  const html = ui.calcTargetPicker({ maxLevel: 25 }, 25, 0);
  assert.match(html, /size="10"/);
  assert.match(html, /value="25" selected>25级/);
  assert.equal((html.match(/<option /g) || []).length, 25);
  assert.match(ui.calcTargetPicker({ maxLevel: 3 }, 2, 1), /size="3"/);
});

test('inventory row keeps usage cap and disabled state together', () => {
  const html = ui.calculatorInventorySelector({ id: 'war-demon' }, { inventory: { none: { 7: 3 } } }, { useOwnedInventory: false, limits: { none: { 7: 2 } } }, 'single', true);
  assert.match(html, /max="3" step="1" value="2"/);
  assert.match(html, /data-machine-owned-limit[^>]+ disabled/);
  assert.match(html, /class="machine-owned-quantity"/);
  assert.match(html, /class="machine-owned-stock"/);
});

test('fragment inputs appear only after opting in and keep the draft quantity', () => {
  for (const beastId of [undefined, 'war-demon']) {
    const off = ui.calculatorFragmentControl(37, false, beastId);
    assert.doesNotMatch(off, /checked|type="number"/);
    const on = ui.calculatorFragmentControl(37, true, beastId);
    assert.match(on, /checked[\s\S]*?type="number"[^>]+value="37"/);
  }
  const draft = Object.freeze({ fragments:37, research:2024, inventory:{} });
  assert.equal(ui.calculationProgress(draft, false).fragments, 0);
  assert.equal(ui.calculationProgress(draft, true).fragments, 37);
  assert.equal(ui.calculationProgress(draft, false).research, 2024);
  assert.equal(draft.fragments, 37);
});

test('plan rendering sorts by quality, rank and modification, without changing input order', () => {
  const item = (rank, modificationId = 'none') => ({rank,modificationId,count:1,source:'owned',researchEach:48000});
  const row = (beastId, items) => ({beastId,beastName:beastId,items,startLevel:0,endLevel:1,resources:{}});
  const stock = [row('war-demon',[item(10,'fullDivine')]), row('mechanical-bear',[item(7)]),
    row('potu-qilang',[item(2)]), row('mechanical-yueliao',[item(0,'fullDivine'), item(7,'heaven')]),
    row('mechanical-flame-puppet',[item(6,'fullDivine')]), row('eight-claw-centipede',[item(0)])];
  const expected = ['mechanical-yueliao','mechanical-bear','mechanical-flame-puppet','war-demon','eight-claw-centipede','potu-qilang'];
  assert.deepEqual(Array.from(ui.planBeastOrder(stock), x=>x.beastId),expected);
  assert.equal(stock[0].beastId,'war-demon');
  assert.equal(stock[3].items[0].rank,0);
  const list = ui.itemList([item(6,'fullDivine'),item(7),item(7,'heaven'),item(0)],'','owned');
  assert.match(list,/（天改）7阶×1[\s\S]*?（0改）7阶×1[\s\S]*?（神改）6阶×1[\s\S]*?（0改）0阶×1/);
  const alternativeHtml = ui.schoolCombination({beasts:stock,totals:{},stableKey:'k'}, 'school', 2, 'materials');
  assert.match(alternativeHtml, /<details[^>]+><summary>组合2 ：<span[^>]+>mechanical-yueliao1级<\/span>、<span[^>]+>mechanical-bear1级<\/span>/);
  assert.doesNotMatch(alternativeHtml, /<details[^>]+\sopen[\s>]/);
  assert.deepEqual(Array.from(alternativeHtml.matchAll(/<article class="machine-school-plan-beast"><header><strong>([^<]+)<\/strong>/g), match=>match[1]),expected);
});

test('zero mode states the material verification boundary and lists only real rank processing paths', () => {
  assert.match(ui.newRankModeSelector('single','zero'),/不额外投入升阶材料[\s\S]*直投、降阶或拆解[\s\S]*返料升阶待核实/);
  assert.match(ui.newRankModeSelector('single','zeroToSeven'),/可新增0–7阶[\s\S]*自由升降/);
  assert.match(ui.rankMaterialsNote(true),/材料可行性无法确认[\s\S]*仅比较无需库存升阶的方案/);
  assert.equal(ui.rankMaterialsNote(false),'');
  const flow = ui.conversionSummary({sources:[{rank:9, modificationId:'fullDivine', count:1, baseBodies:4, bodyTargets:[{rank:5,bodies:1},{rank:7,bodies:1}], remainingBaseBodies:2}]},null,'test');
  assert.match(flow, /（神改）9阶×1 → （0改）7阶×4 → （0改）7阶×1、（0改）5阶×1、剩余（0改）7阶×2/);
  assert.doesNotMatch(flow,/加工前|加工投入|升阶材料返还|NaN|undefined/);
  const caps = ui.investmentInventoryLimits('test',{id:'war-demon'},{inventory:{none:{7:4},initial:{7:1}}},{limits:{none:{7:2}}},true);
  assert.match(caps,/（升神）7阶：库存 1只／最多使用 1只[\s\S]*?（0改）7阶：库存 4只／最多使用 2只/);
  const disabled = ui.investmentInventoryLimits('test',{id:'war-demon'},{inventory:{none:{7:4}}},{limits:{}},false);
  assert.match(disabled,/（0改）7阶：库存 4只／最多使用 0只/);
});

test('8–10 inventory splits show the complete rank-7 yield once when directly invested', () => {
  for (const [rank, count] of [[8, 2], [9, 4], [10, 8]]) {
    const flow = ui.conversionSummary({sources:[{rank, modificationId:'none', count:1, baseBodies:count, bodyTargets:[{rank:7, modificationId:'none', bodies:count}], remainingBaseBodies:0}]},null,'test');
    assert.ok(flow.includes('<li>（0改）' + rank + '阶×1 → （0改）7阶×' + count + '</li>'));
  }
});

test('conversion disclosure shows original source and separate unpriced core deficit', () => {
  const html = ui.conversionSummary({ sources: [{ rank: 10, modificationId: 'fullDivine', count: 1, baseBodies: 8, usedBaseBodies:4, remainingBaseBodies:4, returnedCores: 145 }], usedBaseBodies: 4, remainingBaseBodies: 4 }, { returned: 145, spent: 160, reused: 145, externalDeficit: 15, remaining: 0, looseOwned: 0, estimatedBoxes: 75, unpriced: true }, 'test');
  assert.match(html, /<details/);
  for (const text of ['库存转换与改造神核', '返还', '145', '分配', '160', '缺口', '15', '剩余', '约75箱', '非保底', '改造神核未计价']) assert.ok(html.includes(text), text);
  assert.doesNotMatch(html, /NaN|undefined|神核[^<]*元宝/);
});

test('loose cores remain visible without converted bodies', () => {
  const html = ui.conversionSummary(null, { returned: 0, spent: 40, reused: 40, externalDeficit: 0, remaining: 5, looseOwned: 45, estimatedBoxes: 0, unpriced: false }, 'loose');
  assert.match(html.replace(/<[^>]*>/g, ''), /已有散装神核45/);
  assert.doesNotMatch(html, /改造神核未计价/);
});

test('Yueliao single plan groups final forms and shows actual conversion endpoints', () => {
  const d=context.MACHINE_BEAST_DATA, c=context.MACHINE_BEAST_CORE;
  const beast=d.beasts.find(b=>b.id==='mechanical-yueliao');
  const result=c.calculateInvestmentPlan(d,beast,{inventory:{none:{2:1,3:1,4:1,5:1,6:1,7:1}}},{targetLevel:25,newRankMode:'zeroToSeven',convertOwnedInventory:true});
  assert.equal(result.totals.newInvestedCount,10);
  assert.equal(result.totals.overflow,380);
  assert.equal(result.totals.awakeningBlueprints,2281);
  const items=result.selected.ownedItems;
  const list=ui.itemList(items,'','owned');
  assert.match(list,/7阶×3/);
  assert.match(list,/6阶×1/);
  assert.match(list,/0阶×2/);
  assert.equal((list.match(/7阶×/g)||[]).length,1);
  const conversion=ui.conversionSummary(result.inventoryConversion,result.modificationCores,'sample');
  for(const [from,to] of [[5,7],[4,7],[3,0],[2,0]]) assert.ok(conversion.includes('（0改）' + from + '阶×1 → （0改）' + to + '阶×1'));
  assert.doesNotMatch(conversion,/加工前|加工投入|返还神核|machine-core-ledger|0阶×2|6阶×1 →/);
});

test('new investment combines equal output shapes without hiding mixed body sources', () => {
  const form={source:'new',rank:8,modificationId:'none',researchEach:150504,sevenRankEquivalent:2};
  const list=ui.itemList([{...form,count:1,converted:true,ownedBaseBodies:1,newBaseBodies:1},{...form,count:2}],'',true);
  assert.match(list,/8阶×3/);
  assert.match(list,/其中1只混合投入：库存1＋新增1/);
  assert.equal((list.match(/<li>/g)||[]).length,1);
  assert.match(ui.investmentLists([],[{...form,count:1,ownedBaseBodies:1,newBaseBodies:1}],null,false),/库存本体用于混合投入/);
  assert.match(ui.investmentLists([],[],{sources:[{returnedCores:40}]},true),/库存仅用于返还神核/);
});

test('research reference estimates boxes from each stage without changing core requirements', () => {
  const html = ui.researchReference();
  const table = html.match(/<table>[\s\S]*?<\/table>/)[0];
  assert.deepEqual(Array.from(table.matchAll(/<tr><th scope="row">([^<]+)<\/th><td>(\d+)<\/td><td>(\d+)<\/td><td[^>]*>(\d+)<\/td><\/tr>/g), match => match.slice(1)), [
    ['升神', '40', '40', '200'], ['天改', '15', '55', '75'], ['仙改', '20', '75', '100'], ['圣改', '30', '105', '150'], ['神改', '40', '145', '200']
  ]);
  for (const text of ['改造阶段', '本阶段所需神核', '所需神核箱子预估（按10出2计算）']) assert.ok(table.includes(text), text);
});
