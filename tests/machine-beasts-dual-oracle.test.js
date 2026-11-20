'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const CORE=require('../js/machine-beasts.js');
const SCHOOL=require('../js/machine-beast-school-planner.js');
const DATA=require('../data/machine-beasts.js');

// Independent specification oracle: no domain, allocation, fee, research or
// level helper from production is used to calculate an expected result. It
// enumerates each physical origin's three exclusive fates, then every final
// processed multiset. There is no DP, dominance pruning or mirrored frontier.
const NEED={none:0,initial:40,heaven:55,immortal:75,saint:105,fullDivine:145};
const weight=rank=>rank<=7?1:2**(rank-7);
const cmp=(a,b)=>{for(let i=0;i<a.length;i++)if(a[i]!==b[i])return a[i]<b[i]?-1:1;return 0;};
function fixture(count=1,maxRank=1,target=2){
  const prototype=DATA.beasts.find(b=>b.id==='red-serpent');
  const beasts=Array.from({length:count},(_,i)=>({...prototype,id:'dual-'+i,name:'Dual '+i,maxRank,maxLevel:3,
    fragmentsPerBody:2,contributionPerFragment:3,effects:[{level:1,text:'one'},{level:3,text:'three'}]}));
  const rows={};
  for(let rank=0;rank<=maxRank;rank++)rows[rank]=Object.fromEntries(Object.keys(NEED).map((id,m)=>[id,2+rank+m*2]));
  return {...DATA,beasts,modifications:DATA.modifications.map(m=>({...m})),researchValues:{orange:rows},
    researchThresholds:{0:0,1:5,2:9,3:14},resourceRules:{blueprintDivisor:3,organPieceDivisor:2},
    referenceCostRules:{blueprintPrice:7,orangeFiveBodyPrice:45,contributionPerYuan:3},
    schools:[{id:'dual',name:'Dual',beastIds:beasts.map(b=>b.id),stages:[{stage:1,requiredTotalLevel:target}]}]};
}
function level(d,b,research){let n=0;for(let i=1;i<=b.maxLevel;i++)if(research>=d.researchThresholds[i])n=i;return n;}
function enumerate(d,b,p={},o={}){
  const stock=[],limits=o.ownedLimits||{};
  for(const [mod,ranks]of Object.entries(p.inventory||{}))for(const [rankText,n]of Object.entries(ranks)){
    const rank=+rankText,cap=o.useOwnedInventory===false?0:Math.min(n,limits[mod]?.[rankText]??n);
    for(let i=0;i<cap;i++)stock.push({rank,mod,research:d.researchValues.orange[rank][mod]});
  }
  const totalStock=stock.reduce((s,i)=>s+weight(i.rank),0),start=p.research||0,startLevel=level(d,b,start);
  const gap=d.researchThresholds[b.maxLevel]-start,results=[];
  const maxOwned=o.allowNewHighRanks?b.maxRank:Math.min(7,b.maxRank);
  const maxNew=o.newRankMode==='zero'?0:o.allowNewHighRanks?b.maxRank:Math.min(7,b.maxRank);
  const types=[];
  for(let rank=0;rank<=maxOwned;rank++)for(const mod of Object.keys(NEED)){
    const research=d.researchValues.orange[rank][mod];if(research>0)types.push({rank,mod,research});
  }
  const maxResearch=Math.max(...types.map(t=>t.research),...stock.map(t=>t.research));
  const bound=Math.max(0,gap)+maxResearch;
  const loose=o.useOwnedInventory===false?0:o.ownedLooseCores||0;
  function fates(at,direct,dismantled,returned){
    if(at<stock.length){
      const item=stock[at];
      fates(at+1,direct,dismantled,returned); // keep
      fates(at+1,direct.concat(item),dismantled,returned); // direct
      fates(at+1,direct,dismantled.concat(Array(weight(item.rank)).fill(Math.min(7,item.rank))),returned+NEED[item.mod]); // dismantle
      return;
    }
    const r0=direct.reduce((s,i)=>s+i.research,0),n0=direct.reduce((s,i)=>s+weight(i.rank),0);
    const b0=direct.reduce((s,i)=>s+Math.ceil(i.research/3),0),p0=direct.reduce((s,i)=>s+Math.ceil(i.research/2),0);
    const m0=direct.reduce((s,i)=>s+(i.mod==='none'?0:weight(i.rank)),0);
    function products(index,research,invested,blueprints,pieces,modified,spent,ownedOnly,largest,rankDemand){
      if(research>=bound)return;
      if(!o.allowNewModifications&&spent>returned+loose)return;
      if(index<types.length){
        const t=types[index],w=weight(t.rank);
        const cap=Math.floor((bound-1-research)/t.research);
        for(let q=0;q<=cap;q++)products(index+1,research+q*t.research,invested+q*w,
          blueprints+q*Math.ceil(t.research/3),pieces+q*Math.ceil(t.research/2),
          modified+(t.mod==='none'?0:q*w),spent+q*NEED[t.mod],ownedOnly+(t.rank>maxNew?q*w:0),q?Math.max(largest,t.research):largest,
          o.newRankMode==='zero'&&t.rank>0?rankDemand.concat(Array(q*w).fill(Math.min(7,t.rank))):rankDemand);
        return;
      }
      const processed=invested-n0,added=Math.max(0,invested-totalStock),ownedUsed=processed-added;
      if(ownedUsed<0||ownedUsed>dismantled.length||ownedOnly>ownedUsed)return;
      if(rankDemand.length){
        const supply=dismantled.slice().sort((a,b)=>b-a),demand=rankDemand.slice().sort((a,b)=>b-a);
        if(demand.some((rank,index)=>!(supply[index]>=rank)))return;
      }
      // Extra last-level research from an individually removable input is
      // never optimal under either formal objective, and is not a candidate.
      if(research>=gap&&research-largest>=gap)return;
      const end=level(d,b,start+research);
      if(research&&end===startLevel)return;
      const fragments=Math.max(0,added*2-(p.fragments||0));
      results.push({level:end,addedLevel:end-startLevel,effects:b.effects.filter(e=>startLevel<e.level&&e.level<=end).length,
        research,invested,added,blueprints,pieces,modified,bodyYuan:fragments,
        overflow:research?start+research-d.researchThresholds[end]:0,returned,spent});
    }
    products(0,r0,n0,b0,p0,m0,0,0,Math.max(0,...direct.map(i=>i.research)),[]);
  }
  fates(0,[],[],0);
  return [...new Map(results.map(r=>[JSON.stringify([r.level,r.effects,r.research,r.invested,r.added,r.blueprints,r.pieces,r.modified,r.bodyYuan,r.overflow]),r])).values()];
}
const singleTuple=(r,gap)=>[r.added,r.invested,r.research-gap,r.blueprints,r.pieces];
const actualSingle=t=>[t.newInvestedCount,t.investedCount,t.overflow,t.awakeningBlueprints,t.organPieces];
function audit(p,o,items,unused,conversion,ledger,added,label){
  if(!ledger)return;
  const inventory=p.inventory||{},limits=o.ownedLimits||{},taken=new Map();
  for(const i of items.filter(i=>i.source==='owned'&&!i.converted)){
    const key=i.modificationId+'/'+i.rank;taken.set(key,(taken.get(key)||0)+i.count);
  }
  let returned=0;
  for(const s of conversion.sources){
    const key=s.modificationId+'/'+s.rank;taken.set(key,(taken.get(key)||0)+s.count);
    returned+=s.count*NEED[s.modificationId];
  }
  for(const [key,count]of taken){
    const [mod,rank]=key.split('/'),recorded=inventory[mod]?.[rank]||0;
    const cap=o.useOwnedInventory===false?0:Math.min(recorded,limits[mod]?.[rank]??recorded);
    assert.ok(count<=cap,label+': one origin cannot be both direct and dismantled');
  }
  const spent=items.filter(i=>i.converted||i.source!=='owned').reduce((n,i)=>n+i.count*NEED[i.modificationId],0);
  const loose=o.useOwnedInventory===false?0:o.ownedLooseCores||0;
  assert.deepEqual([ledger.returned,ledger.spent,ledger.externalDeficit,ledger.remaining],
    [returned,spent,Math.max(0,spent-returned-loose),Math.max(0,returned+loose-spent)],label+': independent physical-unit ledger');
  if(!o.allowNewModifications)assert.equal(ledger.externalDeficit,0,label+': external cores need explicit permission');
  const original=Object.values(inventory).reduce((n,ranks)=>n+Object.entries(ranks).reduce((s,[r,c])=>s+weight(+r)*c,0),0);
  assert.equal(items.reduce((n,i)=>n+i.count*weight(i.rank),0)+unused.reduce((n,i)=>n+i.count*weight(i.rank),0),original+added,label+': complete body conservation including excluded stock');
}
function checkSingle(d,p,o,label){
  const b=d.beasts[0],gap=d.researchThresholds[o.targetLevel||2]-(p.research||0);
  const rows=enumerate(d,b,p,o).filter(r=>r.research>=gap);
  rows.sort((a,b)=>cmp(singleTuple(a,gap),singleTuple(b,gap)));
  const input=JSON.stringify(p),actual=CORE.calculateInvestmentPlan(d,b,p,{convertOwnedInventory:true,targetLevel:2,...o});
  assert.equal(JSON.stringify(p),input,label+': input must remain read-only');
  assert.equal(actual.valid,rows.length>0,label+': feasibility '+JSON.stringify(actual.errors));
  if(rows.length){
    assert.deepEqual(actualSingle(actual.totals),singleTuple(rows[0],gap),label);
    audit(p,o,actual.selected.ownedItems.concat(actual.selected.newItems),actual.unused,actual.inventoryConversion,actual.modificationCores,actual.totals.newInvestedCount,label);
  }
  return actual;
}
const schoolTuple=(r,mode)=>[r.modified,...(mode==='cost'?[r.yuan,-r.effects]:[-r.effects,r.yuan]),r.overflow,r.blueprints];
function bruteSchool(d,progress,o){
  const settings=o.referenceCostSettings||{},target=d.schools[0].stages[0].requiredTotalLevel;
  const sets=d.beasts.map(b=>enumerate(d,b,progress[b.id],{...o,ownedLimits:o.ownedLimitsByBeast?.[b.id]}));
  const best={cost:null,effects:null};
  function visit(at,s){
    if(at<sets.length){for(const r of sets[at])visit(at+1,{level:s.level+r.level,modified:s.modified+r.modified,
      effects:s.effects+r.effects,blueprints:s.blueprints+r.blueprints,body:s.body+r.bodyYuan,overflow:s.overflow+r.overflow});return;}
    if(s.level!==target)return;
    const missing=Math.max(0,s.blueprints-(settings.awakeningBlueprintStock||0));
    const price=settings.awakeningBlueprintPrice??7;
    // All decimal-price cases below use exactly 1.1, evaluated as a rational.
    const yuan=s.body+(price===1.1?Math.ceil(missing*11/10):Math.ceil(missing*price));
    for(const mode of ['cost','effects']){const tuple=schoolTuple({...s,yuan},mode);if(!best[mode]||cmp(tuple,best[mode])<0)best[mode]=tuple;}
  }
  visit(0,{level:0,modified:0,effects:0,blueprints:0,body:0,overflow:0});return best;
}
function checkSchool(d,p,o,label){
  const expected=bruteSchool(d,p,o),before=JSON.stringify(p);
  const actual=SCHOOL.calculateSchoolPlans(d,'dual',p,{convertOwnedInventory:true,targetStage:1,...o});
  assert.equal(JSON.stringify(p),before,label+': no inventory mutation');
  assert.equal(actual.valid,expected.cost!==null,label+': feasibility '+JSON.stringify(actual.errors));
  if(actual.valid)for(const mode of ['cost','effects']){
    const plan=actual.plans.find(p=>p.kind===mode||p.kind==='merged');assert.ok(plan,label+': '+mode);
    const t=plan.totals;
    assert.deepEqual(schoolTuple({modified:t.modifiedInvestedCount,yuan:t.pricedYuan,effects:t.unlockedEffects,overflow:t.overflowResearch,blueprints:t.awakeningBlueprints},mode),expected[mode],label+': '+mode);
  }
  return actual;
}

