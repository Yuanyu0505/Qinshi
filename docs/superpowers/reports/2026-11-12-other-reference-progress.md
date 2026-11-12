# SDD ledger — plan: docs/superpowers/plans/2026-11-12-other-reference.md

- Spec: assets/other-reference/sources/04_实施与验收/Codex_完整执行指令.md，用户直接要求严格实施。
- Pre-flight: Task 1产生统一只读表契约，Task 2纯读取；Task 3校验静态路径与来源清单。资料文件互不共享写入状态，三个转录任务分别修改唯一数据文件。
- Ruling: 复用当前checkout并使用codex/other-reference-library功能分支，不创建新worktree，保护用户Excel与其他未提交文件；代价为需要显式逐路径暂存，已执行。
- Task 1: complete，31图片哈希、九区、28条五行、确认卡册值、表列数/来源、不可变筛选测试由缺文件失败转为通过；49原资料表807行，六节攻略，另163行来源浏览索引。
- Task 2: complete，新模块缺入口时浏览测试失败；实现后11视口、三档等效缩放、中文焦点、独立草稿、来源、只读、触控和离线验证通过。
- Final: fixed 审查区间问题 — matchesLevelBand缺失RED→GREEN，覆盖70–100相交；器灵待核对名称独立断言。
- Final: fixed 双指手势 — 旧CSS实际CDP手势使页面128%（RED），新CSS页面100%且图片缩放/平移（GREEN）。
- Final: fixed 子表等级草稿隔离，作为同一筛选状态契约保存band；未遗留该小项。
- Task 3: 代码与验证完成，Pages遗漏新脚本/原图先失败后修正；最终专项27/27、相关集成206/206。全量与旧浏览器非通过项完整列于docs/other-reference/VERIFICATION.md。按finishing-a-development-branch的失败门槛，合并发布暂停，已请求用户允许保留并记录既有失败后发布。
- Ruling: 不为使旧用例全绿而修改旧算法、图鉴恢复布局或盖聂秘境移除要求；代价为1个旧断言失败、9个旧超时取消及旧浏览器不兼容断言留存，已向用户说明。
- Ruling: 125/150/200%按等效CSS布局视口测量，而非物理真机/浏览器菜单缩放，文档和最终报告明确区别。
