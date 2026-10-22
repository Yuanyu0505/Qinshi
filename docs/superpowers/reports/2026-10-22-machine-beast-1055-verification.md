# 机关兽参考成本与 PWA 1.0.55 验证发布记录

日期：2026-10-22。基线 `a875bdbb1d95ff36d88faba1deb379548164e2c9`（1.0.54）；开发分支 `codex/machine-beast-reference-cost`。用户本次明确要求连续两轮测试无误后提交、合并、发布。

## 状态

固定最终代码连续两轮全量测试均通过，达到本次发布验证门槛。此报告记录提交前的受测状态；提交、合并及线上部署状态以主分支提交和匹配该提交的GitHub Pages工作流为准。不以预检代替最终轮次。

| 轮次 | Node单元/集成 | 浏览器 | Python | Worker | 总计 | 失败/跳过 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 722/722 | 134/134 | 67/67 | 275/275 | 1198/1198 | 0/0 |
| 2 | 722/722 | 134/134 | 67/67 | 275/275 | 1198/1198 | 0/0 |

受测源代码/测试/配置共157文件，冻结时汇总SHA256：`F91ABA4134552ED78040BFE8A1853816959F91595F9389D7C0E9617D5BACFD78`。文档与测试日志不计入该代码散列。

第1轮结束、第2轮结束再次计算散列均完全一致。两轮顺序为Node→browser→Python→worker，执行进程退出码0；2026-10-22 15:24:00开始，15:42:10完成。无取消或todo。

最终日志为 `round-1-unit.log`、`round-1-browser.log`、`round-1-python.log`、`round-1-worker.log` 和对应 `round-2-*`；Python两轮分别36.022s、36.232s，worker两轮分别14.37s、15.12s。日志保留于本地，不上传真实用户数据。

## 预检与处理

- 首次单元预检：722项，720通过、2失败。其一为测试子进程Git安全目录保护，临时进程级safe.directory配置后恢复；另一为资料链结构断言未包含新增材料来源区块，修正为明确要求包含该区块。未改变业务以迎合断言。
- 修正后单元预检：722/722通过，无失败/跳过。
- 机关兽浏览器专项新增精确单只费用、真实非空多兽流派费用、改价不重求解、360/768px展开设置与两结果、账号所有成本字段隔离、真实备份导入恢复。初次13/13通过，最后加强备份非空fixture后该场景1/1复核通过；最终两轮将覆盖完整最终脚本。
- 历史PWA专项固定1.0.53→1.0.54的真实Git快照；新专项真实1.0.54→1.0.55，定向2/2通过，包括显式更新、新来源/成本UI、旧兽进度及新设置保留、离线、5业务资源缓存正文和无关缓存保留。
- PWA浏览器首次沙箱预检因Edge启动权限失败；脚本未绕过断言，授权沙箱外执行通过。
- Python初次沙箱测试67项，1项临时目录清理权限错误；授权沙箱外同套件67/67通过，未改数据生成器或用户工作簿。
- 云同步worker本地隔离预检：4文件、275/275通过，未部署或接入真实云同步空间。

日志目录：`test-results/machine-beasts-1055-20261022/`，保留所有preflight与focused日志，不计入最终两轮。

## 最终轮次命令

每轮按顺序执行：

```powershell
node tools/run-tests.cjs unit
node tools/run-tests.cjs browser
python -m unittest discover -s tests -p 'test_*.py'
# working directory: cloud-sync/worker
node node_modules/vitest/vitest.mjs run
```

使用Node v24.16.0、已配置Playwright/headless Edge、bundled Python。测试进程设置PLAYWRIGHT_MODULE与临时Git安全目录，worker关闭遥测，不修改全局Git配置。

## 覆盖与边界

- 单只/流派参考成本、来源、标签、库存/价格、账号保存与备份恢复、旧格式读取、异常保存及移动端布局。
- 所有现有Node单元/集成与浏览器套件、Python构建数据测试、Cloudflare worker隔离测试。
- 手机/平板为Windows headless Edge多视口模拟，不冒充iOS Safari或Android真机验收。
- 极大自定义金额超出Number安全范围仍为已披露非阻塞边界，不承诺所有数值或潜在缺陷均被覆盖。
- 保留用户原有Excel、截图、缓存及其他无关未跟踪文件；仅提交明确任务相关文件。
