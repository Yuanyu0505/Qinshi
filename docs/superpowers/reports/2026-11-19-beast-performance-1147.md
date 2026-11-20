# 1.1.47 机关兽精确性能与卡顿优化

## 范围与结论

以当前1.1.46 `d667c2b` 为基线增量修改，完整阅读用户专项任务书。没有覆盖旧源码，没有修改游戏资料、正式排序、神核/本体规则、账号权限或库存/价格存储格式。1.1.46布局保留。用户本轮明确要求测试和性能验收，专项及全量测试按此授权执行，仅使用合成输入和隔离本地测试账号。

已落地：同等方案增量分页、精确紧凑数量编码、消除不必要源桶复制、可选诊断、真实Worker阶段反馈和明确安全失败。**没有使用近似剪枝、候选数量截断、超时返回次优结果或主线程同步降级。**

## 文件与函数

| 文件 | 修改 |
| --- | --- |
| `js/machine-beasts.js` / `conversionCandidates` | 各类型独立位宽编码；总宽≤53位用精确Number，否则BigInt；最终代表候选才解包；保留全部原Pareto维度与数量上界 |
| 同上 / `put`、可行数量上界DP | 只对通过预算及支配检查的状态创建编码；正研究量/本体数转移不修改源桶，去除多余slice |
| 同上 / `options.onDiagnostic` | 仅显式启用时统计类型、GCD、桶容量、转移接受/拒绝、保留状态峰值、解包/分配次数与耗时；每5000次接受才稀疏采样，不写个人存储、不默认向UI逐状态发送 |
| `js/machine-beast-school-planner.js` | rawCandidates/候选收敛/来源分配与同等图pack计时；三个真实阶段回调，不改组合器或比较器 |
| `js/machine-beasts-ui.js` | 结果/plan/账号/sequence绑定分页缓存；首10项，之后仅新增10项、每项之间让出任务；append新节点，不重解码或替换旧区块；导航中止待处理任务但保留已提交页；真实阶段文案 |
| `js/calculation-runner.js`、`js/calculation-worker.js` | 进度消息不提前完成Promise，保留任务ID/取消/显式重试；后台不可用或中断明确为“精确计算未完成”而非无解 |
| `tools/machine-baseline-loader.cjs`、`compare-machine-conversion.cjs`、`freeze-machine-school.cjs` | baseline四模块全部从同一Git版本原生加载，与当前完整JSON及全部有界分页比较，不混用旧core与新planner |
| `tools/benchmark-machine-1147.cjs` | 独立子进程、版本/场景/摘要、无探针/诊断/GC分离、完整结果SHA256、缺失结果记录也报失败；boundary预求解明确标记预热与全进程RSS |
| `tools/beast-worker-lifecycle.cjs` | 构造输入、连续3次复用/一次性Worker对比、结果hash、CDP堆/浏览器工作集及clone+queue观察 |
| 相关测试、版本资源 | 维护回归，新增精确边界/独立差分/分页和Worker用例；五处版本资源同步1.1.47 |

## 精确性与方案取舍

1. 每个类型数量不超过 `floor(maximumResearch / researchEach)`，有界原形还受available限制。每槽取严格大于其上界的2幂基数，因此合法转移不会跨槽进位。早类型处高位，编码顺序等于旧16位补零数量字典序；原stable字符串和结果结构不变。
2. 只有**全部槽位总宽≤53位**时使用Number，最大编码≤2^53−1；加法、2幂乘除与取余均保留整数精度。更大改造域使用BigInt。恰53位和432位域都有直接调用真实core的回归。
3. `put`严格增加研究桶，数量上界DP严格增加本体桶，故转移不改变当前forEach源桶；有界下降/无界上升遍历顺序保留，去除slice不改变数量可行域。
4. 未改支配维度或改造优先级，没有为性能目标减少同等材料向量。同等图仍重建全部合法同等组合；本轮未冒险修改全局组合器、缓存业务签名或延迟总数语义。
5. 曾试验全BigInt编码：内存下降但耗时上升，未把该中间方案作为最终提速证据。最终为混合精确编码。

## 同环境无探针前后对照