test('independent three-fate oracle catches stage-token reuse, premature refunds and new/owned rank-domain coupling',()=>{
  const d=fixture();let cases=0;
  const stocks=[{}, {none:{0:1}}, {initial:{0:1}}, {heaven:{1:1}}, {fullDivine:{0:1}}, {initial:{0:1},heaven:{1:1}}];
  for(const inventory of stocks)for(const newRankMode of ['zero','zeroToSeven'])for(const allowNewModifications of [false,true])for(const loose of [undefined,40,55]){
    const o={newRankMode,allowNewModifications};if(loose!==undefined)o.ownedLooseCores=loose;
    checkSingle(d,{inventory,showMods:true,showHighRanks:true},o,'single '+JSON.stringify({inventory,...o}));cases++;
  }
  assert.equal(cases,72);
});

test('source caps, disabled stock and mixed 55+40 refunds agree with independent fates',()=>{
  const d=fixture(),p={inventory:{heaven:{0:1},initial:{1:1}},showMods:true};
  for(const o of [{},{ownedLimits:{heaven:{0:0}}},{ownedLimits:{initial:{1:0},heaven:{0:0}}},{useOwnedInventory:false}])
    checkSingle(d,p,{newRankMode:'zero',...o},'caps '+JSON.stringify(o));
});

