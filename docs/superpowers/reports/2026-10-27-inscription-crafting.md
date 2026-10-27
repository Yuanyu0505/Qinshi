# 铭文合成路径与模拟实施验收记录

## 范围与授权

用户确认完整方案后直接实施；要求连续两轮完整测试通过再合并本地master、更新PWA、推送GitHub。实现、审查和连续两轮验收已完成，未填写的发布项不代表成功。

基线：df997cdf1fc37a099ce965c03225426b991d7563，PWA1.0.61。
计划：docs/superpowers/plans/2026-10-27-inscription-crafting.md。
设计：docs/superpowers/specs/2026-10-27-inscription-crafting-design.md。

## 已完成的模块证据

- Rules：6d1f74b；50定向、848完整unit通过；独立模块审查无阻断问题。
- Paths/State：04b3fa9；28定向、876完整unit通过。独立审查发现蓝二未知速度在具体材料规划器被精确档位门禁误拦；dcf883f修正，新增2条RED/GREEN，80定向通过，独立scoped复核3项通过。
- UI：7f07a2c；unit878/878，新旧铭文browser26/26，相关广度browser76/76（非完整发布轮）。模块审查发现递归分支/上下文与搜索保留两个问题，1ae42ed修正，新增回归并全新铭文21/21；独立scoped复核通过。
- 整分支独立审查发现旧空属性自由备注可能在校验前丢失，6dab6af修复。真实浏览器三场景RED2fail/1pass→GREEN3/3，新旧铭文31/31通过；最终单一修复波scoped复核通过，无开放项。

## 发布门禁

| 项目 | 观察结果 |
|---|---|
| 冻结版本及运行文件指纹 | 1.0.62；79496fd；144个相关文件SHA256：5224a19606fab16bda356c62b449513af24eda1277b814082abae0ed84bcc881；测试输入另有独立指纹 |
| 连续第1轮unit | 878/878，exit0，失败/取消/跳过/TODO均0 |
| 连续第1轮browser | 25文件共247/247，exit0，失败/取消/跳过/TODO均0 |
| 连续第2轮unit | 878/878，exit0，失败/取消/跳过/TODO均0 |
| 连续第2轮browser | 25文件共247/247，exit0，失败/取消/跳过/TODO均0 |
| 整分支独立审查 | 已完成，I1单一修复波及所有测试夹具scoped复核均通过，无开放项 |
| 本地master合并 | 未执行 |
| 远端main推送及Pages | 未执行 |
| 线上版本及新静态资源 | 未执行 |

正式验收凭据：test-results/inscription-crafting-release-proof.json，以及同名前缀-round1/2-unit/browser.log。四阶段均有开始/结束、exit0，最后status=passed；另行汇总确认两轮各25个browser文件、247项，无遗漏或跳过。测试输入SHA256：72ad285f390fb2d864ae0ad0d6e0be4ec62af7dd4d6d049dfaf2c92aa49afb88。末次运行后重新计算144文件指纹相同。

修复前诊断运行（不计连续正式轮）：unit878/878通过；browser在历史1.0.53→1.0.54测试发现旧首页与当下铭文脚本混用，报Rules undefined duns。根代理独立重跑复现。该历史fixture只固定改动文件，漏掉本次新增依赖的消费脚本；2b64ea1固定对应历史铭文版本，并对1.0.58升级用例补齐old/update/offline无pageerror断言。没有关闭错误检查或跳过历史用例。

安装前置条件诊断：三次6项组合中均5通过/1失败，失败先后为旧58、旧61、旧59首次controller等待；孤立原样复核通过不冒充整批通过。对比稳定旧53/54用例，补齐ready→active activated→受控reload→controller，并验证fromServiceWorker；当前62额外刷新必须保持pending。没有sleep、自动retry或扩大原超时。固定内容最终同批6/6通过，独立fixture审查Approved。只改5个测试文件，不据此推断生产PWA有缺陷；日志和所有失败轨迹保留在SDD报告。

