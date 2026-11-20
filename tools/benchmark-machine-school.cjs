'use strict';
// User-run diagnostics only: synthetic stock, isolated child, no account access.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const {spawnSync}=require('node:child_process');
const {performance}=require('node:perf_hooks');
const DATA=require('../data/machine-beasts.js');
const root=path.resolve(__dirname,'..');
function specifications(matrix=false,modifiedDomain=false){
  if(modifiedDomain)return ['hegemonic','nonAttack'].map(schoolId=>({id:'modified-domain-'+schoolId,schoolId,stage:5,inventory:'mixed',mods:true,stock:'zero',price:69.125,domainOnly:true}));
  if(!matrix)return [
    {id:'hegemonic-default',schoolId:'hegemonic',stage:1,inventory:'none',mods:false,stock:'zero',price:70},
    {id:'hegemonic-heterogeneous-high-inventory',schoolId:'hegemonic',stage:5,inventory:'mixed',mods:false,stock:'zero',price:70},
    {id:'nonAttack-fractional-shared-stock',schoolId:'nonAttack',stage:5,inventory:'mixed',mods:false,stock:'sufficient',price:69.125}
  ];
  const cases=[];
  for(const schoolId of ['hegemonic','nonAttack'])for(const stage of [3,5])for(const mods of [false,true])for(const stock of ['zero','sufficient','boundary'])for(const price of [70,69.125]){
    cases.push({id:[schoolId,stage,mods?'mods':'plain',stock,price].join('-'),schoolId,stage,inventory:'mixed',mods,stock,price});
  }
  return cases;
}
function buildInput(spec,data=DATA){
  const school=data.schools.find(s=>s.id===spec.schoolId),progressByBeast={};
  school.beastIds.forEach((id,index)=>{
    const beast=data.beasts.find(b=>b.id===id),inventory={};
    if(spec.inventory==='mixed'){
      if(beast.quality==='orange'){
        inventory.none={0:2+index%3,7:1,8:1,9:index%2,10:index%3===0?1:0};
        inventory.fullDivine={7:index%2,8:index%3===0?1:0};
        inventory.initial={0:index%2,9:index%4===0?1:0};
      }else inventory.none={0:Math.ceil(data.researchThresholds[beast.maxLevel]/data.researchValues[beast.quality][0].none),[beast.maxRank]:2};
    }
    progressByBeast[id]={research:0,fragments:index%3,showHighRanks:true,showMods:true,inventory};
  });
  return {school,progressByBeast,options:{targetStage:spec.stage,newRankMode:'zeroToSeven',convertOwnedInventory:true,allowNewModifications:spec.mods,allowNewHighRanks:false,bluePurpleInventoryOnly:true,referenceCostSettings:{awakeningBlueprintPrice:spec.price,useAwakeningBlueprintStock:true,awakeningBlueprintStock:spec.stock==='sufficient'?1000000000:0}}};
}
function diagnosticRun(spec,native=false){
  const started=performance.now();let metrics,currentBuckets,currentCore,boundaryBlueprints=null;
  function reset(){metrics={core:[],layers:[],peakCoreStates:0,peakCombinedStates:0,peakCombinedFrontier:0,peakCollectedStates:0,peakHeapMiB:0};}
  function sample(){metrics.peakHeapMiB=Math.max(metrics.peakHeapMiB,process.memoryUsage().heapUsed/1048576);}
  function log(phase,extra={}){sample();process.stdout.write(JSON.stringify({id:spec.id,phase,elapsedMs:performance.now()-started,sampledPeakHeapMiB:metrics.peakHeapMiB,peakRssMiB:process.resourceUsage().maxRSS/1024,...extra})+'\n');}
  reset();
  const probe={begin(id,types,unit,capacity){currentBuckets=new Map();currentCore={beastId:id,candidates:types.length,observedModifiedTypes:types.some(type=>type.modificationId!=='none'),researchGcd:unit,bucketCapacity:capacity,puts:0,states:1,peakStates:1,frontierPeak:1};metrics.peakCoreStates=Math.max(metrics.peakCoreStates,1);metrics.core.push(currentCore);},put(r,size){
    currentCore.puts++;currentCore.states+=size-(currentBuckets.get(r)||0);currentBuckets.set(r,size);
    currentCore.peakStates=Math.max(currentCore.peakStates,currentCore.states);currentCore.frontierPeak=Math.max(currentCore.frontierPeak,size);metrics.peakCoreStates=Math.max(metrics.peakCoreStates,currentCore.states);
    if(currentCore.puts%5000===0)log('core-progress',{sample:currentCore});
  },collected(effectMode,index,collected){let count=0;collected.forEach(bucket=>{count+=bucket.values.size+(bucket.saturated?1:0);});metrics.peakCollectedStates=Math.max(metrics.peakCollectedStates,count);sample();},layer(effectMode,index,states){
    let count=0,frontier=0;states.forEach(values=>{count+=values.length;frontier=Math.max(frontier,values.length);});
    metrics.peakCombinedStates=Math.max(metrics.peakCombinedStates,count);metrics.peakCombinedFrontier=Math.max(metrics.peakCombinedFrontier,frontier);metrics.layers.push({mode:effectMode?'effects':'cost',index,states:count,frontier});log('school-layer',{sample:metrics.layers.at(-1)});
  }};
  function hook(source,marker,replacement){if(!source.includes(marker))throw Error('Diagnostic hook no longer matches solver: '+marker);return source.replace(marker,replacement);}
  let coreSource=fs.readFileSync(path.join(root,'js/machine-beasts.js'),'utf8');
  const initial=coreSource.includes('counts:Array(types.length).fill(0)')?'rows[0]=[{r:0,n:0,m:0,b:0,p:0,counts:Array(types.length).fill(0)}];':'rows[0]=[{r:0,n:0,m:0,b:0,p:0,counts:packedZero}];';
  const put='bucket.push({r:r,n:n,m:m,b:b,p:p,counts:counts});rows[r]=bucket;';
  if(!native){coreSource=hook(coreSource,initial,'probe.begin(beast.id,types,unit,rows.length);'+initial);coreSource=hook(coreSource,put,put+'probe.put(r,bucket.length);');}
  globalThis.__qinshiSchoolDiagnosticProbe=probe;
  function compileInstrumented(source,file){
    const filename=path.join(root,'js',file),compiled=new Module(filename,module);compiled.filename=filename;compiled.paths=module.paths;
    compiled._compile('var probe=globalThis.__qinshiSchoolDiagnosticProbe;\n'+source,filename);require.cache[filename]=compiled;return compiled.exports;
  }
  const core=native?require('../js/machine-beasts.js'):compileInstrumented(coreSource,'machine-beasts.js');
  let schoolSource=fs.readFileSync(path.join(root,'js/machine-beast-school-planner.js'),'utf8');
  if(!native){schoolSource=hook(schoolSource,'      var next = new Map();','      probe.collected(effectMode,setIndex,collected);var next = new Map();');schoolSource=hook(schoolSource,'      states = next;','      states = next;probe.layer(effectMode,setIndex,states);');}
  const planner=native?require('../js/machine-beast-school-planner.js'):compileInstrumented(schoolSource,'machine-beast-school-planner.js'),input=buildInput(spec);
  log('start',{environment:{node:process.version,platform:process.platform,arch:process.arch},native,spec,participants:input.school.beastIds.length});
  if(spec.domainOnly){
    const settings=core.normalizeReferenceCostSettings(DATA,input.options.referenceCostSettings),domains=[];
    for(const id of input.school.beastIds){
      const beast=DATA.beasts.find(beast=>beast.id===id),progress=core.normalizeBeastProgress(beast,input.progressByBeast[id],DATA);
      const candidates=planner.machineBeastCandidates(DATA,beast,progress,{...input.options,plainOnly:false,referenceCostSettings:settings});
      const summary={beastId:id,candidates:candidates.length,modifiedCandidates:candidates.filter(candidate=>candidate.modifiedInvestedCount>0).length};
      domains.push(summary);log('modified-domain-beast',{sample:summary});
    }
    const observed=native?null:metrics.core.some(sample=>sample.observedModifiedTypes);
    log('complete',{domainOnly:true,schoolPlanComputed:false,observedModifiedTypes:observed,domains,metrics});if(!native&&!observed)process.exitCode=1;return;
  }
  if(spec.stock==='boundary'){
    log('boundary-baseline');
    const baseline=planner.calculateSchoolPlans(DATA,spec.schoolId,input.progressByBeast,input.options);
    if(!baseline.valid)throw Error('Boundary baseline invalid: '+JSON.stringify(baseline.errors));
    const need=baseline.plans[0]?.totals.awakeningBlueprints||0;
    boundaryBlueprints=need;
    input.options.referenceCostSettings.awakeningBlueprintStock=Math.max(0,need-1);
    log('boundary-selected',{baselineBlueprints:need,stock:input.options.referenceCostSettings.awakeningBlueprintStock});reset();
  }
  const solveStart=performance.now(),result=planner.calculateSchoolPlans(DATA,spec.schoolId,input.progressByBeast,input.options);
  const target=input.school.stages.find(stage=>stage.stage===spec.stage).requiredTotalLevel;
  const exact=result.valid&&result.plans.length>0&&result.plans.every(plan=>plan.totals.projectedTotalLevel===target);
  log('complete',{solveMs:performance.now()-solveStart,exact,target,stock:input.options.referenceCostSettings.awakeningBlueprintStock,boundaryBaselineBlueprints:boundaryBlueprints,observedModifiedTypes:native?null:metrics.core.some(sample=>sample.observedModifiedTypes),metrics,valid:result.valid,errors:result.errors,plans:result.plans?.map(plan=>({kind:plan.kind,totals:plan.totals,equivalentCount:plan.equivalents?.count,beasts:plan.beasts.map(beast=>({id:beast.beastId,startLevel:beast.startLevel,endLevel:beast.endLevel,items:beast.items}))}))});
  if(!exact)process.exitCode=1;
}
if(require.main===module){
  const args=process.argv.slice(2),cases=specifications(args.includes('--matrix'),args.includes('--modified-domain'));
  const child=args.indexOf('--case');
  if(child>=0){const spec=cases.find(item=>item.id===args[child+1]);if(!spec)throw Error('Unknown school case');diagnosticRun(spec,args.includes('--native'));}
  else{
    const only=args.indexOf('--only'),timeoutAt=args.indexOf('--timeout-ms'),timeout=timeoutAt<0?30000:Number(args[timeoutAt+1]);
    if(!Number.isSafeInteger(timeout)||timeout<=0)throw Error('Diagnostic timeout must be a positive safe integer');
    if(only>=0&&!cases.some(spec=>spec.id===args[only+1]))throw Error('Unknown school case');
    for(const spec of cases.filter(spec=>only<0||spec.id===args[only+1])){
      const child=spawnSync(process.execPath,[__filename,'--case',spec.id,...(args.includes('--matrix')?['--matrix']:[]),...(args.includes('--modified-domain')?['--modified-domain']:[]),...(args.includes('--native')?['--native']:[])],{cwd:root,timeout,encoding:'utf8',maxBuffer:16*1024*1024});
      const lines=(child.stdout||'').trim().split('\n').filter(Boolean);let last=null;
      for(let i=lines.length-1;i>=0;i--){try{last=JSON.parse(lines[i]);break;}catch(error){/* An externally killed child may leave a partial final line. */}}
      console.log(JSON.stringify({id:spec.id,status:child.status,signal:child.signal,timedOut:child.error?.code==='ETIMEDOUT',diagnosticLimitMs:timeout,last,error:child.stderr||child.error?.message}));
      if(child.status!==0)process.exitCode=1;
    }
  }
}
module.exports={specifications,buildInput};
