# Realm and Flow Display Implementation Plan

> 使用superpowers:executing-plans在当前会话实施；沿用原工作区专用分支，不新增worktree。用户已免除重复设计确认。

**Goal:** 收窄秘境强调范围，纠正铭文汇合和结果分支语义并减少无关交叉。
**Architecture:** 秘境仅改渲染格式；SVG保留Model.project数据，仅调整布局与折线投影。
**Tech Stack:** 原生JS/CSS、Node/Playwright回归用例（本轮不运行）。
**Spec:** docs/superpowers/specs/2026-10-30-realm-flow-display-design.md

## Global Constraints
- 不执行测试、构建、lint或浏览器验收；提交仅本任务文件，不触碰工作簿、图片、缓存。
- 不改概率、需求量、库存、收藏、数据结构或PWA版本；只合并本地master，不推送。

## Tasks
- [x] 1. 先补秘境数字颜色/字重和流程汇合/概率/避障回归用例（未运行）。
- [x] 2. 方案/资料参考分别使用语义明确的数字格式，不改其他秘境来源强调。
- [x] 3. SVG同批材料共用汇合线、结果概率按入口定位、独立准备避障；整理依赖排序减少交叉。
- [x] 4. 完成独立只读审查及重要问题处理，按用户指定流程提交并合并本地master；未运行验证，具体边界见实施记录。

## Review Focus
- 共享目标的主合成与复用概率不合并、不互相遮盖。
- 初/中级材料所属批次正确，不能与下一次合成误连。
- 独立洗练与跳层合成线无关，必须绕框而非藏在框后。
- 不为缩小图而复制物理材料、扩大X范围或修改概率。
- 方案0值也遵从强调规则；盖聂/高月各使用自身道具名。