test('school cost and effects preserve modified-first exact lexicographic minima without pooling names',()=>{
  const d=fixture(2);let cases=0;
  for(const inventory of [{},{fullDivine:{0:1}},{initial:{0:1},heaven:{1:1}}])for(const mode of ['zero','zeroToSeven'])for(const mods of [false,true])for(const stock of [0,4]){
    const p={'dual-0':{inventory,showMods:true},'dual-1':{inventory:{none:{0:1}},showMods:true,fragments:1}};
    checkSchool(d,p,{newRankMode:mode,allowNewModifications:mods,referenceCostSettings:{awakeningBlueprintStock:stock,awakeningBlueprintPrice:1.1}},'school '+JSON.stringify({inventory,mode,mods,stock}));cases++;
  }
  assert.equal(cases,24);
});

test('independent varied research tables retain exact modified-only levels and resource-feasible minima',()=>{
  let seed=1145;
  const random=n=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n;};
  for(let sample=0;sample<48;sample++){
    const d=fixture(2,1,1+random(5));
    for(const row of Object.values(d.researchValues.orange))for(const mod of Object.keys(NEED))row[mod]=3+random(11);
    const mods=Object.keys(NEED),m=mods[1+random(5)];
    const p={'dual-0':{inventory:{[m]:{[random(2)]:1}},showMods:true},'dual-1':{inventory:{none:{0:random(2)}},showMods:true}};
    const o={newRankMode:random(2)?'zero':'zeroToSeven',allowNewModifications:!!random(2),ownedLooseCores:random(2)?0:40,
      referenceCostSettings:{awakeningBlueprintPrice:1.1,awakeningBlueprintStock:random(6)}};
    checkSingle(d,p['dual-0'],o,'varied single '+sample);
    checkSchool(d,p,o,'varied school '+sample+' '+JSON.stringify({values:d.researchValues,p,o}));
  }
});

