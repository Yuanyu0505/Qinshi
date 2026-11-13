# SDD ledger — plan: docs/superpowers/plans/2026-11-13-other-reference-1.1.0.md

- Baseline: master599ef04/1.0.100，新分支codex/other-reference-ui-1.1.0；用户Excel原修改及无关文件保留。
- Pre-flight: Task1冻结tablesFor输出，Task2只消费并纯展示，Task3只改版本资源身份；不增添新脚本、不改源数据。
- Ruling: 用户已有完整实施方案且要求按推荐自主执行，因此不重复询问设计/执行方式；本次原生内联实施，最后独立审查。
- Ruling: 本包明确要求实际浏览器与数据验收，覆盖AGENTS默认由用户测试；执行隔离测试，不使用真实用户数据。
- Ruling: 复用当前checkout与功能分支，不新建worktree；显式暂存避免夹带用户资料。
- Task1: pending，上一轮导出已复现搜索后首次点击dialog.open=false、img无src；本轮将自动化固定复现。
- Task1: complete，三档首次点击RED→GREEN，search change不重绘按钮；冻结970行hash、25+3 JSON/CSV及31原图全部通过，无重复asset。
- Task2: complete，九区分组、数量语言、43人163来源、容器速度行、等级与弟子时间线、援助技能、来源降级及partial显式；定向7/7、后续40项+IME1项通过。
- Review: 独立只读审查无Critical/Important，两个收尾项均补RED→GREEN：清除快捷等级防止同级重选失效、查看器文件名次级化。
- Ruling: 审查将快捷等级残留定Minor，但会阻止同级重选，按功能回归纠正；次级文件名本就是本阶段要求，一并补齐，不延后既定需求。
- Ruling: 真实菜单缩放/物理真机不可由当前headless验收证明，记录等效CSS视口和DOM中文组合事件的范围；不把未测内容称通过。
- Task3: 版本统一1.1.0。全量单元首次发现loader还用旧资源身份，补齐后1162/1162通过；实际599ef04/1.0.100→1.1.0更新及离线账号保留通过；40浏览专项+1IME通过，准备合并复验。
- Task3: complete，代码1fb32c7已快进合并master并推送main；合并后再次完整单元1162/1162、统一浏览41/41通过，无取消/skip。Pages43357394874成功；线上1.1.0、12关键文件与31原图逐字节/哈希一致。27张三端九区截图和详细验证记录已提交。
- Final: 未遗留Critical/Important或延后的Minor；不将既有partial资料伪装已核定。物理真机、真实浏览器菜单缩放和系统输入法仍未声称通过，范围及理由见1.1.0-verification.md。
