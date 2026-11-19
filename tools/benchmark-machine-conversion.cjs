'use strict';
// Isolated diagnostics only; hooks are injected in a VM, never product source.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {spawnSync,execFileSync}=require('node:child_process');
const {performance}=require('node:perf_hooks');
const root=path.resolve(__dirname,'..');
const revision=process.argv.includes('--revision')?process.argv[process.argv.indexOf('--revision')+1]:null;
const native=process.argv.includes('--native');
const cases=[
  {id:'zero-plain',mode:'zero',mods:false,mixed:false},
  {id:'zero-seven-plain',mode:'zeroToSeven',mods:false,mixed:false},
  {id:'zero-mods',mode:'zero',mods:true,mixed:false},
  {id:'zero-seven-mods',mode:'zeroToSeven',mods:true,mixed:false},
  {id:'mixed-high-plain',mode:'zeroToSeven',mods:false,mixed:true},
  {id:'mixed-high-mods',mode:'zeroToSeven',mods:true,mixed:true},
  {id:'reported-four-modifications',mode:'zeroToSeven',mods:true,mixed:false,reported:true}
];
if(process.argv[2]==='--case'){
  const spec=cases.find(c=>c.id===process.argv[3]);if(!spec)throw Error('Unknown case');
  const data=require('../data/machine-beasts.js'),beast=data.beasts.find(b=>b.id==='mechanical-bear');
  const inventory={};
  for(const mod of data.modifications){
    if(spec.reported&&!['none','initial','heaven','fullDivine'].includes(mod.id))continue;
    inventory[mod.id]={};
    for(let rank=0;rank<=7;rank++)inventory[mod.id][rank]=2;
    if(spec.mixed)for(let rank=8;rank<=10;rank++)inventory[mod.id][rank]=1;
  }
  const metrics={id:spec.id,phase:'start',puts:0,stateBuckets:0,states:0,peakStates:0,frontierPeak:0},buckets=new Map();
  const start=performance.now();
  function log(phase){process.stdout.write(JSON.stringify({...metrics,phase,elapsedMs:performance.now()-start,heapMiB:process.memoryUsage().heapUsed/1048576,peakRssMiB:process.resourceUsage().maxRSS/1024})+'\n');}
  const probe={domain(types,unit,length){metrics.candidates=types.length;metrics.researchGcd=unit;metrics.bucketCapacity=length;log('domain');},put(r,size){
    metrics.puts++;const prior=buckets.get(r)||0;metrics.states+=size-prior;buckets.set(r,size);metrics.stateBuckets=buckets.size;
    metrics.peakStates=Math.max(metrics.peakStates,metrics.states);metrics.frontierPeak=Math.max(metrics.frontierPeak,size);
    if(metrics.puts%5000===0)log('progress');
  }};
  let source=revision?execFileSync('git',['-c','safe.directory='+root.replaceAll('\\','/'),'show',revision+':js/machine-beasts.js'],{cwd:root,encoding:'utf8'}):fs.readFileSync(path.join(root,'js/machine-beasts.js'),'utf8');
  const point='rows[0]=[{r:0,n:0,m:0,b:0,p:0,counts:Array(types.length).fill(0)}];';
  const update='bucket.push({r:r,n:n,m:m,b:b,p:p,counts:counts});rows[r]=bucket;';
  if(!source.includes(point)||!source.includes(update))throw Error('Diagnostic hook no longer matches current solver');
  if(!native)source=source.replace(point,'probe.domain(types,unit,rows.length);'+point).replace(update,update+'probe.put(r,bucket.length);');
  const context={module:{exports:{}},probe};vm.runInNewContext(source,context);
  log('start');
  const result=context.module.exports.calculateInvestmentPlan(data,beast,{showHighRanks:true,showMods:true,inventory},
    {targetLevel:20,newRankMode:spec.mode,allowNewModifications:spec.mods,allowNewHighRanks:false,convertOwnedInventory:true});
  metrics.valid=result.valid;metrics.invested=result.totals?.investedCount;metrics.added=result.totals?.newInvestedCount;log('complete');
}else{
  for(const spec of cases.filter(spec=>process.argv[2]!=='--only'||spec.id===process.argv[3])){
    const result=spawnSync(process.execPath,[__filename,'--case',spec.id,...(revision?['--revision',revision]:[]),...(native?['--native']:[])],{cwd:root,timeout:8000,encoding:'utf8',maxBuffer:4*1024*1024});
    const lines=(result.stdout||'').trim().split('\n').filter(Boolean);
    process.stdout.write(JSON.stringify({id:spec.id,status:result.status,signal:result.signal,timedOut:result.error?.code==='ETIMEDOUT',last:lines.at(-1)?JSON.parse(lines.at(-1)):null,error:result.stderr||undefined})+'\n');
  }
}
