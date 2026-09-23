# 神·隐虎季布与禁地九月资料更新 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 增加神·隐虎季布相关铭文、装备属性和锻造资料，更新 2026 年 9—11 月禁地预测与奖励，并发布 PWA 1.0.42。

**Architecture:** 保留 Excel 生成数据不变，通过一个幂等的浏览器增量数据文件扩展三份生成数据；铭文业务层负责旧“盾”值向新“遁”值兼容。禁地继续直接维护独立模板和日期数据。

**Tech Stack:** Vanilla JavaScript、Node `node:test`/`assert` 测试文件、Service Worker、GitHub Pages PWA。

**Spec:** `docs/superpowers/specs/2026-09-23-hidden-tiger-forbidden-update-design.md`

## Global Constraints

- 不修改 `秦时相关（更新贯侯钟离昧）20260618.xlsx`。
- 不把 `神隐虎季布` 加入默认常用弟子。
- 不新增隐虎季布图鉴资料。
- 不推算 2026-11-05 之后的禁地。
- 按项目 `AGENTS.md`，AI 不主动运行测试、构建或实机验收；只更新测试约束并列出用户验收重点。
- 完成后合并本地 `master`、发布 PWA 1.0.42、推送 GitHub。

## Review Focus

- 增量脚本重复加载不能产生重复弟子或装备。
- 旧本地进度的 `云盾` 等值必须能映射到 `云遁` 并继续展示。
- 空品质副属性不能被误显示为红金值。
- `神兵影虎`、`神兵·影虎` 和 `影虎` 必须解析为同一锻造族。
- 禁地当前/下一期计算必须能覆盖 10 月下半月及 11 月初新增日期。

---

### Task 1: 增量资料与装备族映射

**Files:**
- Create: `data/2026-09-content-update.js`
- Modify: `index.html`
- Modify: `service-worker.js`
- Modify: `js/equipment-forging.js`
- Test: `js/equipment-forging.test.js`
- Test: `serve.test.js`

**Interfaces:**
- Consumes: `window.INSCRIPTION_DATA`、`window.SPECIAL_EQUIPMENT_DATA`、`window.FORGING_DATA`。
- Produces: 新铭文项、新装备属性项、新锻造项，以及 `神兵影虎 → 影虎` 装备族解析。

- [x] **Step 1:** 先扩展测试夹具和静态页面断言，固定增量脚本加载顺序、三份新增数据和装备族映射。
- [x] **Step 2:** 新增幂等增量脚本，将所有铭文数据值规范化为 `X遁` 后追加三类资料。
- [x] **Step 3:** 在页面原始数据脚本之后加载增量脚本，并加入 Service Worker 预缓存。
- [x] **Step 4:** 在 `FORGE_NAME_ALIASES` 增加 `神兵影虎: 影虎`，保证双向查询使用现有通用解析。
- [x] **Step 5:** 暂不执行测试，记录由用户手动验证。

### Task 2: 铭文术语与旧数据兼容

**Files:**
- Modify: `js/inscription.js`
- Modify: `index.html`
- Modify: `tools/build_inscription.py`
- Test: `js/inscription-performance.test.js`
- Test: `serve.test.js`

**Interfaces:**
- Consumes: Task 1 规范化后的 `X遁` 数据。
- Produces: 全部用户可见“遁位”术语，以及旧 `X盾` 存档到 `X遁` 的读取兼容。

- [x] **Step 1:** 增加静态断言，要求筛选项和业务常量只使用九种 `X遁`。
- [x] **Step 2:** 增加 `normalizeDunName(value)`，把旧后缀“盾”转为“遁”，在本地进度读取和副属性查询前调用。
- [x] **Step 3:** 将业务常量、说明、筛选标签和资料标题改为“遁位”。
- [x] **Step 4:** 更新铭文生成器，使以后从 Excel 重建时直接输出 `X遁`。
- [x] **Step 5:** 保持默认常用名单不含 `神隐虎季布`。
- [x] **Step 6:** 暂不执行测试，记录由用户手动验证。

### Task 3: 禁地预测和奖励

**Files:**
- Modify: `data/forbidden.js`
- Test: `js/forbidden.test.js`

**Interfaces:**
- Consumes: 现有禁地模板、弟子映射和 occurrence 数据结构。
- Produces: 图 3 权威奖励模板，以及截止 2026-11-04 的固定预测表。

- [x] **Step 1:** 更新测试期望，覆盖新增六期 occurrence 与截止日期。
- [x] **Step 2:** 按图 3 逐组核对十个奖励模板；现有值已经一致，无需重复改写。
- [x] **Step 3:** 追加 2026-10-15 至 2026-11-04 六期记录，并更新 `meta.lastDate`。
- [x] **Step 4:** 保持 `蚩魔卫庄`、三个本体空属性以及 `隐虎季布: []`。
- [x] **Step 5:** 暂不执行测试，记录由用户手动验证。

### Task 4: PWA 1.0.42 发布资源

**Files:**
- Modify: `index.html`
- Modify: `service-worker.js`
- Modify: `version.json`
- Modify: `js/pwa.js`
- Test: `serve.test.js`

**Interfaces:**
- Consumes: Tasks 1—3 的全部静态资源。
- Produces: PWA 1.0.42 缓存标识和 GitHub Pages 发布配置。

- [x] **Step 1:** 将所有 `1.0.41` 资源参数和版本常量提升到 `1.0.42`。
- [x] **Step 2:** 确认新增脚本进入预缓存，且 Pages 的递归 `data` 目录发布规则会包含该文件。
- [x] **Step 3:** 暂不执行测试、构建或实机验收，列出用户手动验收点。

### Task 5: 提交、合并与推送

**Files:**
- Commit all files from Tasks 1—4.

**Interfaces:**
- Consumes: 完整功能分支。
- Produces: 本地 `master` 和远端 `main` 上的 PWA 1.0.42。

- [ ] **Step 1:** 检查 diff 只包含本任务文件，不包含主目录个人修改。
- [ ] **Step 2:** 提交 `codex/hidden-tiger-forbidden-update`。
- [ ] **Step 3:** 在主仓库以 fast-forward 方式合并到 `master`。
- [ ] **Step 4:** 推送 `master:main`。
- [ ] **Step 5:** 只进行远端只读版本检查，不执行本地测试、构建或实机验收。