Windows / Node v24.16.0；同一机器、相同输入、每场独立原生子进程，旧/新各两轮，以下为算术平均。新端最终去除slice版；没有浏览器重压与该组测量并行。对照只适用于这组样本，不与审查书Linux数据或旧1145日志混算倍率。

| 场景 | 旧/新耗时ms | 耗时降低 | 旧/新峰值RSS MiB | RSS降低 |
| --- | ---: | ---: | ---: | ---: |
| 霸道14兽45级，无库存 | 1039 / 753 | 27.6% | 410 / 342 | 16.5% |
| 霸道14兽225级，混合高阶库存 | 6025 / 4602 | 23.6% | 1076 / 768 | 28.7% |
| 非攻13兽225级，小数价/充足共享神图 | 6116 / 4531 | 25.9% | 1064 / 815 | 23.5% |

日志：`outputs/1147-native-before-final.jsonl`、`1147-native-after-noslice.jsonl`。完整结果SHA256逐场一致。**没有全面达到RSS降低40%、耗时降低30%的工程目标；没有用近似结果换取达标。**

独立GC/诊断采样日志：`1147-gc-baseline.jsonl`、`1147-gc-fixed.jsonl`。三场旧→新Minor事件21→17、104→62、90→66，Major事件2→2、5→4、5→4；这些是独立带追踪运行的事件次数，不将其耗时混入无探针对照。当前单兽DP状态峰值仍为551015/834397/834397：优化的是状态对象与数量向量开销，**不是声称已减少合法状态**。同等图pack该次采样约12/42/123ms。

初次GC日志`1147-native-probed-gc.jsonl`有两场结果记录与V8 stdout交错而无法提取，不能作为通过证据。工具已把结果移到独立stderr记录，缺记录视失败，重跑三场都得到完整精确结果；上述GC数据只引用修正日志。

## 分页与五档浏览器

五档320/390/820/1366/1920真实Edge157，768套同等方案中的767个替代组合，全部顺序与一次性精确分页一致；76次追加只解码新项，保留旧DOM/展开/焦点/滚动，截图见下。

390px前20次对照：旧整块重建8632ms、最长单任务873ms；增量1414ms、该20次未记录≥50ms长任务。此为本地诊断观察，不是通用硬件倍率。完整76页在320/390仍记录50–87ms长任务，不能宣称零卡顿。单个解码仍同步，只在项与项之间让出执行。

| 宽度 | 实际截图与原始数据 |
| --- | --- |
| 320 | [截图](C:/Users/pghyl/Desktop/deepseek/outputs/1147-pagination/320.png) / 同目录320.json |
| 390 | [截图](C:/Users/pghyl/Desktop/deepseek/outputs/1147-pagination/390.png) / 同目录390.json |
| 820 | [截图](C:/Users/pghyl/Desktop/deepseek/outputs/1147-pagination/820.png) / 同目录820.json |
| 1366 | [截图](C:/Users/pghyl/Desktop/deepseek/outputs/1147-pagination/1366.png) / 同目录1366.json |
| 1920 | [截图](C:/Users/pghyl/Desktop/deepseek/outputs/1147-pagination/1920.png) / 同目录1920.json |

390前20页旧/新截图为同目录`baseline-390-20pages.png`、`390-20pages.png`。全76页旧UI尝试运行约111秒仍未完成后停止，仅记录为未完成，不编造完成页数或OOM结论。原始方法、各宽长任务与局限见`outputs/1147-pagination/evidence.md`。

独立审查复现的“切资料再返回继续显示失效”已修复：导航保留已提交offset和DOM，闭包捕获不可变请求sequence，取消后的旧任务不能复活或清除新请求busy。新增两条先失败后通过的setMode回归，真实390导航往返/排队取消恢复1/1通过。

## Worker生命周期实测与决定

最终冻结core/planner/worker源码SHA下，标准225级输入复用/一次性各连续3次，六次完整205890-byte结果JSON SHA相同。复用3498/4261.9/3795.4ms（均3851.8），一次性3472/3487/3800.9ms（均3586.6）；时间范围重叠，一次性本组均值略快，**不能沿用迭代期间“启动更慢”的观察充当最终结论**。

