# Inscription Route Groups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实施已确认的路线归并、词条分组排序、失败复用精简与搜索命中强调，验证后发布1.0.67。

**Architecture:** 保留规则引擎及完整路线树，新增纯展示分组；界面只切换选中的具体变体，收藏使用原完整路线身份。排序为可复用的展示函数，个人进度仅排序副本。各任务文件互不重叠，可并行实施，最终统一复核。

**Tech Stack:** 原生JS/CSS、Node test、Playwright/headless Edge、GitHub Pages/PWA。

**Spec:** `docs/superpowers/specs/2026-10-29-inscription-route-groups-design.md`

## Global Constraints

- 禁止改变合成概率、合法词条、来源规则、规则签名或旧收藏身份。
- 具体X与符号X分别按实际树处理；概率不表述为全程成功率。
- 文案：`失败品复用1`、`三枚失败材料，同种可重复`、`候选词条池必须覆盖全部目标词条，目前M选N`。
- 分组排序：同属性相邻；组按最高数值降序；组内降序；等值组固定中文属性名排序。
- 用户授权主动测试，一轮全绿后合并master、更新PWA、推送GitHub；保护无关工作文件。

## Review Focus

- 切换组内配料、收藏/取消收藏、重新查询后仍对应正确完整路线，旧收藏可打开。
- 特殊具体X导致路线减少或出现独立洗练时不能套用默认三组或概率。
- 蓝一/蓝二不可辨档位、合法历史词条及异常原文均不被排序写回。
- 320px手机、768/1024px平板下变体控件、长姓名和单图工具栏无整页横溢。
- 蓝二速度不确定结果与不同随机阶段不因分组抹掉区别；复用候选M真实去重。

---

### Task 1: 属性分组排序和个人进度展示

**Files:** `js/inscription-terms.js`、`js/inscription.js`、新的词条单元测试、独立浏览器排序测试。
**Interfaces:** 现有 `InscriptionTerms.sortTerms(terms,quality)` 改为分组排序；可增加带已知数值/原索引的纯排序辅助函数供存档展示使用，原方法返回值不变。

- [ ] 先测试6穿透H/5暴击M/5穿透M输出穿透H、穿透M、暴击M，以及5/4/3速度、等值组、非原地修改、蓝色不可辨与异常历史。
- [ ] 实施共享排序，保存卡与查询当前副属性按副本显示并重新编号1/2/3；编辑和存储保持原顺序。
- [ ] 定向测试转绿，并验证真实保存、重载后存档字节不因显示排序变化。

### Task 2: 概率路线归并、组内切换与连续编号

**Files:** `js/inscription-paths.js`、`js/inscription-crafting-ui.js`、`css/inscription-crafting.css`、路径单元测试、新分组浏览器测试。
**Interfaces:** 在现有Paths导出纯展示分组API，保留每个具体路线原索引/对象。UI只使用原路线收藏，不把组身份替换为收藏身份。

- [ ] 先测试地遁12条被展示为3必中+3概率组，每组3个配料变体；所有12棵树及概率完全保留。
- [ ] 测试具体X、蓝二速度与洗练阶段边界、原顺序变化、空列表、不修改输入。
- [ ] 实施动态分组与界面变体选择；必中/概率各自连续编号，组内变体独立编号；收藏置顶保留原身份。
- [ ] 浏览器实际切换不同图、收藏两个变体、重载和取消收藏，并检查手机/平板布局。

### Task 3: 合阵搜索命中强调

**Files:** `js/formations-ui.js`、`css/formation-search.css`、`tests/formations-search.cjs`。
**Interfaces:** 搜索匹配姓名由独立安全转义元素承载，字号15px、红色加粗；维持现有重复search事件不替换相同DOM的行为。

- [ ] 增加浏览器断言：命中姓名文本、15px/粗体/红色、手机长姓名不越界、原键盘搜索回归。
- [ ] 先观察失败，再实现最小DOM/CSS调整并跑定向测试。

### Task 4: 失败品复用候选数量动态说明

**Files:** `js/inscription-flowchart.js`、`js/inscription-flowchart.test.js`及关联浏览器旧文案断言。
**Interfaces:** 说明M来源于实际children材料的(attr,tier)去重候选池；N来源于产物品质允许词条数。仅渲染，不改复用配方。

- [ ] 增加真实可达复用样例的4选3与其他候选数量测试，确认当前旧文案导致失败。
- [ ] 更改为三行用户文案，序号从1开始；保留当前概率与真实失败连线，不再显示固定投料例子。
- [ ] 更新仅因文案意图变化的旧输出断言，保留合法性与概率断言并转绿。

### Task 5: 冻结验收、复核与发布

**Files:** 既有版本/资源入口文件、验收报告；必要时更新现有浏览器测试适配新变体选择而非弱化断言。

- [ ] 独立复核各任务及全改动；修复重要问题并保留失败回归证据。
- [ ] 将版本入口统一更新至1.0.67；未新增独立运行时文件则无需增加发布依赖。
- [ ] 运行 `node tools/run-tests.cjs unit` 和本次全部相关浏览器测试一轮，无失败/跳过；触控视口模拟不可称实体设备验收。
- [ ] 明确暂存本次文件，提交，快进合并本地master，正常推送HEAD:main，检查Pages成功和线上1.0.67。
