# Qin 云同步 Worker：仅免费部署手册

本目录是 Qin 跨设备数据同步的 Cloudflare Worker 与 D1 后端。它只同步端到端加密的工具数据快照，不分发网页代码或新增功能。工具代码与功能必须先通过现有 GitHub Pages PWA 更新链路发布；设备确认已经更新到兼容版本后，才可以开始数据同步。

> 当前仓库中的公共配置仍是 `enabled: false` 且 `apiBaseUrl: ""`。本手册不会授权部署；登录、创建数据库、远端迁移和部署都必须等用户另行明确授权。

## 免费边界

云端只允许使用以下两个依赖：

- **Workers Free**；
- **D1 Free**。

以下能力一律禁止启用：**Workers Paid**、**R2**、**Durable Objects**、**scheduled triggers**、**paid add-ons**、**usage-based upgrades**、**auto-purchase** 和 **auto-charge**。不得创建任何其他付费资源，不得把账号切换到付费 Workers 计划，也不得在应用中提供付费升级入口。

应用永远不会自行创建付费资源，也不会提出付费升级。免费额度耗尽或用尽时，处理方式是暂停云同步并提示稍后重试；本地功能和 JSON 备份仍然可以继续使用，不受影响。不得用购买额度或升级套餐来自动恢复同步。

Cloudflare 是第三方平台，其条款、免费额度和定价可能变化。“仅免费”以部署时账号仍处于 Workers Free 与 D1 Free 计划为条件，而不是对第三方永久政策的承诺。未来进入授权部署步骤时，操作者必须先在 Dashboard 人工确认两个资源均显示 **Free**；只要页面不是 Free、要求绑定付费计划或存在任何不确定，就立即停止，不创建、不迁移、不部署。

## 已提交配置与本地机密边界

`wrangler.jsonc.example` 是唯一的生产配置模板。其中：

```jsonc
"database_id": "00000000-0000-0000-0000-000000000000"
```

该全零 UUID 是 **intentionally non-deployable** 的哨兵值，故意保证模板不能直接部署。仓库不得出现真实数据库 UUID、Cloudflare API Token、账号标识、设备令牌、密码、恢复密钥或主密钥。

获得未来部署授权后，才可以在本机执行：

```powershell
Copy-Item wrangler.jsonc.example wrangler.local.jsonc
```

然后只把 `wrangler.local.jsonc` 中的 `database_id` 替换为 `wrangler d1 create qin-cloud-sync` 返回的精确 UUID，不改动其余安全默认值。`wrangler.local.jsonc` 已被根目录 `.gitignore` 忽略；继续前必须确认：

```powershell
git status --short --ignored cloud-sync/worker/wrangler.local.jsonc
git ls-files cloud-sync/worker/wrangler.local.jsonc
```

第一条应显示 `!!`（已忽略），第二条必须没有输出。若 Git 列出该文件为已跟踪或待提交，立即停止。

## 本地安装、迁移、测试与开发

以下命令只操作本地测试配置；首次安装依赖时 `npm ci` 会访问 npm registry，因此只能在允许联网安装依赖的本地环境执行。本仓库已存在依赖时，可直接运行后续离线命令。

```bash
cd cloud-sync/worker
npm ci
npx wrangler d1 migrations apply qin-cloud-sync-test --local -c wrangler.test.jsonc
npm test -- --max-workers=1 --no-isolate
npx wrangler dev -c wrangler.test.jsonc
```

`wrangler.test.jsonc` 只连接本地 Miniflare D1；`--local` 不能省略。测试固定使用单个 worker 且关闭隔离，以符合当前锁定版本的 Cloudflare Vitest 插件能力并避免本地 D1 竞争。

## 本地烟雾验收

在本地 `wrangler dev` 地址依次完成下列流程，并为所有敏感字段使用唯一、可搜索的 canary 文本：

1. `health`：健康检查成功，CORS 只允许配置中的来源。
2. `create`：创建本地同步空间与第一台设备。
3. `pair`：第二台本地设备用密码派生证明配对。
4. `upload`：上传包含示例 `qinshi_` 值的加密快照。
5. `source replacement`：明确选择“来源设备 → 当前设备”，来源完整覆盖当前设备且不自动合并。
6. `keep 3 histories`：连续上传后每台设备只保留最近 3 份历史，加 1 份最新版。
7. `revoke`：撤销设备后旧设备令牌不能再访问。
8. `recovery`：恢复密钥重设密码后旧令牌失效，重新注册设备成功。

