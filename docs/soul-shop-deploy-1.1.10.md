# 1.1.10 魂店漏发布修复

## 已复现根因
2026-11-17经用户明确许可，使用全新隔离Edge浏览器上下文和仅本地测试账号访问线上1.1.9（不接触用户真实账号）。实际观测：
- js/soul-shop.js及js/soul-shop-ui.js均HTTP404。
- window.SOUL_SHOP_UI为undefined，点击魂店后soul-shop-panel不可见、forbidden-main-panel仍可见。
- 原因是pages.yml使用手工脚本白名单复制到_site，遗漏两个新JS。源代码存在不代表发布产物包含。ServiceWorker预缓存同样要求这两个文件，404会使install失败；只修改注册恢复不能解决漏资源。

## 修改
- 发布复制清单补齐两JS。
- 上传前运行tools/check-static-site.cjs，针对_site而非源码检查index.html、PWA预缓存列表、懒加载脚本引用；有缺失则停止发布。
- 版本/PWA更新为1.1.10，保留1.1.9注册恢复及启动保护。不改变魂店资料、勾选、账号存储或其他业务。

## 验证范围
本次用户临时允许隔离浏览器复现。魂店专项tests/soul-shop-browser.cjs已实际运行，6/6通过，含320/820/1440宽度、切换、勾选、未来同步、设置弹窗、图鉴往返、编辑权与异常数据保护。未运行全站单元测试或lint。

线上发布后已实际核验（全新隔离浏览器、本地测试账号）：390和1366宽度下，两份魂店JS均HTTP200；SOUL_SHOP_UI为object；点击魂店后魂店可见、禁地隐藏，显示2期，勾选太子燕丹成功保存到独立键。两种宽度均无pageerror，ServiceWorker为activated，手动检查更新显示当前已是最新版本1.1.10。

发布代码90f3eb3b82e873b3bcb5ebf00d11604d367fc319已合并master并推送main；Pages任务44007130411完成success，新增Check static resource completeness步骤也为success。后续文档提交不改变已验收的运行资源。

隔离截图位于outputs/soul-shop-1.1.10-online-390.png及outputs/soul-shop-1.1.10-online-1366.png，复现前截图outputs/soul-shop-deploy-1120-before.png。原有Excel和无关文件未提交。

检查器范围为当前HTML/PWA/loader字符串字面量引用，不是任意JS动态依赖、CSS url或manifest内部引用的完整解析器；未来变更这些格式时应同步检查器。
