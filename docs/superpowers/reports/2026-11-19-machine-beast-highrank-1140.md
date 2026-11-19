# 1.1.40 高阶原形 P0 核心修复报告

## 范围与依据

已完整阅读用户执行包中的 `01_请Codex首先阅读_完整执行指令.md`、`02_原审查报告_供核查非最新指令.md` 和 `03_独立边界复现脚本.cjs`，以当前源码为准，没有用旧包覆盖源码。此子任务只处理高阶原形及其核心守恒/同等方案回归，不处理价格 UI、runner、六堂、版本和数据。

## 根因与最小改动

- P0：`js/machine-beasts.js` 的 `conversionMaterials()`（约 535 行）把加工阶数上限 `maximumRank` 同时用于原库存直接投入，导致 `zeroToSeven` 且不开新增高阶时，8–10 阶原形消失。
- 删除错误的原形模式过滤条件；原形仍以兽/品质归一化后的合法库存为基础，遵循逐来源 `available` 与共享 `baseCount`。加工类型仍由原有 `maximumRank`、`allowNewModifications` 约束。
- `allocateConvertedInventory()`、DP、`machine-beast-equivalents.js` 无需修改。直接投入仍保留原改造；拆解后产生的零改造候选不继承原改造。原有显式允许新增改造的行为不变。
- `js/machine-beasts-conversion.test.js` 的独立枚举原先也复制了同一个错误模式过滤，已移除该错误前提，使物理原形始终参与独立 oracle。
- 新增 `js/machine-beasts-highrank.test.js`，没有改变排序或 API 价格/蓝紫参数语义。

## RED / GREEN 与真实数值

初始 RED 命令：

```powershell
node --test js/machine-beasts-highrank.test.js
```

`outputs/1140-highrank-red.txt`：2 项均按预期失败，退出码 1。

| 场景 | 修复前 zero | 修复前 zeroToSeven | 修复后两种模式 |
| --- | --- | --- | --- |
| 真实赤练王蛇，8 阶满神改 1 只，目标 10 级 | 新增 0 / 折算投入 2 | 新增 3 / 折算投入 5 | 新增 0 / 折算投入 2 |
| 独立精确流派：原形研发 10，普通加工研发 3，目标范围 [10,11) | 有解 | 无解 | 均有解，研发 10，新购 0，折算投入 2 |

修复后真实赤练王蛇直接使用 `owned / fullDivine / rank 8 / count 1`，单只研发 381504；加工来源为空，拆解余量 0，可用折算库存 2。未改写输入库存。独立流派夹具为 `owned / none / rank 8 / count 1`，神图和破片各 1，参考价 7。

矩阵初次运行曾出现测试期望错误：10 阶原形折算 8，而 4 只零改造材料可贡献研发 12，单兽按原有规则允许溢出并选择折算 4，不能强行断言单兽选择 10 阶原形。已纠正为单兽折算 4 / 溢出 2、流派精确选择原形，没有改变生产排序或研发限制。最终日志覆盖前一次临时矩阵失败；初始真实 RED 日志单独保留。

## 守恒、穷举与同等图覆盖

1. 96 组：8/9/10 阶 × `none/initial/heaven/fullDivine` × `zero/zeroToSeven` × 新增高阶开关 × 新增改造开关。三种有效加工域（仅 0、0–7、开放高阶）均覆盖。分别检查单兽目标/溢出、精确流派、原改造与直接投入来源。
2. 960 个独立物理分配实例：库存 1/3、上限 0/1/3、直接投入数量、加工输出数量逐一枚举；手工使用 2/4/8 折算检查每个来源的原形+拆解使用量不超限、共享本体守恒、新增本体缺口、非负余量、部分拆解剩余和未选库存排除。这里调用真实 allocator，但预期由原始物理数量与独立算术给出，不调用生产预算/研发/费用 helper 计算预期。
3. 独立枚举 27 组 8/9/10 来源上限组合，其中 23 组有解。目标研发恰好 20，只能使用两只研发各 10 的原形；独立枚举每项有界数量向量，对比 `equivalents.count`、主方案、逐页解码（每页 1 项）、无重复及无遗漏，核对神图/破片/元宝和等级。
4. 另外 3 组原形与加工混合场景：目标研发恰好 13，只能由高阶原形 10 + 加工 3 构成。独立枚举 16/8/8 个最终组合（每页 2 项），逐一检查直接原形与加工来源未重复消费、来源使用量不超限、拆解供应 = 已加工使用 + 剩余、加工为零改造，参考资源一致。
5. 既有 80 组随机物理库存单兽/流派 oracle、100 组单兽库存优先穷举、两兽共享神图价格独立枚举，以及现有同等图 BigInt 数量/分页、来源资料回归均随定向集合运行。

## 验证命令与结果

最终定向核心命令：

```powershell
node --test js/machine-beasts-highrank.test.js js/machine-beasts-conversion.test.js js/machine-beast-equivalents.test.js js/machine-beasts-sources.test.js js/machine-beasts-stock-priority.test.js
```

结果：31 tests，31 pass，0 fail，退出码 0。日志 `outputs/1140-highrank-core-regression.txt`，Node 报告 duration 1865.3969 ms；这是本次运行值，不是性能基准结论。

较小集合日志 `outputs/1140-highrank-green.txt`：15 tests，15 pass，0 fail；`outputs/1140-highrank-green-initial.txt` 保存最小修复最初 10 项通过结果。

## 限制与未触碰范围

- 全量测试、浏览器 UI、Worker/回退、真实账号及完整性能基准由主任务负责；本报告不宣称已完成这些验证。
- 独立枚举覆盖小范围 fixture，不是全部游戏状态的形式证明。没有发现本任务需要更改 DP 支配或同等图生产实现的独立反例，也没有实施性能优化或候选截断。
- `conversionCandidates()` 仍是同步求解；增加正确合法候选可能增加状态规模，具体压力与取消机制须由主任务量化，本任务没有在核心中扩展该范围。
- 未改游戏资料、六堂数据、公式、品质/阶数上限、存储 schema/键、账号权限、真实库存、UI、runner、版本、蓝紫单兽参数作用域或显式 null 价格语义；未提交、合并或推送 Git。
