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
  cases.push({...base,id:'hegemonic-boundary',stock:'boundary',offset:-1}, {...base,id:'hegemonic-boundary-exact',stock:'boundary',offset:0}, {...base,id:'hegemonic-boundary-surplus',stock:'boundary',offset:10000}, {...base,id:'hegemonic-zero-new',newRankMode:'zero'}, {...cases[2],id:'nonAttack-blueprints-short',stock:'zero'},
    {...base,id:'hegemonic-high-and-modifications',allowHigh:true,mods:true}, {...base,id:'hegemonic-limited-participants',stage:1,limited:true},
    {...base,id:'hegemonic-zero-price-135',stage:3,price:0});
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
    const stock=Number(value('--stock',NaN));
    if(!Number.isSafeInteger(stock)||stock<0)throw Error('Boundary child requires frozen --stock');
    input.options.referenceCostSettings.awakeningBlueprintStock=stock;
  }
  const inputRecord={schoolId:spec.schoolId,progress:input.progressByBeast,options:input.options};
  const inputSha256=crypto.createHash('sha256').update(JSON.stringify(inputRecord)).digest('hex');
  const stock=input.options.referenceCostSettings.awakeningBlueprintStock;
  fs.writeSync(1,'QIN_INPUT '+JSON.stringify({inputSha256,stock})+'\n');
  let sampledHeapMiB=process.memoryUsage().heapUsed/1048576;
  if(diagnostics)input.options.onDiagnostic=event=>{
    sampledHeapMiB=Math.max(sampledHeapMiB,process.memoryUsage().heapUsed/1048576);
    if(event.phase!=='conversion-progress')events.push(event);
    if(event.phase==='combine-layer')fs.writeSync(1,'QIN_LAYER '+JSON.stringify({...event,heapMiB:process.memoryUsage().heapUsed/1048576})+'\n');
  };
  const started=performance.now(),result=api.planner.calculateSchoolPlans(api.data,spec.schoolId,input.progressByBeast,input.options),solveMs=performance.now()-started;
  const exact=result.valid&&result.plans.length>0&&result.plans.every(p=>p.totals.projectedTotalLevel===result.target.totalLevel);
  // Serialization is outside solve timing; the digest includes the entire graph.
  const resultSha256=crypto.createHash('sha256').update(JSON.stringify(result)).digest('hex');
  // V8 GC tracing uses stdout and may interleave with console writes. Keep the
  // single result record on stderr; the parent emits only parsed JSON.
  fs.writeSync(2,'QIN_BENCH_JSON '+JSON.stringify({id:spec.id,revision:revision||'worktree',diagnostics,solveMs,peakRssMiB:process.resourceUsage().maxRSS/1024,sampledHeapMiB:diagnostics?sampledHeapMiB:null,exact,errors:result.errors,inputSha256,stock,requiredBlueprints:result.plans?.[0]?.totals.awakeningBlueprints,resultSha256,events:diagnostics?events:undefined,rssScope:'whole isolated child',environment:{node:process.version,os:os.type()+' '+os.release(),arch:process.arch}})+'\n');
  if(!exact)process.exitCode=1;
}else{
  const repetitions=Number(value('--repeat',1)),timeout=Number(value('--timeout-ms',120000));
  const heapLimit=value('--heap-mib',null);
  if(heapLimit!==null&&(!Number.isSafeInteger(Number(heapLimit))||Number(heapLimit)<64))throw Error('Invalid heap limit');
  if(!Number.isSafeInteger(repetitions)||repetitions<1||!Number.isSafeInteger(timeout)||timeout<1)throw Error('Invalid diagnostic repetition or safety timeout');
  const selected=value('--only',null);if(selected&&!cases.some(s=>s.id===selected))throw Error('Unknown scenario');
  function run(spec,repeat,frozen,role){
    const stock=frozen?Math.max(0,frozen.requiredBlueprints+spec.offset):null;
    const child=spawnSync(process.execPath,[...(heapLimit?['--max-old-space-size='+heapLimit]:[]),...(gc?['--trace-gc']:[]),__filename,'--child',spec.id,...(frozen?['--stock',String(stock)]:[]),...(revision?['--revision',revision]:[]),...(diagnostics?['--diagnostics']:[]),...(args.includes('--extended')?['--extended']:[])],{cwd:path.resolve(__dirname,'..'),timeout,encoding:'utf8',maxBuffer:32*1024*1024});
    const lines=(child.stdout||'').split(/\r?\n/),stderr=(child.stderr||'').split(/\r?\n/),record=stderr.find(line=>line.startsWith('QIN_BENCH_JSON ')),json=record?record.slice('QIN_BENCH_JSON '.length):lines.filter(line=>line.startsWith('{')).at(-1);
    let result=null;if(json)result=JSON.parse(json);
    const inputLine=lines.find(l=>l.startsWith('QIN_INPUT '));
    process.stdout.write(JSON.stringify({repeat:repeat+1,id:spec.id,role,stock,frozen,heapLimit,input:inputLine?JSON.parse(inputLine.slice(10)):null,status:child.status,signal:child.signal,timedOut:child.error?.code==='ETIMEDOUT',diagnosticSafetyTimeoutMs:timeout,gcEvents:gc?{minor:lines.filter(l=>/Scavenge|Minor Mark-Sweep/.test(l)).length,major:lines.filter(l=>/Mark-Compact|Mark-sweep/.test(l)).length}:null,result,layers:!result?lines.filter(l=>l.startsWith('QIN_LAYER ')).flatMap(l=>{try{return [JSON.parse(l.slice(10))];}catch{return [];}}):undefined,error:stderr.filter(line=>!line.startsWith('QIN_BENCH_JSON ')).join('\n').trim()||child.error?.message||(!result?'Missing benchmark result record':undefined)})+'\n');
    if(child.status!==0||!result||!result.exact)process.exitCode=1;
    return result?.exact?{requiredBlueprints:result.requiredBlueprints,inputSha256:result.inputSha256,resultSha256:result.resultSha256}:null;
  }
  for(let repeat=0;repeat<repetitions;repeat++){
    let frozen;
    for(const spec of cases.filter(s=>!selected||s.id===selected)){
      if(spec.stock==='boundary'){
        if(frozen===undefined)frozen=run(cases[1],repeat,null,'freeze-stock');
        if(frozen)run(spec,repeat,frozen,'boundary');
      }else{
        const result=run(spec,repeat,null,'solve');
        if(spec===cases[1])frozen=result;
      }
    }
  }
}
