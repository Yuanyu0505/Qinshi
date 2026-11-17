# 禁地魂店 UI/UX 实施与发布验收记录

## 1. 工作区与基线

- 基线：1.1.12，master，`2005e8e1824037afc36c5e75c79ba2698d2a9a1b`。
- 实施分支：`codex/forbidden-soul-ui-1.1.13`；版本1.1.13。本轮代码验收完成后，按用户授权合并本地master并推送origin/main；实际提交与Pages状态以Git和Actions记录为准。
- 已完整阅读 Downloads 中的《Qin_1.1.12_禁地魂店_Codex_UIUX完整执行指令.md》，重新核对实际HTML、UI脚本、核心、资料、账号适配器、CSS、Pages清单、PWA与测试。上轮 outputs 资料包不在当前磁盘路径，未声称读过不可用资料。
- 原有Excel修改及 `.playwright-mcp/`、`.pnpm-store/`、`.superpowers/`、用户测试和其他无关未跟踪文件均保留，不纳入提交。

## 2. 问题、方案与风险

| 优先级/证据 | 影响 | 修改位置 | 处理及回归风险 |
|---|---|---|---|
| P0【源码证据，隔离复现】 | 返回false/抛错后仍显示已勾选 | `js/forbidden-ui.js:97` saveNeeds、commitNeeds | 检查写入返回值，只读拒绝；失败回滚完整旧快照并清除缓存；用途失败留草稿。存储协议未变 |
| P0【源码证据，隔离复现】 | 正常账号续租误关草稿 | `js/forbidden-ui.js:916` 权限订阅 | 仅处理当前账号实际可写权限变化，普通续租不重绘、不关编辑器 |
| P0【源码证据，隔离复现】 | DOM替换丢焦点，重复奖励恢复到摘要 | `js/forbidden-ui.js:547–596` | 按期次、原data身份、所属区域恢复；过滤重绘结束恢复。保存用途也等待分批完成；第三张卡的精确焦点已回归 |
| P0【设计建议】 | 排名各分区与普通材料容易混淆 | `js/forbidden-ui.js:326,380` 奖励模板 | 贡献两门槛分开；排名每分区有独立边界及任选1项；普通材料不加任选。SECTION_CONFIG业务字段未改 |
| P1【实测】 | 手机工具栏过高 | `css/style.css` forbidden toolbar/control rules | 保留全部条件，类型单行、操作两列、用途两列；320/390高度减少约82/84px |
| P1【实测】 | 侧栏后卡宽不能只按窗口判断 | `css/soul-shop.css:3,11,34,45` | 实际面板宽度决定期次列数，卡宽决定五列表或逐弟子布局；名称完整换行，设置按钮保持同一行 |
| P1【源码证据，隔离复现】 | 中文输入结束立即整区重绘 | `js/soul-shop-ui.js:62,102,121,127,165` | 复用120ms输入队列和组合输入处理；切换模块取消待渲染；核心筛选不改 |
| P1【设计建议，局部实测】 | 浮层低高度和键盘可达性 | `css/style.css` purpose dialog；`css/soul-shop.css` editor | 动态视口高度、可滚动、44px按钮；禁地Tab循环，取消/保存后焦点恢复。真实软键盘未实测 |

## 3. 文件diff与边界

- UI：`js/forbidden-ui.js`、`js/soul-shop-ui.js`、`css/style.css`、`css/soul-shop.css`、`index.html`。
- 版本：`version.json`、`service-worker.js`、`js/pwa.js`、`js/partition-loader.js`，以及HTML资源查询版本。
- 测试：新增 `tests/forbidden-soul-ui-browser.cjs`；现有 `tests/soul-shop-browser.cjs` 仅增加输入队列等待、将60天一次快进改为3次20天快进，不改变业务期望。
- 新生产资源：无。Pages原复制清单仍覆盖全部运行文件。
- 核心数据、公式、筛选、账号、存储schema、迁移、备份及云同步实现均未改；哈希结果见 `outputs/forbidden-soul-ui-1.1.13/data-artifact-audit.json`。

## 4. 九类交互结果

1. 工具栏：320/390/820/1366/1920及12个过渡宽度无整页横向溢出；全部筛选保留。
2. 期次：本期默认展开、下一期收起；完整列表不含历史；预测结束空状态通过已有测试。
3. 奖励：五视口修改前后全部可见勾选控件data身份和顺序一致；贡献/排名/普通材料保持制度区别。
4. 魂店图鉴：五视口8行默认弟子文本与基线一致；逐弟子属性筛选、徐福映射和缺省神图鉴通过原回归。
5. 两种浮层：五视口已截图；魂店低高度窗口范围、Esc及焦点返回通过；禁地失败留草稿、Tab循环、取消及局部更新焦点通过。320禁地浮层截图发现返回顶部悬浮按钮遮叠，现已限定在用途浮层开启时隐藏该悬浮按钮，覆盖回归通过。
6. 搜索：中文组合输入、延迟更新、切换子模块取消待渲染通过。
7. 勾选：false、throw、只读中途变化均不产生新增假勾选，其他勾选和原存储值保持；正常续租101秒不关草稿。
8. 未来同步：禁地仅本期默认、同系列未来显式同步；魂店同名未来同步默认不勾；取消不写入、两个模块互不影响，通过。
9. 跨日/导航：11/18结束含当日、次日移除；跨年12/31至1/4；魂店精确跳转及返回通过现有测试。未新增模糊图鉴匹配。

