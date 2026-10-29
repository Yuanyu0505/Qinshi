# Sync Pairing Recovery Implementation Plan

> 当前会话按executing-plans执行；用户已确认方案与主动测试/合并发布，无需重复确认。

**Goal:** 修复已配对却显示加入表单、同步入口消失及失败进度滞留。
**Architecture:** 协调层只读本地摘要；UI分离配对与连接状态、本地先行渲染；远端刷新去重并核对配对身份；失败路径只恢复本地界面。
**Tech Stack:** 原生JS/CSS，Node test、Playwright Edge、本地隔离HTTP桩、PWA。
**Spec:** docs/superpowers/specs/2026-10-29-sync-pairing-recovery-design.md

## Global Constraints
- 不碰用户工作簿/图片/缓存，不操作真实云端空间，不改变加密/认证/覆盖确认协议。
- 本地摘要不包含token/主密钥；不可凭网络错误清配对；未知本地状态不可显示可加入表单。

## Tasks
- [x] 1. 在cloud-sync.test.js补本地摘要/离线初始化/未知状态/重试/失败进度回归并观察RED。
- [x] 2. 修改cloud-sync.js、index.html、settings.js，恢复明确入口与状态；定向GREEN。复用现有响应式CSS，无需改样式文件。
- [x] 3. 隔离浏览器模拟移动与平板，覆盖Windows来源及失败恢复；独立复核，修复重要问题。
- [x] 4. 完整unit（967项）和同步/秘境/移动布局/PWA相关浏览器（76项）通过，版本统一1.0.70；进入用户已授权的合并/发布阶段，部署结果在会话中核对。

## Review Focus
- 刷新期间跨标签页配对撤销/切换，本地身份与云端旧响应不同不得显示旧空间。
- 只读获取状态不触发create/pair/上传/下载/覆盖，不泄露秘密。
- 首次上传失败仍保留已配对状态；设备无快照不伪装可同步。
- 失败清进度不能再等待15秒超时重试；已有成功操作与刷新失败分别报告。
- 长设备名、窄屏与恢复提示不遮挡重试按钮；单个元数据校验错误不冒充未配对。
