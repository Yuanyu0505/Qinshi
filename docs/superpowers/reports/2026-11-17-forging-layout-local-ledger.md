# SDD ledger — plan: docs/superpowers/plans/2026-11-17-forging-layout-local.md

- Base e061317 / 1.1.22；本地分支codex/forging-layout-local，保护用户Excel和无关输出。
- Pre-flight: Task1→Task2均复用equipmentHtml、progressSummaryHtml和同一CSS/事件委托；无接口冲突，使用当前已有details和上下文key，不替换业务状态。
- Ruling: 用户提供直接执行任务书且只要本地合并，不再重复设计确认；沿用原生模板，不升版本、不修改PWA或线上。代价：要上线需另行发布。
- Task 1: complete — 五视口八场景基线；代表性卡头、品质文字、管理分组、金光降噪测试RED→GREEN；原草稿/details回归通过。
- Task 2: complete — 材料清单与工具栏RED→GREEN；390双列密度补测RED→GREEN；全部名称、品质、数量和阶段保持原样。
- Task 3: complete (verification) — 完整浏览器24/24、图鉴补测1/1；245资源、40保护文件、20原样函数、2仅UI防护函数、3宽度共享样式探针；单测1179/1173/6同基线。
- Ruling: 不重做已修复的15px总览/2px边框；不重引入用户回退的1.1.21素材表重排。代价：保留必要局部横滚。
- Ruling: 材料汇总使用原导航菜单按钮并新增必要品质文字，避免只靠颜色；不改业务汇总。代价：390px下长名称可能换行，但不省略字段。
- Final review: review_forging_layout_local，独立只读；Critical0、Important2、Minor0。
- Final: fixed 桌面sticky装备首列被透明行背景覆盖 — 实测透明断言失败后限定非首列透明，RED→GREEN，完整24/24。
- Final: fixed 测试依赖未跟踪before快照 — 全新evidence目录ENOENT复现后增加API输出fallback，RED→GREEN；正常冻结基线比较保留。
- Final: fixed 新增草稿补测发现DOM移除触发change意外保存 — 记录浏览器事件链后加入仅DOM替换期间的UI标记，草稿/选区/正常改名与排序回归通过；不改load/save。
- Ruling: 全量6项旧失败在基线与修改后相同，保留并报告，不改无关断言。代价：全量测试仍非全绿。
- Ruling: 审查未实测真机IME/软键盘等 — 用事件/触摸/低高度/CSS缩放模拟覆盖可测部分，不宣称真机通过。代价：真机特性仍需用户验收。
- Ruling: 审查未判断真实账号/生产 — 文件边界、单元测试及隔离故障注入保护账号语义；生产明确不执行。代价：无真实账号端到端结论。
- Ruling: 审查未评价Excel及其他输出 — 不在本次范围，全部保留。
- Deferred minors: 无；未测项详见验收报告。
