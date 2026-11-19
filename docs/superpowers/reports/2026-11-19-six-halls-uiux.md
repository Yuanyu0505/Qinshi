# 六堂UI/UX专项优化交付

日期：2026-11-19。基线：1.1.37 / df59b51。分支：codex/six-halls-uiux-20261119。

本次仅本地修改，未提交、合并、推送或升级PWA版本。依据用户任务书增量适配现有17项目录、名称搜索及自定义排序，没有覆盖1.1.34旧快照。用户已明确授权六堂专项隔离验证。

## P0 / P1 / P2修改清单

| 级别 | 证据与改动 | 必要性、风险与验证 |
| --- | --- | --- |
| P0 | js/six-halls-ui.js:464，load后仅恢复halls/reference公开页的位置；原控制器load保持原样 | 已复现控制器load将升级资料切回个人进度。只保护非敏感展示态，原私人规划仍重置；单独回归、跨账号/只读/读写失败验收通过 |
| P0 | js/six-halls-ui.js:304，结果重绘前记录按堂ID展开态；输入占位更新前也记录；load先清Map及旧结果DOM | 已复现修改目标后未解锁步骤被收起。只保存内存展示态，不持久化；错误结果仍清除旧有效总数，重新加载不带旧展开态 |
| P0 | 保留parkSixHalls、ready/request序号、旧hash、控制器/输入节点和图片白名单，不改全局路由 | 后台成功/失败重入、表单identity、旧链接及历史返回均实测；未重建进度表单，不新增Loader |
| P1 | css/six-halls.css:56、175，四子页按实际容器排4列或2×2，堂口6列或3×2 | 320px不再把四字按钮挤成两行；逐页实测所有可见控制目标≥44px；局部specificity修复父层42px覆盖，不改全站按钮 |
| P1 | js/six-halls-ui.js:345、css/six-halls.css:24，加成表增加colgroup固定进度列；正文完整自然换行、最大行长960px、名单中性完整显示 | 解决小屏左列占据过多宽度；五档截图及六堂全文/名单顺序逐项核对通过，无正则改写原文 |
| P1 | js/six-halls-ui.js:242、css/six-halls.css:104，去装饰序号、简化重复字段说明，个人输入在卡内自适应并列 | 1/2/3列六卡保持一致；输入ID、label、aria及事件属性保留，进度保存、坏值、只读、焦点/草稿回归通过 |
| P1 | js/six-halls-ui.js:308、341，规划首行合并堂口和当前等级；总缺口数字/边框突出，去重复“充足/不足”长句 | 所有需求、库存、缺口、剩余数及限制信息保留；共享库存仍只扣一次。验收改为检查缺口数字和颜色，而非要求已删除的重复说明 |
| P1 | css/six-halls.css:187，小屏50步表改为紧凑两列键值网格，大屏保留完整表格 | 全部六字段、累计从0起和门槛保留，筛选输入不重建；50步、范围筛选、重置及累计值实测通过 |
| P2 | 六堂主题色只重点强调当前堂口，统一卡片间距、平面背景和次级信息 | 避免装饰竞争；仅修改六堂及其外层专属返回按钮选择器，无共享CSS或器灵样式改动 |

## 代码差异

生产代码仅两个文件：

- css/six-halls.css：named container queries、加成列宽、四子页/六堂导航、表单网格、缺口强调、升级资料紧凑卡。
- js/six-halls-ui.js：首次模板精简、结果展开态与公开资料视图位置保护、必要状态的定点更新。createController及写入机制未修改。

相关测试更新：tests/six-halls-browser.cjs、six-halls-acceptance.cjs修复异步目录入口等待；acceptance适配已取消的独立主导航及新卡片呈现；embedding离开目标由已移入其他资料的设置改为锻造。新增tests/six-halls-uiux-browser.cjs。

未修改：data/six-halls-reference.js、data/six-halls.js、js/six-halls.js、六张来源图片、其他资料UI/数据/CSS、主路由、加载器、账号/备份/同步/租约及PWA文件。核心控制器源码前缀与基线逐字相同，证据见数据不变量.json。

## 数据不变量

