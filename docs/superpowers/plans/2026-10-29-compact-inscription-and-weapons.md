# Compact Inscription and Weapons Implementation Plan

> 执行方式：superpowers:executing-plans，当前会话实施；用户已免除设计/计划重复确认。

**Goal:** 按确认示意压缩铭文流程并录入三把神兵。
**Architecture:** 仅改UI状态转换与流程投影，不改合成概率/需求核心；装备使用独立三绝神兵增量脚本，复用十月数据结构。
**Tech Stack:** 原生JS/CSS、Node test、Playwright回归用例。
**Spec:** docs/superpowers/specs/2026-10-29-compact-inscription-and-weapons-design.md

## Global Constraints
- 用户后续明确授权运行验收与测试，通过后合并、更新、推送；该授权取代此前不主动测试的默认工作约定。
- 不动无关xlsx/图片/缓存，不删除资料；仅提交本任务文件，发布PWA 1.0.71。
- 三绝神兵只有红金属性已知，其他品质留空；3→4双材料、6→7空材料。

## Tasks
- [x] 1. 先补状态切换、节点紧凑布局/同排/连线文字回归用例；修改inscription-crafting-state.js、inscription-crafting-ui.js、inscription-flowchart.js与css/inscription-crafting.css（未执行测试）。
- [x] 2. 新增data/2026-10-three-weapons.js属性/配方，接入首页与离线清单、名称映射与专属说明；补数据回归用例（未执行测试）。
- [x] 3. 单次独立只读审查，修改共享目标概率标签、未知品质对比、旧用例及颜色优先级问题；未运行验证，验收重点见实施记录。
- [x] 4. 授权后运行完整单元、相关浏览器、手机平板横竖屏及真实Pages产物离线/升级验收，查看截图；具体结果见实施记录。
- [ ] 5. 合并master并复测，正常推送main，核对Pages部署与线上1.0.71版本。

## Review Focus
- 改筛选才清空，收藏/历史恢复不被误清；取消切换仍保留原现场。
- 一个共享入口的不同产物必须同排；独立洗练与前序产物不串接。
- 普通操作汇合不增加文字阶段；晋升材料不得连错阶段。
- 失败复用保持真实来源且非互斥材料重复计量；概率和X符号不变。
- 未知品质无伪属性，效果不混入数值过滤；幂等增量、锻造跳转和账号数据保持兼容。