test('a donor name cannot fund another name when only the second beast can hit the exact level',()=>{
  const d=fixture(2,1,1);d.researchThresholds={0:0,1:5,2:6,3:14};
  for(const row of Object.values(d.researchValues.orange))Object.assign(row,{none:7,initial:5,heaven:9,immortal:10,saint:11,fullDivine:12});
  // First beast is already maxed and cannot contribute. Its 145 attached
  // cores must not make an initial-modification exact level feasible on B.
  const p={'dual-0':{research:14,inventory:{fullDivine:{0:1}},showMods:true},'dual-1':{inventory:{none:{0:1}},showMods:true}};
  d.schools[0].stages[0].requiredTotalLevel=4;
  const denied=SCHOOL.calculateSchoolPlans(d,'dual',p,{convertOwnedInventory:true,targetStage:1,newRankMode:'zero',allowNewModifications:false});
  assert.equal(denied.valid,false);
  const allowed=SCHOOL.calculateSchoolPlans(d,'dual',p,{convertOwnedInventory:true,targetStage:1,newRankMode:'zero',allowNewModifications:true});
  assert.equal(allowed.valid,true,JSON.stringify(allowed.errors));
  const second=allowed.plans[0].beasts.find(b=>b.beastId==='dual-1');
  assert.equal(second.modificationCores.returned,0);assert.equal(second.modificationCores.spent,40);
  assert.equal(second.modificationCores.externalDeficit,40);
});

