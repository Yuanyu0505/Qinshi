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

线上发布后需继续核验静态资源HTTP状态、魂店实际点击及ServiceWorker激活；发布结果在本次交付记录中说明。原有Excel和无关文件未提交。
