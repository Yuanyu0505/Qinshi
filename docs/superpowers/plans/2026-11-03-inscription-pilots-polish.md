# Inscription and Pilots Polish Implementation Plan

> **For agentic workers:** Use executing-plans inline for inscription and dispatching-parallel-agents for the independent pilots domain. User latest explicitly authorizes tests before release. Do not wait for redundant design approval.

**Goal:** Repair same-material stock references and compact the simulator flow, then simplify the pilots interface per screenshots.

**Architecture:** Normalize only invalid reserved references against identical available stock; retain lot provenance. Merge equivalent recorded leaves in display projection only. Reuse existing global button styles and hide unfiltered pilot results in UI without changing the search core.

**Tech Stack:** Vanilla JavaScript/CSS; existing Node/browser tests.

**Spec:** docs/superpowers/specs/2026-11-03-inscription-pilots-polish-design.md

## Global Constraints

- 用户最新要求主动运行完整测试，一遍全部无误后才合并发布。使用隔离测试账号，不操作真实存档。
- 不改变铭文概率模型，不删除背包/历史或无关 Excel。
- PWA1.0.77；本地 master，远程 main。

## Review Focus

- 旧 ref 不足与同款新批次，不能挤占合法占用或超用库存。
- 自动修复不能把手动补充伪装成模拟来源，不能改 pending 历史或 undo 快照。
- 实录图合并后数量和制作需求不变，不合并不同配方。
- 全部默认不渲染，非默认分类/搜索可显示，清空恢复初始空白。
- 指定备注精确删除，正文技能条件和其他备注保留，所有输出仍转义。

### Task 1: 铭文库存、材料卡和实录
- [x] 先补充失效引用、真实不足、清空、同款实录投影与素材标签用例并运行 RED/GREEN。
- [x] 实施引用修复、清空操作和响应式居中卡片。
- [x] 投影合并同款材料、补齐洗练素材连线数量。

### Task 2: 机师页面
- [x] 更新用例：默认空白、筛选/搜索、按钮说明、徽标、正文分段和精确备注删除。
- [x] 精简展示与样式，保留数据检索语义及转义。

### Task 3: 交付
- [x] 独立只读代码审查；完整单元1041/1041、浏览器336/336；手机/平板模拟回归通过。
- [ ] 更新版本，提交，合并 master，推送并只读确认发布版本。