test('processed high-rank cores cost per physical unit, not weighted base bodies',()=>{
  const d=fixture(1,10);d.researchThresholds={0:0,1:14,2:28,3:42};
  // A high-rank modified final unit is indispensable: multiplying its 40
  // cores by its eight-body weight would incorrectly reject the optimum.
  for(const row of Object.values(d.researchValues.orange))for(const mod of Object.keys(NEED))row[mod]=0;
  d.researchValues.orange[0].none=1;
  d.researchValues.orange[10].initial=28;
  d.researchValues.orange[10].fullDivine=1;
  const p={inventory:{fullDivine:{10:1}},showMods:true,showHighRanks:true};
  const plan=checkSingle(d,p,{newRankMode:'zeroToSeven',allowNewHighRanks:true,allowNewModifications:false},'physical core charging');
  assert.deepEqual(actualSingle(plan.totals),[0,8,0,10,14]);
  assert.deepEqual([plan.modificationCores.returned,plan.modificationCores.spent,plan.modificationCores.remaining],[145,40,105]);
});

test('zero-material mode prevents unverified processing while preserving high-rank stock direct use',()=>{
  const d=fixture(1,7);
  for(const row of Object.values(d.researchValues.orange))for(const mod of Object.keys(NEED))row[mod]=0;
  d.researchValues.orange[0].none=2;d.researchValues.orange[7].none=9;
  const owned=checkSingle(d,{inventory:{none:{0:1}}},{newRankMode:'zero'},'zero stock cannot upgrade');
  assert.deepEqual(actualSingle(owned.totals),[4,5,1,5,5]);
  const rankSeven=checkSingle(d,{inventory:{none:{7:1}}},{newRankMode:'zero'},'original rank seven');
  assert.deepEqual(actualSingle(rankSeven.totals),[0,1,0,3,5]);
  const bought=checkSingle(d,{},{newRankMode:'zero'},'new zero only');
  assert.deepEqual(actualSingle(bought.totals),[5,5,1,5,5]);
  const expanded=checkSingle(d,{},{newRankMode:'zeroToSeven'},'new full domain');
  assert.deepEqual(actualSingle(expanded.totals),[1,1,0,3,5]);
});

