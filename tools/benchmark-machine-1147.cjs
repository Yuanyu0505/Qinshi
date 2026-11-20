'use strict';
// Reproducible native, private module graphs in isolated child processes.
// Diagnostics and GC tracing are opt-in; no account data or storage is opened.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {spawnSync}=require('node:child_process'),{performance}=require('node:perf_hooks');
const {load}=require('./machine-baseline-loader.cjs');
const {specifications,buildInput}=require('./benchmark-machine-school.cjs');
const args=process.argv.slice(2),at=name=>args.indexOf(name),value=(name,fallback)=>at(name)<0?fallback:args[at(name)+1];
const revision=value('--revision',null),diagnostics=args.includes('--diagnostics'),gc=args.includes('--gc');
const cases=specifications();
if(args.includes('--extended')){
  const base=cases[1];
  cases.push({...base,id:'hegemonic-boundary',stock:'boundary'}, {...base,id:'hegemonic-zero-new',newRankMode:'zero'}, {...cases[2],id:'nonAttack-blueprints-short',stock:'zero'},
    {...base,id:'hegemonic-high-and-modifications',allowHigh:true,mods:true}, {...base,id:'hegemonic-limited-participants',stage:1,limited:true});
}
if(at('--child')>=0){
  const spec=cases.find(s=>s.id===value('--child'));if(!spec)throw Error('Unknown scenario');
  const api=load(revision),input=buildInput(spec,api.data),events=[];
  if(spec.newRankMode)input.options.newRankMode=spec.newRankMode;
  if(spec.allowHigh)input.options.allowNewHighRanks=true;
  if(spec.limited){
    input.options.participatingBeastIds=input.school.beastIds.slice(0,8);
    input.options.ownedLimitsByBeast={};
    for(const id of input.school.beastIds){
      const inventory=input.progressByBeast[id].inventory,limits={};
      for(const [mod,ranks] of Object.entries(inventory)){limits[mod]={};for(const rank of Object.keys(ranks))limits[mod][rank]=mod==='none'?Math.min(1,ranks[rank]):0;}
      input.options.ownedLimitsByBeast[id]=limits;
    }
  }
  if(spec.stock==='boundary'){
    const baseline=api.planner.calculateSchoolPlans(api.data,spec.schoolId,input.progressByBeast,input.options);
    if(!baseline.valid)throw Error(JSON.stringify(baseline.errors));
    input.options.referenceCostSettings.awakeningBlueprintStock=Math.max(0,baseline.plans[0].totals.awakeningBlueprints-1);
  }
  let sampledHeapMiB=process.memoryUsage().heapUsed/1048576;
  if(diagnostics)input.options.onDiagnostic=event=>{
    sampledHeapMiB=Math.max(sampledHeapMiB,process.memoryUsage().heapUsed/1048576);
    if(event.phase!=='conversion-progress')events.push(event);
  };
  const started=performance.now(),result=api.planner.calculateSchoolPlans(api.data,spec.schoolId,input.progressByBeast,input.options),solveMs=performance.now()-started;
  const exact=result.valid&&result.plans.length>0&&result.plans.every(p=>p.totals.projectedTotalLevel===result.target.totalLevel);
  // Serialization is outside solve timing; the digest includes the entire graph.
  const resultSha256=crypto.createHash('sha256').update(JSON.stringify(result)).digest('hex');
  // V8 GC tracing uses stdout and may interleave with console writes. Keep the
  // single result record on stderr; the parent emits only parsed JSON.
  fs.writeSync(2,'QIN_BENCH_JSON '+JSON.stringify({id:spec.id,revision:revision||'worktree',diagnostics,solveMs,peakRssMiB:process.resourceUsage().maxRSS/1024,sampledHeapMiB:diagnostics?sampledHeapMiB:null,exact,errors:result.errors,resultSha256,events:diagnostics?events:undefined,prewarmed:spec.stock==='boundary',rssScope:spec.stock==='boundary'?'whole child including boundary stock pre-solve':'whole isolated child',environment:{node:process.version,os:os.type()+' '+os.release(),arch:process.arch}})+'\n');
  if(!exact)process.exitCode=1;
}else{
  const repetitions=Number(value('--repeat',1)),timeout=Number(value('--timeout-ms',120000));
  if(!Number.isSafeInteger(repetitions)||repetitions<1||!Number.isSafeInteger(timeout)||timeout<1)throw Error('Invalid diagnostic repetition or safety timeout');
  const selected=value('--only',null);if(selected&&!cases.some(s=>s.id===selected))throw Error('Unknown scenario');
  for(let repeat=0;repeat<repetitions;repeat++)for(const spec of cases.filter(s=>!selected||s.id===selected)){
    const child=spawnSync(process.execPath,[...(gc?['--trace-gc']:[]),__filename,'--child',spec.id,...(revision?['--revision',revision]:[]),...(diagnostics?['--diagnostics']:[]),...(args.includes('--extended')?['--extended']:[])],{cwd:path.resolve(__dirname,'..'),timeout,encoding:'utf8',maxBuffer:32*1024*1024});
    const lines=(child.stdout||'').split(/\r?\n/),stderr=(child.stderr||'').split(/\r?\n/),record=stderr.find(line=>line.startsWith('QIN_BENCH_JSON ')),json=record?record.slice('QIN_BENCH_JSON '.length):lines.filter(line=>line.startsWith('{')).at(-1);
    let result=null;if(json)result=JSON.parse(json);
    console.log(JSON.stringify({repeat:repeat+1,id:spec.id,status:child.status,signal:child.signal,timedOut:child.error?.code==='ETIMEDOUT',diagnosticSafetyTimeoutMs:timeout,gcEvents:gc?{minor:lines.filter(l=>/Scavenge|Minor Mark-Sweep/.test(l)).length,major:lines.filter(l=>/Mark-Compact|Mark-sweep/.test(l)).length}:null,result,error:stderr.filter(line=>!line.startsWith('QIN_BENCH_JSON ')).join('\n').trim()||child.error?.message||(!result?'Missing benchmark result record':undefined)}));
    if(child.status!==0||!result||!result.exact)process.exitCode=1;
  }
}
