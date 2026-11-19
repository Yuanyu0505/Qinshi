# 木抵抗原图溯源恢复（1140）

## 范围

仅恢复木抵抗组合表的真实原图与溯源 metadata；不修改任何业务行、属性、名称、数值、UI 或版本。不提交 Git、不触发发布。

## 来源与原样保留

- 已查看用户原图 `C:/Users/pghyl/AppData/Local/Temp/codex-clipboard-60c4f3ba-0158-4914-832d-70076882604b.png`，题头为“木抵抗”，包含五组、每组五行。
- 在确认目标文件不存在后，使用 `Copy-Item` 原样复制至 `assets/other-reference/sources/02_补充资料/补图08_木抵抗组合.png`；没有生成、编辑或重新编码图片。
- 原文件及复制文件 SHA256 均为 `d72f973b746a7a0ea0498a38d02247268057e82ed8b250f810d25947c5847b76`。
- 文件大小 `157198` bytes，PNG 尺寸 `1090 × 1116`。

## 改动

- `data/other-reference-data.js`：新增 image 注册（SHA256、size、pixels、来源信息），并关联 elements section。
- `data/other-reference-tables-b.js`：mapping 最小支持带目录路径及显式 verification；木抵抗表关联真实补图，保留 `user-confirmed`。
- `tests/other-reference.test.js`：图片总数 `37 → 38`；所有表必须含可达来源路径的强断言保持不变。
- `tests/other-reference-wood-source.test.js`：新增来源关联、图片字节/大小/尺寸、25 行与其他表不变回归。

木抵抗 25 行序列化 SHA256 在修改前后均为 `f99eec336ba6058426019540e8f55421a072b7396aa6dc3c83b65cd162436dcd`。tables-b 所有其他表序列化 SHA256 在修改前后均为 `f83aee7e99e9cab075f747d3973d1da1a4ca36ce5d4eb5d836a6ef2ad998db5d`。

## 验证

按本轮授权执行定向测试，先红后绿。

1. 红：`node --test tests/other-reference.test.js tests/other-reference-wood-source.test.js`，10 tests，7 pass / 3 fail，退出码 1。失败原因分别是木抵抗 sourcePaths 为空、图片数 37 不等于 38、全表来源路径强断言失败。日志：`outputs/1140-wood-provenance-red.txt`。
2. 绿：`node --test tests/other-reference.test.js tests/other-reference-wood-source.test.js tests/release-assets.test.js`，15 tests，15 pass / 0 fail，退出码 0。日志：`outputs/1140-wood-provenance-green.txt`。
3. `Get-FileHash` 再次确认原图与复制文件 SHA256 相同。

全量测试及发布由父任务统一协调；本子任务未宣称全量测试或真实发布通过。建议手动查看木抵抗表来源按钮能否打开补图，业务显示应与原先一致。
