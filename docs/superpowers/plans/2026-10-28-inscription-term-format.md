# 铭文词条显示 Implementation Plan

> **For agentic workers:** Inline execution; no repeated approval or proactive verification per user/project instructions.

**Goal:** 全部铭文词条统一数值前置、全角圆括号档位和按品质加粗着色。
**Architecture:** 新增 InscriptionTerms 展示层供 HTML/原生选项/SVG 共用；规则与数据结构不变。
**Tech Stack:** 原生 JS/CSS/SVG。
**Spec:** docs/superpowers/specs/2026-10-28-inscription-term-format-design.md

## Global Constraints
- 不分档 U 与不可辨档 ? 分开显示和处理。
- 保留系统下拉，不改选项值/数值编辑约定，不改历史存档。
- 不执行测试、构建、lint 或实机验收，不宣称通过。
- 保留无关工作簿及文件，不自动发布本次尚未授权的外部更新。

## Review Focus
- SVG 折行需保留各段品质色/字重，括号保持普通字重，文字描述不能变成 object。
- 已保存数据无明确数值/合法档位时不猜档；不同品质从铭文本身读取而不是弟子品质。
- 原生下拉只插入纯文本，不能把 HTML 标签写入 option。
- 新模块在页面和 CommonJS 中的依赖顺序、SW 与 Pages 注册完整。

### Task 1: 共享格式与 HTML
- [x] 新建 js/inscription-terms.js：describe/plain/html/savedHtml/valueHtml。
- [x] 替换 crafting UI 与 inscription.js 各展示入口；补充编辑预览及主属性无档显示。

### Task 2: SVG 与资源
- [x] SVG terms 返回结构化分段，折行保留段标记；数值属性段加粗彩色，档位普通字重。
- [x] CSS 分开深色页面和白色 SVG 的品质色，注册新模块资源，版本号不升。
- [x] 只读审查后交付本地修改和人工检查重点，不运行验证流程。
