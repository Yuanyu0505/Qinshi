"use strict";
// Independent, read-only quantity enumeration for the screenshot's 0-rank case.
// No product candidate/frontier/core functions are used by the oracle.
// Usage: node tools/machine-beasts-zero-rank-audit.cjs BACKUP.json REPORT.json
const fs = require('node:fs');
const path = require('node:path');
const DATA = require('../data/machine-beasts.js');
const PLANNER = require('../js/machine-beast-school-planner.js');

function level(beast, research) {
  let result = 0;
  for (let n = 1; n <= beast.maxLevel; n++) if (research >= DATA.researchThresholds[n]) result = n;
  return result;
}
function fraction(value) {
  const [base, exponent = '0'] = String(value).toLowerCase().split('e');
  const [whole, decimal = ''] = base.split('.');
  const scale = decimal.length - Number(exponent);
  return scale >= 0 ? [BigInt(whole + decimal), 10n ** BigInt(scale)] : [BigInt(whole + decimal) * 10n ** BigInt(-scale), 1n];
}
function ceilCost(factors, divisor = 1) {
  let top = 1n, bottom = 1n;
  for (const value of factors) { const [n, d] = fraction(value); top *= n; bottom *= d; }
  const [n, d] = fraction(divisor); top *= d; bottom *= n;
  return Number((top + bottom - 1n) / bottom);
}
function compare(a, b) { for (let n = 0; n < a.length; n++) if (a[n] !== b[n]) return a[n] < b[n] ? -1 : 1; return 0; }

function audit(record) {
  const school = DATA.schools.find(s => s.id === 'nonAttack');
  const settings = record.referenceCost;
  // These explicit guards keep the oracle proof valid and prevent silent defaults.
  if (!settings || settings.bluePurpleInventoryOnly !== true || Number(settings.awakeningBlueprintStock) !== 0 || Number(settings.awakeningBlueprintPrice) !== 70) throw Error('This screenshot oracle requires saved stock-only blue/purple, zero blueprint stock and price 70.');
  const progress = record.beasts || {};
  const beasts = school.beastIds.map(id => DATA.beasts.find(b => b.id === id)).sort((a,b) => a.id.localeCompare(b.id, 'en'));
  const current = beasts.reduce((sum,b) => sum + level(b, Number(progress[b.id]?.research || 0)), 0);
  const target = school.stages.find(s => s.stage === 3).requiredTotalLevel;
  const needed = target - current;
  if (needed <= 0) throw Error('Screenshot audit expects a target not yet reached.');
  const candidateRows = [], input = [];
  for (const beast of beasts) {
    const p = progress[beast.id] || {}, research = Number(p.research || 0), fragments = Number(p.fragments || 0);
    const start = level(beast, research), inventory = p.inventory || {};
    for (const [mod, ranks] of Object.entries(inventory)) for (const [rank, count] of Object.entries(ranks)) {
      if (Number(count) > 0 && (mod !== 'none' || Number(rank) !== 0 || beast.quality === 'orange')) throw Error('This oracle requires only saved blue/purple plain 0-rank stock.');
    }
    const unit = DATA.researchValues[beast.quality][0].none;
    const maxCount = start >= beast.maxLevel ? 0 : Math.ceil((DATA.researchThresholds[beast.maxLevel] - research) / unit);
    const owned = Number(inventory.none?.['0'] || 0);
    const source = beast.quality === 'orange' ? 'new' : 'owned';
    const cap = source === 'new' ? maxCount : Math.min(owned, maxCount);
    const rows = [];
    for (let count = 0; count <= cap; count++) {
      const endResearch = research + unit * count, end = level(beast, endResearch), gain = end - start;
      if (gain > needed) continue;
      const blueprints = count * Math.ceil(unit / DATA.resourceRules.blueprintDivisor);
      const missing = source === 'new' ? Math.max(0, count * beast.fragmentsPerBody - fragments) : 0;
      let bodyYuan = 0;
      if (missing) {
        if (beast.contributionPerFragment !== null) bodyYuan = ceilCost([missing, beast.contributionPerFragment], DATA.referenceCostRules.contributionPerYuan);
        else {
          const price = settings.beastPrices[beast.id];
          if (price == null) throw Error('Missing explicit saved beast price: ' + beast.id);
          bodyYuan = ceilCost([missing, price], beast.fragmentsPerBody);
        }
      }
      rows.push({ beastId: beast.id, name: beast.name, count, source, start, end, researchEach: unit, gain,
        nodes: beast.effects.filter(e => start < e.level && e.level <= end).length,
        bodyYuan, blueprints, yuan: bodyYuan + ceilCost([blueprints, settings.awakeningBlueprintPrice]),
        overflow: count ? endResearch - DATA.researchThresholds[end] : 0 });
    }
    input.push({ beastId: beast.id, name: beast.name, research, currentLevel: start, fragments, ownedPlainZero: owned, participation: 'all (assumption; temporary draft is not backed up)', countChoices: rows.length });
    candidateRows.push(rows);
  }
  // Exhaust all raw per-beast count choices. For each exact (gain,nodes), retain
  // the lexicographically best additive (yuan,overflow,blueprints). This is safe
  // ONLY under the guarded zero-stock / integer-price scenario; future choices
  // are independent and append identical additive terms to states with this key.
  // `ways` also counts ALL count vectors, not only retained optima.
  let states = new Map([['0:0',{ gain:0, nodes:0, yuan:0, overflow:0, blueprints:0, ways:1n, optimalWays:1n, paths:[[]] }]]);
  let transitions = 0;
  for (const rows of candidateRows) {
    const next = new Map();
    for (const previous of states.values()) for (const row of rows) {
      const gain = previous.gain + row.gain;
      if (gain > needed) continue;
      transitions++;
      const candidate = { gain, nodes:previous.nodes+row.nodes, yuan:previous.yuan+row.yuan, overflow:previous.overflow+row.overflow, blueprints:previous.blueprints+row.blueprints,
        ways:previous.ways, optimalWays:previous.optimalWays, paths:previous.paths.map(p => row.count ? p.concat(row) : p) };
      const key = gain+':'+candidate.nodes, old = next.get(key);
      const order = old ? compare([candidate.yuan,candidate.overflow,candidate.blueprints],[old.yuan,old.overflow,old.blueprints]) : -1;
      if (!old) next.set(key,candidate);
      else if (order < 0) { candidate.ways += old.ways; next.set(key,candidate); }
      else {
        old.ways += candidate.ways;
        if (!order) { old.optimalWays += candidate.optimalWays; old.paths = old.paths.concat(candidate.paths).slice(0,5); }
      }
    }
    states = next;
  }
  const exact = [...states.values()].filter(s => s.gain === needed).sort((a,b)=>a.nodes-b.nodes);
  const cost = exact.slice().sort((a,b)=>compare([a.yuan,-a.nodes,a.overflow,a.blueprints],[b.yuan,-b.nodes,b.overflow,b.blueprints]))[0];
  const effects = exact.slice().sort((a,b)=>compare([-a.nodes,a.yuan,a.overflow,a.blueprints],[-b.nodes,b.yuan,b.overflow,b.blueprints]))[0];
  const actual = PLANNER.calculateSchoolPlans(DATA, school.id, progress, {targetStage:3, newRankMode:'zero', useOwnedInventory:true, allowNewHighRanks:false, allowNewModifications:false, referenceCostSettings:settings});
  return { method:'Independent raw quantity enumeration + exact additive DP, without importing CORE or product candidate generation; product planner called only after oracle completion for comparison.',
    assumptions:{ school:'nonAttack', targetStage:3, newRankMode:'zero', useOwnedInventory:true, participating:'all', allowNewHighRanks:false, allowNewModifications:false, temporaryInputCaveat:'Backup stores progress/prices, not unsaved calculator research, participation, owned limits or material switches. Switches inferred from supplied screenshot; all-participant default explicitly assumed.' },
    current, target, needed, input, rawCandidateCount:candidateRows.reduce((n,rows)=>n+rows.length,0), transitions,
    exactQuantityVectors:exact.reduce((n,s)=>n+s.ways,0n), minimumPerNodeCount:exact.map(s=>({nodes:s.nodes,yuan:s.yuan,overflow:s.overflow,blueprints:s.blueprints,quantityVectors:s.ways,optimalVectors:s.optimalWays})),
    independent:{cost,effects}, screenshot:{nodes:6,yuan:647052}, product:actual.valid ? actual.plans.map(p=>({kind:p.kind,totals:p.totals,beasts:p.beasts.map(b=>({beastId:b.beastId,start:b.startLevel,end:b.endLevel,items:b.items}))})) : {errors:actual.errors} };
}