完整验收又在performance-loading的已安装离线用例发现相同账号初始化/安装前置缺口，另检查秘境离线用例也存在；只对两处installed场景补齐，原首次claim/gallery测试不改，两整文件34/34通过。独立审查指出新增ready Promise在没有总testtimeout时可能无界；79496fd改为默认有界等待，真实HTTP503注册失败探针2/2正确TimeoutError进入诊断，正常路径34/34通过，scoped复核Approved。该修正前启动的unit虽878/878通过，browser已停止，均不计正式完整轮。

一次后续前台完整进程因会话中断而没有完整footer、第二轮未启动；核对系统已无测试进程，不以其部分通过计数。保留中断日志，改为单次隐藏后台编排并落盘每阶段开始/结束/退出码；每阶段及最终核对运行资源和全部测试输入指纹。不重试、不跳过，任一非0立即停止。最终表格只填写该末次冻结后真正连续通过的记录。

## 使用入口

- 铭文 → 合成路径查询：选弟子或直接筛遁位，按目标品质选满词条，再查询；分组展开具体路线，材料可继续展开前级准备和多X分支。
- 保存目标后可管理共享实际库存；实际数量表示总数，不会自动把已佩戴铭文当作材料。
- 合成模拟使用独立虚拟库存。模拟结果先待确认；“反复试算”不扣材料，“进入下一阶段/重复当前阶段”才提交一次。不回写实际库存或个人佩戴记录。

## 额外真实浏览器检查

仅隔离localhost测试账户，不操作真实游戏账号或真实云同步空间。

- 首次离线回归RED：当前首页尚未加载新runtime，断言false!=true。记录test-results/inscription-crafting-offline-red.log。
- UI和资产注册后GREEN：真实serviceworker缓存所有新增JS/CSS，离线刷新恢复pending，重抽不改虚拟数量，提交一次并拒绝重复token，实际库存保持原样。1/1、exit0，记录test-results/inscription-crafting-offline-green.log。
- 实际1.0.61升级测试RED：同版本号下旧core缓存仍为1.0.61，命中版本缓存门禁；此为正式升版前的预期失败，不忽略。记录test-results/inscription-crafting-upgrade-red.log。升1.0.62后需要重跑完整升级用例。
- 统一1.0.62后，两项真实离线/升级用例2/2通过，exit0、11.1s。旧账号、铭文异常原文和图鉴值保留；新runtime离线加载，旧61cache清除。记录test-results/inscription-crafting-release-offline.log。
- 首版流程图在390/768/1280宽度均无document横向溢出，13个组均可访问；根代理已检查390/768截图。截图test-results/inscription-crafting-root/path-*.png。正式UI最终截图与测试结果待补。

## 数据保护与实现裁定

1. 继续使用现有checkout功能分支，不移动用户的脏文件；无关Excel、图片、缓存和未跟踪旧测试不暂存、不删除。若工作区另有并行写入，需要检查最终diff；不声称新建了隔离worktree。
2. 真实已有蓝二可标合成来源（来自范围外蓝一合成），不能因为本次模拟从蓝二起就拒绝。否则会漏掉真实可用库存。
3. 紫二合成品不能凭空含低档：紫一无低档且随机补池排除低档；不能只靠切换来源绕过整枚可达性校验。该结论来自用户确认规则的组合推导。
4. 洗练概率与总成本未知，不编造数值，只给已备齐具体材料后的步骤合成概率。
5. 巨大多X组合保留显式参数化入口和具体材料规划器，按需展开；不提前生成所有等价笛卡尔树，也不静默截断路线。若界面隐藏这些入口会构成功能缺失，须浏览器验证。
6. 实际PWA文件名为service-worker.js及js/partition-loader.js，Pages另有显式JS复制清单，均须注册新资源。

## 边界与剩余风险

两轮均使用Windows headless Edge与隔离测试账号，覆盖手机/平板/桌面视口、file://、真实Service Worker离线和历史升级；不等同于iOS/安卓实体设备验收。洗练概率和真实游戏服务端频率未知，只展示已确认的等概率模型，不估算未知洗练总成本。未操作真实游戏账号或生产云同步空间。用户原Excel保留，合并前SHA256为c9b1a23eef8160341bfa7e8f947061fdd866f537156d8099a7747cc0958e4632。