克隆及消息排队约1.00–1.50ms。复用Worker结果克隆后CDP堆0.82/141.19/199.42MiB，一次性销毁后对应Worker数为0，但两秒后浏览器工作集仅下降3.30–7.69MiB，不等于释放数百MiB给OS。小样本未证明泄漏或稳定的整体内存/速度优势，故保留原生产复用策略，取消/退出仍终止Worker。未改为同步回退。

日志`test-results/1147-worker-lifecycle-final225.log`，工具`node tools/beast-worker-lifecycle.cjs`；其中临时Worker资源仅用于本地诊断，不需加入PWA发布清单。

## 测试、日志与复现命令

- 全站最终：`node tools/run-tests.cjs unit`，**1271/1271通过，0失败/跳过**，日志`outputs/1147-full-unit-final.txt`。首轮1266/1267，唯一旧资料顺序断言来自1.1.46以前，按已确认顺序同步后重跑，不改资料。
- 最终真实Worker/价格/库存/取消重试/等级控件/PWA：**34/34通过**，日志`outputs/1147-final-browser.txt`。
- 独立穷举守恒+完整差分、53位/大域边界和诊断：见`1147-no-slice-green.txt`、`1147-boundary-unit.txt`。差分固定种子1147，360单兽、180流派、720完整前沿、689分页全JSON一致。
- 三场大输入：`node tools/freeze-machine-school.cjs --check`，主结果、来源账本、神核、完整同等图及全部77页等均与d667c2b冻结JSON逐字节相同，日志`1147-frozen-checked.txt`。
- 分页五档5/5，实际导航1/1；分页/旧UI单元12/12，原始日志与证据目录如上。
- 旧1146浏览器fixture选了只有15级的红蛇却期待25项，改为真实25级机关熊罴；手机测试点击点被上翻列表遮挡，改为实际列表外空白点。最终控件两档通过，没有据此修改生产下拉框。

复现浏览器需设置：`$env:PLAYWRIGHT_MODULE='C:/Users/pghyl/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'`，然后`node --test tests/machine-beasts-pagination-browser.cjs`；需要本地回环服务与Edge运行权限，不使用真实账号。

性能命令：`node tools/benchmark-machine-1147.cjs --revision d667c2b --repeat 2`、`node tools/benchmark-machine-1147.cjs --repeat 2`；诊断另加`--diagnostics --gc`。全量旧性能用例仍保留legacy合同；新增工具与差分均显式`convertOwnedInventory:true`，不拿legacy通过记录证明新库存路径安全。

## 未解决范围与发布边界

- 扩展“新增仅0阶”、允许高阶/额外改造、限制参与兽与逐来源上限，均精确完成；日志`1147-extended-{zero,high-mods,limits}.jsonl`。该组有其他回归负载，只作为完成/精确性证据，不参与公平速度倍率。
- 神图库存接近边界的扩展样本在外部30秒子进程安全限时内未完成，日志`1147-extended-boundary.jsonl`；不可称无解或已优化通过。boundary预求解包含在全进程RSS范围内。没有给生产求解器加入该超时或候选截断。
- 自建极端库存Worker样本超过60秒后停止；没有全部48组矩阵、全改造域最坏情形或真实低内存手机认证。大型样本仍约0.75–0.9GiB，不保证低内存设备成功。
- 诊断采样heap不等于真正峰值；Node RSS不等于浏览器Worker峰值。浏览器CDP在结果克隆后观察到的堆和全进程工作集分开记录，不将销毁Target误称为OS已回收同量内存。
- 全局组合器索引/延迟同等图等高风险第二阶段没有擅自重写；保持精确性优先，剩余瓶颈明确留在后续优化范围。

## 提交与回滚

分页独立提交`b1e7387`，导航补充`f1e9e37`；核心、Worker及发布另提交。若需回滚，逆序revert本轮提交，再使用新的递增版本号发布PWA；不要reset工作区或删除个人库存。具体发布SHA和线上状态以最终交付为准。工作簿及无关本地文件不提交。