if (require.main === module) {
  const [backupPath, outputPath] = process.argv.slice(2);
  if (!backupPath || !outputPath) throw Error('Usage: node tools/machine-beasts-zero-rank-audit.cjs BACKUP.json REPORT.json');
  const backup = JSON.parse(fs.readFileSync(backupPath,'utf8'));
  const records = Object.entries(backup.data || {}).filter(([key])=>key.includes('qinshi_machine_beasts_progress_v1')).map(([,value])=>typeof value==='string'?JSON.parse(value):value);
  if (records.length !== 1) throw Error('Expected exactly one machine record; do not silently select an account.');
  const report = audit(records[0]);
  fs.mkdirSync(path.dirname(path.resolve(outputPath)),{recursive:true});
  fs.writeFileSync(outputPath,JSON.stringify(report,(_,v)=>typeof v==='bigint'?v.toString():v,2)+'\n');
  console.log(JSON.stringify({current:report.current,target:report.target,needed:report.needed,rawCandidates:report.rawCandidateCount,transitions:report.transitions,exactVectors:String(report.exactQuantityVectors),nodeMinima:report.minimumPerNodeCount.map(r=>({nodes:r.nodes,yuan:r.yuan})),effectsExamples:report.independent.effects?.paths.map(p=>p.map(r=>({name:r.name,start:r.start,end:r.end,count:r.count,source:r.source}))),product:report.product.map?.(p=>({kind:p.kind,yuan:p.totals.pricedYuan,nodes:p.totals.unlockedEffects})),reportPath:outputPath}));
}
module.exports = {audit};