test('conversion equivalents enumerate distinct final shapes once across JSON round-trip and small pages',()=>{
  const d=fixture(2,1,1);d.beasts.forEach(b=>{b.maxLevel=1;b.effects=[{level:1,text:'one'}];});
  d.researchThresholds={0:0,1:2};
  for(const row of Object.values(d.researchValues.orange))row.none=2;
  const p=Object.fromEntries(d.beasts.map(b=>[b.id,{inventory:{none:{0:1}},showMods:true}]));
  const result=checkSchool(d,p,{newRankMode:'zeroToSeven'},'equivalents');
  const primary=JSON.parse(JSON.stringify(result.plans[0]));
  // Hand enumeration: choose one of two names and one of two ranks; stock
  // pays for the whole unit, so no source or dismantling-order duplicates.
  assert.equal(primary.equivalents.count,'4');
  let offset='0';const alternatives=[];
  for(let pages=0;pages<8;pages++){
    const page=SCHOOL.equivalentPlansPage(d,primary,offset,1);alternatives.push(...page.plans);
    if(!page.hasMore)break;
    assert.notEqual(page.nextOffset,offset);offset=page.nextOffset;
  }
  const plans=[primary,...alternatives];assert.equal(plans.length,4);
  assert.deepEqual(new Set(plans.map(p=>p.beasts.map(b=>b.beastId+':'+b.items.map(i=>i.rank+':'+i.modificationId+':'+i.count).join(',')).join('|'))),
    new Set(['dual-0:0:none:1','dual-0:1:none:1','dual-1:0:none:1','dual-1:1:none:1']));
});

test('equivalent pages exclude unfunded higher modifications while preserving direct and reprocessed forms',()=>{
  const d=fixture(1,1,1);d.beasts[0].maxLevel=2;d.researchThresholds={0:0,1:5,2:6};
  for(const row of Object.values(d.researchValues.orange))Object.assign(row,{none:7,initial:5,heaven:5,immortal:0,saint:0,fullDivine:0});
  const p={'dual-0':{inventory:{initial:{0:1}},showMods:true}};
  for(const external of [false,true]){
    const result=checkSchool(d,p,{newRankMode:'zeroToSeven',allowNewModifications:external},'funded equivalents '+external);
    const plan=JSON.parse(JSON.stringify(result.plans[0]));
    assert.equal(plan.equivalents.count,external?'4':'2');
    let offset='0';const all=[plan];
    for(let pages=0;pages<8;pages++){
      const page=SCHOOL.equivalentPlansPage(d,plan,offset,1);all.push(...page.plans);
      if(!page.hasMore)break;offset=page.nextOffset;
    }
    assert.equal(all.length,external?4:2);
    const final=new Set(all.map(p=>p.beasts[0].items.map(i=>i.rank+':'+i.modificationId+':'+i.count).join(',')));
    assert.deepEqual(final,new Set(external?['0:initial:1','1:initial:1','0:heaven:1','1:heaven:1']:['0:initial:1','1:initial:1']));
    for(const alternative of all){
      const ledger=alternative.beasts[0].modificationCores;
      assert.ok(ledger.externalDeficit===(alternative.beasts[0].items[0].modificationId==='heaven'?15:0));
    }
  }
});

test('zero-mode equivalent paging excludes equal-price allocations exceeding a rank threshold',()=>{
  const d=fixture(1,7,1),b=d.beasts[0];
  b.maxLevel=1;
  d.researchThresholds={0:0,1:8};
  d.researchValues.orange={0:{none:2},4:{none:6},5:{none:4},6:{none:4},7:{none:6}};
  d.resourceRules.blueprintDivisor=2;
  const result=SCHOOL.calculateSchoolPlans(d,'dual',{[b.id]:{inventory:{none:{7:1,0:1}}}},
    {targetStage:1,newRankMode:'zero',convertOwnedInventory:true});
  assert.equal(result.valid,true,JSON.stringify(result.errors));
  const primary=JSON.parse(JSON.stringify(result.plans[0]));
  assert.equal(primary.equivalents.count,'2');
  const page=SCHOOL.equivalentPlansPage(d,primary,'0',1);
  assert.equal(page.plans.length,1);
  assert.equal(page.hasMore,false);
  assert.deepEqual([primary,...page.plans].map(p=>p.beasts[0].items.map(i=>i.rank).sort((a,b)=>a-b)).sort(),
    [[0,4],[0,7]]);
});
