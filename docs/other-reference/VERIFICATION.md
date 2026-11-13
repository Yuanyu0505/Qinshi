# 1.0.100 其他资料 · 验证记录

> 最终复验（2026-11-13）：原始单元入口1161/1161通过；整站52个浏览器文件逐文件运行、失败修正重跑后492/492通过。以下保留首轮排查的历史原始结果；最新根因、日志与通过结果见[RELEASE_FIXES.md](RELEASE_FIXES.md)，不是通过忽略失败放行。

日期：2026-11-12。均使用隔离浏览器上下文、临时本地服务和测试账号，未读取或清空真实用户存储。包内本次明确要求测试，按本次授权执行。

## 本次专项（全部通过）

| 检查 | 结果 | 本地完整日志 |
|---|---|---|
| 数据/交互/触控/11类视口/三档等效缩放/PWA离线/发布资产 | 27通过，0失败 | test-results/other-reference-final.log |
| 旧图鉴/查询/锻造/账号纯核与PWA、服务端资源集成 | 206通过，0失败 | test-results/other-reference-integration-final.log |
| 31张图SHA-256 | 与原始清单一致 | 纳入专项 |
| 单独触控复现与修正 | 旧CSS导致页面128%（失败复现）；新CSS页面100%、图片缩放/平移通过 | 会话工具输出 |

视口：320×568、375×667、390×844、430×932、768×1024、820×1180、1024×768、1280×720、1366×768、1440×900、1920×1080。125%/150%/200%使用等效CSS视口，不冒称浏览器菜单缩放；没有物理真机验收。

主要行为：九区进入/返回、中文搜索焦点、来源跨表查询、品质筛选、十级区间、黄金联赛区间相交、两版速度草稿隔离、原图打开和Escape/按钮关闭/焦点返回、双指缩放和单指平移、局部横滚、没有localStorage增改。源表列数与来源可达、ID唯一、五行原始合计和卡册120000修订均有断言。

## 完整单元回归（不是全绿）

按项目入口尝试 `node tools/run-tests.cjs unit`，两次均停在未修改的铭文收藏用例组，长时间无进展。第一次重复测试树和第二次卡住子进程在确认PID后停止，使后者继续其他文件；该次结果不当作全绿。

最终使用相同全量文件集合、`--test-concurrency=1 --test-timeout=45000` 运行，避免一项无限等待阻断所有剩余文件；统计：**1160项，1150通过、1失败、9超时取消**。日志：`test-results/other-reference-unit-final.log`。

- 失败：`js/machine-beast-equivalents.test.js:54`，`97 to 135 keeps both six-node 647052 alternatives and resets the uncultivated final effects`。预期研发溢出60000，实际59700；其他排序指标相同。本次相关测试及计算源文件均零改动，不借资料库任务修改算法。
- 超时取消均在 `js/inscription-route-favorites.test.js`：write rejection/quota/read-only；unreachable saved recipes；malformed favorite；unknown envelopes；symbolic X round trips；concrete X identity；two concrete tier choices；legacy records rehydrate；three-common targets。每项45秒超时。本次收藏模块、规则和这些用例均零改动，未将超时冒称断言通过。
- 初始测试中的Git dubious ownership是执行账号与仓库所有者不一致；最终用仅当前进程的GIT_CONFIG_COUNT/KEY/VALUE指定safe.directory消除，没有修改全局Git设置。
- 初始发布资产测试确实发现新脚本和原图目录未被Pages显式复制。已补充工作流复制并通过所有发布资产检查，不是留存失败。

## 旧浏览器回归（非通过项保留）

`tests/atlas-ui-browser.cjs`：32项，30通过、2失败。失败断言分别要求库存编辑时装备列表不存在（实际保留1个）、手机离线图鉴tabs为3列（实际1列）。本次 `css/atlas.css`、图鉴模板及库存逻辑未修改；现行1.0.95恢复布局保持不变。日志：`test-results/other-reference-legacy-browser.log`。

`tests/inscription-reference.cjs` 与 `tests/secret-realm-browser.cjs`：35项，22通过、13失败，其中铭文资料4项全通过。秘境测试仍以鬼谷盖聂/第6期为默认上下文；此前1.0.99按用户要求已移除该入口，当前默认千泷高月第2期，导致旧断言和部分编辑前置条件不成立。包含检查文本仍匹配“鬼谷盖聂”、原pack6控件被禁用、既有日期/账号条件断言等。日志：`test-results/other-reference-inscription-realm.log`。本次秘境数据和核心/UI文件与3f33a9c完全相同。

核对 `git diff 3f33a9c -- css/atlas.css js/atlas.js js/inscription-route-favorites.js js/inscription-rules.js js/machine-beast-equivalents.js js/machine-beast-school-planner.js js/secret-realm-ui.js data/secret-realm.js` 无差异。旧模块非通过项没有被删除用例、修改期望或顺带修改业务掩盖。

## 审查与处理决定

- 已独立只读审查，未发现Critical；修复了区间筛选、图片触控、待核对/未提供语义及子表等级草稿隔离。
- 原图逐格核对不能由代码审查替代；分三任务人工转录，具体partial字段记录于DATA_AUDIT并在页面可见。
- 保持“不改旧业务/数据”边界，因此未在本任务追查上述旧算法断言或调整旧布局测试。代价：不能宣称全站回归全绿；这些项需要独立任务处理。
- 发布检查只证明工作流和资源上线，不代替功能测试。实际发布状态在最终回复汇报。