## 5. 数据完整性

- 原始禁地45期、魂店16期；固定2026-11-17可见14/15期。
- `data/forbidden.js`、`data/soul-shop.js`、`data/atlas.js`、`js/forbidden.js`、`js/soul-shop.js`、账号/租约/设置/云同步9个文件与基线LF规范化SHA-256完全相同。
- 全部测试使用新建浏览器context与合成测试账号，不读取真实备份或用户库存。需求写入失败前后值逐项对比，未整体清空正常需求。

## 6. 实际截图与尺寸

截图均在 `outputs/forbidden-soul-ui-1.1.13/`；`before-*`为真实改前，`after-*`为真实改后，非结构示意图。

| 视口 | 禁地工具栏高度改前→改后 | 截图名（另有相应soul、purpose、soul-editor） |
|---|---|---|
|320×568|537.28→455.19px|`after-320-forbidden.png`|
|390×844|537.28→453.19px|`after-390-forbidden.png`|
|820×1180|381.09→381.09px|`after-820-forbidden.png`|
|1366×768|175.80→175.80px|`after-1366-forbidden.png`|
|1920×1080|175.80→175.80px|`after-1920-forbidden.png`|

过渡宽度360/520/599/600/640/767/900/1024/1199/1200/1280/1536、窗口高度568实测无整页横滚。未实测真实触屏软键盘、屏幕阅读器、浏览器实际125%/150%/200%缩放，不以视口模拟冒充。

## 7. 测试记录

- `node --test js/forbidden.test.js js/soul-shop.test.js tests/pwa-update.test.js`：33/33。
- `node --test tests/forbidden-soul-ui-browser.cjs tests/soul-shop-browser.cjs tests/pwa-update-browser.cjs`：最终24/24；包括已安装旧PWA发现、应用并切换至新版，以及两项尾项的RED→GREEN回归。
- UI专项16项、魂店既有回归7项、PWA浏览器升级1项。
- `node tools/run-tests.cjs unit`：1174项，1171通过，3项既有失败：
  - `serve.test.js:466` 云同步设置页包含完整手动流程且脚本依赖顺序正确。
  - `serve.test.js:1728` 战匣丹囊个人进度提供弟子搜索、自由新增和固定槽位。
  - `tests/other-reference.test.js:26` every transcribed row retains columns and reachable sources; filtering never mutates data。
- 使用只读preload载入原提交HTML重跑上述失败，失败相同；相关其他资料、战匣、云同步文件无本次修改。用户已明确答复“保留并记录，继续发布”。另一次Git safe.directory环境失败通过仅进程配置排除，不修改全局Git设置。
- 最终Pages清单组装实际目录 `outputs/site-1113-qoOPem`，`checkStaticSite()`核对245引用通过；受保护文件哈希通过。
- 实际产物冷缓存Edge：SW activated，`qinshi-site-1.1.13`缓存存在，魂店正常显示；应用引用资源无404、无pageerror。浏览器额外惯例探测`favicon.ico`返回404，该文件非应用声明资源，未将其误写成“所有网络请求无404”。
- `git diff --check`通过。首次沙箱浏览器/本地服务权限失败，后用独立临时Edge与本地HTTP测试，不触真实账号。

## 8. 尚未实施与独立风险

- 【隔离复现，不在本轮修复】禁地既有初始化流程会将空串、非法JSON、未知schema合成值写成空v2结构。测试结果见 `isolated-storage-risk.json`。按任务书不改存储语义、不清洗真实数据；需独立数据安全修复。
- 【已修复】用途筛选/仅勾选结果超出首批2张卡时，保存用途的焦点恢复早于后续卡插入；现通过渲染完成回调恢复，第三张卡回归已通过。
- 【已修复】320px禁地自定义浮层中返回顶部悬浮按钮遮叠；现仅在禁地用途浮层开启时隐藏该悬浮按钮，保存按钮命中与遮挡回归已通过。
- 【已恢复】前次额外权限审批服务额度限制已解除，本轮两项尾项与发布回归已实际执行。
- 独立审查的正常续租和重复奖励焦点Important问题均已通过RED→GREEN测试修复；过滤失败丢焦点也已补回归。其余真实设备/缩放覆盖不足如实保留。

## 9. 结论与下一步

已实质改善手机到达期次卡的距离、奖励任选辨识、魂店长名称对照、保存失败回显、普通续租草稿稳定性及大多数局部焦点恢复。游戏资料与核心规则保持不变。

用户已授权带既有3项失败继续发布；两项UI尾项已完成修复与验证。仅提交本轮文件，不提交用户Excel、outputs或无关工作；合并本地master、推送origin/main并核对Pages实际结果。真实软键盘、辅助技术与实际浏览器缩放仍保留未实测说明；损坏禁地存储初始化风险继续作为独立事项，不修改持久化语义。
