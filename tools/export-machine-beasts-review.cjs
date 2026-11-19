'use strict';
// Static, allowlisted review export. Never opens account storage or backups.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const version=JSON.parse(fs.readFileSync(path.join(root,'version.json'),'utf8')).version;
const commit=execFileSync('git',['-c','safe.directory='+root.replace(/\\/g,'/'),'rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
const name='机关兽计算逻辑审查包_'+version+'_20261119';
const out=path.join(root,'outputs',name);
if(fs.existsSync(out))throw Error('Export already exists; choose a new destination, do not overwrite: '+out);
const core=['data/machine-beasts.js','js/machine-beasts.js','js/machine-beast-school-planner.js','js/machine-beast-equivalents.js'];
const wiring=['js/machine-beasts-ui.js','js/calculation-worker.js','js/calculation-runner.js','js/calculation-runner.test.js','js/partition-loader.js','js/ui-performance.js','css/machine-beasts.css','version.json'];
const unit=fs.readdirSync(path.join(root,'js')).filter(f=>/^machine-beasts?.*\.test\.js$/.test(f)).map(f=>'js/'+f);
const tests=fs.readdirSync(path.join(root,'tests')).filter(f=>/^machine-beasts?.*\.(cjs|test\.js)$/.test(f)).map(f=>'tests/'+f).concat(['tests/browser-test-helpers.cjs']);
const docs=['docs/superpowers/specs/2026-11-18-machine-beast-convertible-stock-design.md',
  'docs/superpowers/reports/2026-11-19-machine-beast-highrank-1140.md','docs/superpowers/reports/2026-11-19-machine-beast-price-1140.md',
  'docs/superpowers/reports/2026-11-19-audit-1140.md','docs/superpowers/plans/2026-11-19-audit-1140.md',
  'docs/superpowers/reports/2026-11-19-expired-tests-1140.md','docs/superpowers/reports/2026-11-19-wood-provenance-1140.md'];
const tools=['tools/benchmark-machine-conversion.cjs','tools/machine-beasts-zero-rank-audit.cjs','tools/export-machine-beasts-review.cjs'];
const files=[...new Set([...core,...wiring,...unit,...tests,...docs,...tools])];
const pending=execFileSync('git',['-c','safe.directory='+root.replace(/\\/g,'/'),'status','--porcelain','--',...files],{cwd:root,encoding:'utf8'}).trim();
if(pending)throw Error('Commit export sources before exporting so the snapshot matches its declared commit');
fs.mkdirSync(out,{recursive:true});
for(const file of files){const target=path.join(out,'源码',file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(root,file),target);}
const logs=fs.readdirSync(path.join(root,'outputs')).filter(f=>/^1140-.*\.(txt|jsonl)$/.test(f));
fs.mkdirSync(path.join(out,'测试日志'));
for(const file of logs){
  const log=fs.readFileSync(path.join(root,'outputs',file),'utf8').replace(/S-\d-\d+(?:-\d+){1,}/g,'[Windows SID redacted]');
  fs.writeFileSync(path.join(out,'测试日志',file),log);
}
const data=require('../data/machine-beasts.js');
fs.writeFileSync(path.join(out,'结构化游戏数据.json'),JSON.stringify(data,null,2));
const examples={notice:'构造输入，不是个人账号数据。',examples:[
  {api:'CORE.calculateInvestmentPlan',beastId:'red-serpent',progress:{showHighRanks:true,showMods:true,inventory:{fullDivine:{8:1}}},options:{targetLevel:10,newRankMode:'zeroToSeven',convertOwnedInventory:true,allowNewHighRanks:false},verified:{newInvestedCount:0,investedCount:2}},
  {api:'CORE.calculateInvestmentPlan',beastId:'war-demon',progress:{inventory:{none:{10:1}}},options:{targetLevel:1,newRankMode:'zero',convertOwnedInventory:true},verified:{remainingBaseBodies:7}}
]};
fs.writeFileSync(path.join(out,'构造示例输入.json'),JSON.stringify(examples,null,2));
fs.writeFileSync(path.join(out,'README.md'),`# 机关兽计算逻辑审查包 ${version}\n\n当前提交：${commit}。这是本次实际修复后静态代码，不是1.1.37旧包；未包含个人账号、库存备份、工作簿、密钥或环境配置。\n\n阅读顺序：01业务规则 → 02调用路径 → 03完整核心源码 → 源码/与测试日志/。先阅读本次验收报告，原设计仅为历史规则依据。\n\n本次修复：高阶库存原形不受加工范围误过滤；有默认价清空提交后恢复有效默认；Worker不可用时机关兽安全停止，不再进行阻塞式主线程回退。\n\n限制：复杂混合库存仍可能长时间计算，未增加近似剪枝；恢复默认会写回当前数值，未来默认变化不会自动继承；核心显式null和单兽蓝紫参数兼容语义未改。\n\n导出包是审查资料，不是完整可部署站点。可进入源码目录运行node --test js/machine-beasts-highrank.test.js js/machine-beasts-conversion.test.js；浏览器、发布资源及其他依赖完整项目的测试须在原仓库执行。各日志明确RED/GREEN/既有失败，勿把初始预期失败误作最终回归失败或把历史测试当成本次测试。\n`);
fs.writeFileSync(path.join(out,'01_业务规则与审查要求.md'),`# 当前业务规则及审查重点\n\n- 同名库存0—7阶等于1本体，8/9/10阶等于2/4/8本体。升阶材料按充足、不计成本。\n- 原形直接投入保留原改造；还原、拆解或重新加工归0改。允许新增改造须显式开关，不能隐式继承原改造。\n- 原形合法性独立于加工范围；仅0阶或0—7阶限制的是加工/新增目标，不排除已拥有8—10阶合法原形。逐来源上限和共享折算额度同时约束，不得双用。\n- 单兽开启库存优先真正新增本体，再按原有总折算投入、溢出等顺序；允许目标溢出。单兽参考元宝不作为流派排序套用。\n- 流派固定累计等级（含135上限），保留未参与兽等级，已达目标不投入。两套排序均先改造折算投入最少；投入最小按元宝、效果、溢出、神图；最多效果按效果、元宝、溢出、神图。方向详见源码比较器，不新增排序维度。\n- 神图=逐只ceil(研发/500)，机关破片=逐只ceil(研发/100)，再合计；实际除数取data规则。碎片只抵扣新增本体。共享神图库存每套流派仅扣一次。\n- 有默认价字段清空并结束编辑后取DATA.referenceCostRules默认；0与合法小数保留；蓝紫无默认不作免费。恢复动作写回当前默认数值，不是删除持久化覆盖。显式null核心API仍缺价。\n- 单兽bluePurpleInventoryOnly不是现有UI合同，本轮仅记录API兼容差异，不擅自改变购买策略；流派独立开关维持。\n- UI明确传convertOwnedInventory:true；省略参数的公开API仍可走旧兼容路径，审查不得混淆。\n- Worker结果和相同输入同步核心API在有界用例一致；产品页面Worker不可用安全报错，不在主线程跑长同步计算。\n\n请重点审查：Pareto安全性、有限原形/加工双花、原改造与加工归0、同等图BigInt计数/分页来源、精确流派与两套排序、未知价/0/小数资源取整、账号草稿与存储失败、极端复杂度。区分已复现反例和静态怀疑，不把通过测试当作形式证明。\n`);
let combined='# 完整核心计算源码 · '+version+'\n\n提交：'+commit+'。以下为完整文件，未简化。\n\n';
for(const file of core)combined+='## '+file+'\n\n```javascript\n'+fs.readFileSync(path.join(root,file),'utf8').trimEnd()+'\n```\n\n';
fs.writeFileSync(path.join(out,'03_核心计算源码_合并阅读.md'),combined);
let mapping='# 调用路径与实际定位\n\nUI临时输入 → calculation-runner → calculation-worker → 单兽CORE/流派PLANNER → 候选/来源分配 → 同等方案图 → UI。Worker不可用安全停止；直接Node API仍同步执行。\n\n';
for(const file of core.concat(['js/machine-beasts-ui.js','js/calculation-runner.js'])){
  mapping+='## '+file+'\n\n';fs.readFileSync(path.join(root,file),'utf8').split(/\r?\n/).forEach((line,i)=>{const m=line.match(/^\s*function ([\w]+)\(/);if(m)mapping+='- '+m[1]+'：'+(i+1)+'行\n';});mapping+='\n';
}
fs.writeFileSync(path.join(out,'02_调用路径与代码定位.md'),mapping);
const manifest=[];
function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())walk(file);else{const bytes=fs.readFileSync(file);manifest.push({path:path.relative(out,file).replace(/\\/g,'/'),bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});}}}
walk(out);fs.writeFileSync(path.join(out,'文件清单_SHA256.json'),JSON.stringify({version,commit,exportedAt:new Date().toISOString(),files:manifest},null,2));
console.log(JSON.stringify({out,files:manifest.length,commit,version}));
