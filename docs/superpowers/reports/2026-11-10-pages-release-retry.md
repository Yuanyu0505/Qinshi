# Pages 发布重试修复

## 失败证据

- 发布版本：1.0.96，源码提交 `4e8fba8`。
- GitHub Actions run：`42769377333`。
- 首次部署：OIDC 请求返回 `Request timeout`；工作流已经具备 `id-token: write`，因此不扩大令牌权限。
- 第二次部署：同一 run 的两次上传均名为 `github-pages`，部署动作发现两个同名产物后拒绝部署。

## 修复

- 使用 `github-pages-${{ github.run_id }}-${{ github.run_attempt }}` 标识当前尝试的产物。
- 上传 `name` 与部署 `artifact_name` 共用同一个 job 环境变量。
- 保留历史产物，不执行删除；后续外部瞬时故障可安全重跑整个部署 job，不会再次撞名。
- 不更改 PWA 版本、站点内容、业务逻辑、计算规则或本地数据。修复后的提交继续发布已有的 1.0.96。

## 范围与验收

- 按项目规则，不运行应用测试、lint 或浏览器验收。
- 合并前发布状态待确认；推送后将读取 GitHub Actions 实际发布状态及线上 `version.json`，具体结果见任务交付说明。
- 官方输入定义：[upload-pages-artifact v4](https://github.com/actions/upload-pages-artifact/blob/v4/action.yml)、[deploy-pages v4](https://github.com/actions/deploy-pages/blob/v4/action.yml)。
