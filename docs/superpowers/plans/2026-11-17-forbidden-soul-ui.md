# 禁地魂店 UI/UX Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans inline; final fresh-context review.

**Goal:** 在不改资料、计算、筛选、存储协议的前提下，改善奖励分组、保存失败反馈和多设备布局。
**Architecture:** 沿用原事件委托、禁地分批渲染、魂店表格与两类编辑浮层。只在 UI 层增加提交失败回滚与焦点恢复，CSS 按实际容器宽度排布。
**Tech Stack:** 原生 JavaScript/CSS、Node test、隔离 Edge/Playwright。
**Spec:** C:/Users/pghyl/Downloads/Qin_1.1.12_禁地魂店_Codex_UIUX完整执行指令.md

## Global Constraints

- 原始 data、forbidden.js、soul-shop.js、图鉴映射、账号/备份/同步代码不改。
- 历史不显示；同步与跨日语义不改；不新增主题、灵元、弟子类型。
- 损坏禁地存储初始化风险只隔离登记，不修改协议或迁移。
- 用户明确要求测试与合并更新推送，覆盖任务书中的不部署建议。
- 保留已有 Excel 和所有无关未提交文件。未找到上轮 outputs 资料包；以当前真实源码为准，不声称阅读不可用附件。

## Review Focus

- false/throw 写入失败不得留下勾选；用途编辑失败保留草稿。
- 局部替换后触发按钮焦点与滚动应保留。
- 输入法组合输入及子模块切换不得插入过期结果。
- 侧栏后实际卡宽不足时魂店必须转逐弟子布局。
- 排名每分区、贡献每门槛的任选关系不得合并或影响个人需求勾选。

### Task 1: 基线及禁地反馈保护

Files: tests/forbidden-soul-ui-browser.cjs, js/forbidden-ui.js.
- [x] 固定11/17隔离账号，五视口截图、记录数据/筛选/奖励身份。
- [x] 编写 false/throw、只读、用途失败、焦点回归，运行观察失败。
- [x] UI保存检查返回值、失败恢复旧状态、局部更新恢复焦点，浮层约束Tab。
- [x] 运行新增浏览器测试及原纯逻辑测试。

### Task 2: 奖励、工具栏、魂店布局

Files: js/forbidden-ui.js, css/style.css, css/soul-shop.css, js/soul-shop-ui.js.
- [x] 新增贡献/排名任选标记、窄容器布局和中文组合输入断言，先运行确认差异。
- [x] 贡献、排名、普通奖励结构分组，保留配置及身份；工具栏紧凑网格；触控面积和两类浮层适配。
- [x] 魂店复用UI_PERFORMANCE输入队列；内容容器决定卡片列数和表格重排。
- [x] 五视口和过渡宽度截图/实测；与基线比较结果身份和工具栏高度。

### Task 3: 回归、交付、发布

Files: tests, docs/forbidden-soul-ui-1.1.13.md, existing version carriers.
- [x] 全单测、魂店/新增浏览器、PWA测试；隔离异常存储风险报告。最终1171/1174，用户明确授权记录既有3项失败继续发布；浏览器24/24。
- [x] 构造与Pages复制清单一致的实际产物，资源完整性及冷缓存/PWA更新验证。
- [x] 核心文件哈希/diff无变化；版本更新1.1.13，最终独立审查。Important问题已RED→GREEN修复。
- [ ] 仅提交任务文件，合并master，推送main，等待Pages结果。
