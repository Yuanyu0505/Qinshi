# 机关兽 PWA 1.0.55 升级专项预检

日期：2026-10-22。此报告仅记录定向预检，不计入发布要求的连续两轮完整测试。

## 测试修改

- `tests/update-1054-pwa.cjs`：旧版仍取 `d2736ff` 的七个真实文件，新版改取 `a875bdb` 的七个真实文件；版本仍为 1.0.53→1.0.54，保留全部原断言，避免未来工作区版本提升破坏历史专项。
- `tests/update-1055-pwa.cjs`：从 `a875bdb` 读取真实 1.0.54 的四个版本文件及五个机关兽业务文件，与当前工作区 1.0.55 切换对照。其余未变化文件沿用工作区。
- 新专项检查旧版确实不含参考成本控件，通过旧版 UI 保存机关兽研发度／碎片；等待真实新版 SW 安装后点击更新按钮，检查账号与旧存档原文不变；验证来源、材料关卡与成本 UI，再保存神图库存／单价／抵扣开关及手填兽价，并检查全部旧兽字段保持。
- 检查真实成本结果面板可生成，五个新业务缓存正文与工作区完全一致；只清理旧应用缓存并保留无关缓存。离线重载后版本、账号、来源 UI、全部新旧持久化数据与编辑器显示均保留。
- 浏览器使用全新隔离上下文和临时本地服务；请求路由限制同源，无真实账号、生产同步服务或远端接口操作。

## 执行结果

首次在沙箱内运行两专项，均因 Edge 启动权限失败：`browserType.launch` / `CoCreateInstance of Elevator failed; hr =80070005`；未进入页面断言。不修改脚本或业务，在获准的沙箱外运行同一命令后通过：

```powershell
$env:PLAYWRIGHT_MODULE='C:/Users/pghyl/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'
$env:GIT_CONFIG_COUNT='1'
$env:GIT_CONFIG_KEY_0='safe.directory'
$env:GIT_CONFIG_VALUE_0='C:/Users/pghyl/Desktop/deepseek'
node --test --test-concurrency=1 tests/update-1054-pwa.cjs tests/update-1055-pwa.cjs
```

- 1.0.53→1.0.54：通过，18,037.6523ms。
- 1.0.54→1.0.55：通过，20,994.8345ms。
- 汇总：2 tests，2 pass，0 fail／skipped／cancelled；退出码 0，总时长 42,264.1349ms。

未运行全量套件，未修改生产版本文件，未提交或推送。发布前仍须主流程在固定最终代码和测试脚本上执行连续两轮完整测试。
