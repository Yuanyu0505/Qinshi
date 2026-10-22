# 机关兽浏览器覆盖补充

## 范围

仅修改 `tests/machine-beasts-reference-cost-browser.cjs`，不修改业务代码、发布文件，不提交或推送。

- 固定真实单只：白虎研发度750000、碎片13、目标20级、仅新增0阶，费用为192×70＋14889＝28329。
- 真实流派：非攻一阶，白虎/朱雀研发度750000、碎片13/8，不参与的铜人研发度168800；通过恢复真实草稿并点击实际计算按钮，确认选中白虎20级、朱雀19级，非空两兽明细及费用288×70＋14889＋7112＝42161。
- 神图单价64、库存10时费用39793，禁用库存后40433；修改设置不重新调用真实规划器、不改变完整 schoolResult。
- 360px、768px滚动到可见后检查展开兽价格、真实单只结果、流派方案及最后一只兽结果，无整页或容器横向溢出。
- 完整账号隔离补充兽价格与库存开关。
- 使用真实本地 exportBackup 下载和 importBackup(File) 导入，确认导入前自动备份、刷新后库存、单价、开关、兽价、零价格与非空研发度/碎片/7阶库存均完整恢复。网络限制到临时本地服务器；仅影响隔离测试上下文存储。

## 实际运行

环境：Node已在PATH，PLAYWRIGHT_MODULE指向 `C:/Users/pghyl/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright`，无头Edge，本地HTTP获授权。

1. `node --test --test-concurrency=1 tests/machine-beasts-reference-cost-browser.cjs`
   - 退出码0；13 tests，13 pass，0 fail，0 skipped；duration_ms 62277.1026。
   - 此轮发生在最后补充非空个人进度的备份fixture之前。
2. 加强备份fixture为非空个人进度，并在导入前确实改坏这份进度后：
   `node --test --test-concurrency=1 --test-name-pattern='local backup export' tests/machine-beasts-reference-cost-browser.cjs`
   - 退出码0；1 test，1 pass，0 fail；duration_ms 10579.2612。

未运行全量套件；以上不替代主代理负责的最终版本连续两轮完整单元和浏览器测试。