覆盖同步的方向始终是 **来源设备 → 当前设备**：来源的整份快照覆盖发起同步的设备。覆盖前，当前设备数据会先成为当前设备最新的历史；每台设备最多保留最近 3 份历史，不按字段合并，也不自动猜测方向。

完成流程后导出本地 D1，检查服务端只保存密文、摘要与必要元数据。先在已忽略的 `.wrangler/qin-cloud-sync-smoke-canaries.json` 中写入本次烟雾流程实际使用的五个一次性假 canary；只使用明显虚假的验收值，不要放入个人密码或其他真实凭据：

```json
{
  "deviceName": "FAKE_SMOKE_DEVICE_NAME_本次唯一值",
  "qinshiValue": "FAKE_SMOKE_qinshi_VALUE_本次唯一值",
  "password": "FAKE_SMOKE_PASSWORD_本次唯一值",
  "recoveryKey": "FAKE_SMOKE_RECOVERY_KEY_本次唯一值",
  "deviceToken": "FAKE_SMOKE_DEVICE_TOKEN_本次唯一值"
}
```

导出后运行仓库内的无依赖校验器：

```bash
npx wrangler d1 export qin-cloud-sync-test --local -c wrangler.test.jsonc --output .wrangler/qin-cloud-sync-smoke.sql
node scripts/check-smoke-export.mjs .wrangler/qin-cloud-sync-smoke.sql .wrangler/qin-cloud-sync-smoke-canaries.json
```

脚本必须以状态码 0 完成并显示“未发现已知明文 canary”。单独对 SQL 文本执行 `rg` 不足以完成验收，因为 SQLite 会把 BLOB 导出为 `X'...hex...'`，而字段还可能包含 Base64 或 Base64URL 编码。校验器会检查原始 UTF-8 文本、解码后的十六进制 BLOB，以及文本和 BLOB 中的 Base64/Base64URL 内容。

已知明文 **device name**、示例 **`qinshi_` value**、**password**、**recovery key** 和 **device token** 任一出现时，脚本会以非零状态退出，只报告安全分类和编码位置，不打印 canary 值；此时禁止继续部署。`.wrangler/` 已被忽略；检查完成后无需提交 SQL 导出或 canary 清单。

## 未来获得授权后的安全生产顺序

下列顺序不能合并、提前或跳过：

1. **登录、whoami 与 Free 计划检查**：执行 `npx wrangler login`、`npx wrangler whoami`，再在 Dashboard 人工确认 Workers Free 与 D1 Free；不满足即停止。
2. **创建 D1**：执行 `npx wrangler d1 create qin-cloud-sync`，记录命令返回的数据库 UUID；不创建 R2、Durable Objects、scheduled triggers 或其他资源。
3. **生成忽略的本地配置**：复制模板为 `wrangler.local.jsonc`，只替换 `database_id`，并用 `git status --ignored` 与 `git ls-files` 验证它没有被提交。
4. **执行远端迁移**：先执行 `npx wrangler d1 migrations apply qin-cloud-sync --remote -c wrangler.local.jsonc`，核对目标数据库名称后才确认。
5. **部署向后兼容 Worker**：执行 `npx wrangler deploy -c wrangler.local.jsonc`；此时保持既有最低读写版本，不提前抬高写入门槛。
6. **公网健康、CORS 与仅密文检查**：验证 `/v1/health`、允许与拒绝来源、创建/配对/上传/覆盖/撤销/恢复，并确认 D1 中不存在上述五类 canary 明文。
7. **后续配置 PWA API URL**：只有 Worker 公网验收通过后，才在后续独立发布任务中设置公共 API URL、启用客户端并发布 PWA；云同步只同步加密的工具数据快照，PWA 更新负责分发代码和功能。
8. **最后提升最低写入版本**：公网 PWA 更新完成且兼容版本验证通过后，才按需提高 Worker 的 minimum write version，避免旧客户端覆盖新字段。

任何一步失败都停止在当前步骤。不要为了“先跑起来”而启用付费能力、公开真实配置、跳过密文检查或调换 Worker 与 PWA 的发布先后顺序。

## 故障与恢复原则

- Worker、D1 或免费额度不可用：只暂停云同步；本地数据、本地查询和 JSON 导入导出继续工作。
- 远端迁移或部署失败：不启用 PWA 公共 API 配置，不抬高最低写入版本。
- 同步覆盖失败：客户端使用本地回滚副本恢复，云端不可见的临时上传不得替代已有最新版。
- 免费政策发生变化：保持服务关闭或迁移到新的免费方案；不得自动接受付费条款。