- 30条加成及99人名单、堂口顺序及归属未变，名单数17/16/17/16/17/16。
- 烈山40原文仍为：我方场上单位的六堂种类，每有1种全体提升2%伤害增幅和1%单级闪避。
- 50步数据、上限50、每堂904七星珠草/435本堂信物未变；门槛10/20/30/40/50对应玩家50/59/69/79/89。
- 存储键仍为qinshi_six_halls_progress_v1，无新存储键或格式。
- 六图路径和SHA-256匹配原白名单，三个核心/资料文件与修改前哈希一致。

## 实际验证

Node、Playwright/headless Edge，仅访问隔离本地服务和测试账号；未读取或操作真实账号。

| 检查 | 结果 |
| --- | --- |
| 六堂资料/核心/控制器/枚举基线 | 52/52通过 |
| 六堂与发布资源最终单元组 | 57/57通过 |
| 六堂浏览器完整组（四份文件） | 39/39通过，约116秒 |
| 全文/名单/全部原图重试及焦点、旧链接/历史/停放identity补充组 | 2/2通过 |
| 五档四页截图与公开模式/展开态/窄容器/缩放/目录及器灵独立样式组 | 单独复测9/9通过（与完整组有重叠，不重复累加） |
| 其他资料扩展单元组 | 64/65通过，1项既有来源路径断言失败，见下 |

主要命令（配置PLAYWRIGHT_MODULE至本机bundled Playwright后运行）：

```powershell
node --test js/six-halls.test.js js/six-halls-ui.test.js js/six-halls-exhaustive.test.js tests/six-halls-reference.test.js tests/release-assets.test.js
node --test --test-concurrency=1 tests/six-halls-uiux-browser.cjs tests/six-halls-browser.cjs tests/six-halls-acceptance.cjs tests/six-halls-embedding-browser.cjs
```

原有浏览器测试曾因“目录脚本尚未加载就执行isVisible、跳过点击”大量超时；本次修正测试等待，已完整重跑。该中间运行已停止，不把超时计为最终通过。原验收还要求已移除的主导航和重复提示，已按当前入口及缺口数据改写相应断言。

唯一保留失败：tests/other-reference.test.js的“every transcribed row retains columns and reachable sources; filtering never mutates data”，assert.ok(table.sourcePaths.length)。用git show HEAD读取修改前数据与UI重建，基线同样存在elements-wood-mappings空sourcePaths；本次不修改此分区或资料。证据：outputs/six-halls-uiux-other-reference-baseline.txt。

独立只读审查无Critical/Important，指出缺口边框specificity和触控断言只在最后子页执行两项Minor；均已修正，并改为四子页逐页测量。

## 截图与实测边界

outputs/six-halls-uiux-20261119/index.html提供真实前后对照。320×568、390×844、820×1180、1366×768、1920×1080各四页，前后40张；390原图弹窗前后各1张，共42张。截图为隔离浏览器实际渲染，不是示意图。缩略图只展示顶部，点击可看完整图片。

已测横屏844×390、桌面容器缩窄、CSS布局缩放125/150/200%。CSS zoom模拟不等同原生浏览器页面缩放；真实设备软键盘、原生浏览器缩放、Codex外层应用侧栏开合未实测，不宣称通过。未运行全站回归。

## 回滚

随包六堂UI修改.patch仅包含两个生产文件的改动，可先备份当前工作区，再以git apply -R --check检查逆向补丁。检查失败应停止并人工处理重叠，勿使用reset --hard或覆盖无关修改。实际执行逆向补丁需用户明确要求；本次未执行任何回滚或删除。

原有Excel及其他未跟踪文件均保留。版本仍1.1.37，本次未提交/合并/推送发布。

## 发布补记：1.1.38

用户随后明确要求“合并提交发布”，本次据此将上述六堂UI改动及专项测试纳入发布，并统一更新五处PWA版本资源至1.1.38。原交付截图仍为同一布局的1.1.37本地快照。仅合并本任务文件，不提交Excel及其他无关工作区内容；上述既有来源路径测试失败继续保留记录，不修改游戏资料或计算逻辑。
