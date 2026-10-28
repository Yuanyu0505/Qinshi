# 铭文工作流实施计划

**Goal:** 完成已确认的铭文可读性、个人进度、路线收藏、分类及合阵搜索。
**Spec:** docs/superpowers/specs/2026-10-28-inscription-workflow-polish-design.md
**Architecture:** 原生JS与SVG；个人记录适配、路线收藏存储分别独立；主代理整合模式和脚本入口。
**Global Constraints:** 用户自行测试验收；不执行测试、构建、lint或实机。不改用户xlsx及无关文件。不发布。

## 分工及顺序

- 个人进度：js/inscription.js、css/style.css、新记录适配器，兼容旧数据并加入分类。
- 收藏：js/inscription-crafting-ui.js、新收藏模块，独立存储、过滤、星标与置顶；等待主代理模式入口。
- 合阵搜索：js/formations-ui.js、新css文件；主代理补HTML入口和脚本。
- 主代理：js/inscription-paths.js、js/inscription-flowchart.js、js/inscription-terms.js，精简路线、解开共享节点并统一文案/排序；index.html和模式协调器、新弟子数据补丁。
- 所有改动后只读审阅及修正，再暂存任务文件并提交快进合并到master。

## Review Focus

蓝一不进入合成配方；收藏存档是有界可校验的具体树；已收藏失效不可误展示；重复素材数量不混用；合阵编辑切换确认覆盖搜索和原按钮。

## 实施记录

各分工代码已整合。只读审阅提出旧个人进度浏览器用例仍引用已移除输入框、洗练收藏允许隐藏支线，已分别适配/收紧。新增规则/存储/搜索/图示/资料用例供用户运行，未执行任何测试或实机验证。Git提交与本地合并结果以操作记录为准。
