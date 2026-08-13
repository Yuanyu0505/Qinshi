# 秦时攻略站 交接文档

## 1. 快照信息

- 快照日期：2026-08-11
- 当前开发分支：`codex/atlas-upgrade-target`
- 发布分支：远程 `main`
- 检查点标签：`checkpoint-2026-08-10`
- 用途：当前为重要检查节点，可随时回退到本快照

## 2. 项目简介

可本地运行并可安装为 PWA 的秦时明月攻略工具，用于查询装备、锻造、关卡掉落、图鉴、铭文、答题和楼兰棋阵数据并记录个人进度。Windows 可直接双击打开；Android、iPhone 和 iPad 通过 GitHub Pages 首次联网缓存后可完全离线使用。

## 3. 运行方式

### 电脑使用

双击 `index.html`，用默认浏览器打开即可（全部功能离线可用）。

### 手机访问（同一 Wi-Fi）

1. 双击 `启动服务.bat`
2. 首次运行如遇 Windows 防火墙弹窗，选「允许」
3. 手机浏览器打开窗口中显示的「手机访问」地址

前置条件：本机需安装 Node.js（已安装 v24）。

### PWA 在线安装

- 正式地址：`https://yuanyu0505.github.io/Qinshi/`
- Android：Chrome 菜单“安装应用”，或在“设置”分区点击“安装到设备”
- iPhone/iPad：Safari“分享”→“添加到主屏幕”
- 第一次联网完成全部资源缓存后，可离线使用全部分区和图片

## 4. 功能分区

| 分区 | 功能 | 数据文件 |
| --- | --- | --- |
| 特殊属性装备 | 装备名/分类搜索；主属性独立筛选 + 副属性最多 2 个（AND）；按副属性最高值/红色/红金倒序；桌面表格 / 手机卡片 | `data/special-equipment.js` |
| 橙装锻造 | 锻造材料总览；两种查找（主锻造装备 / 素材装备，横向表展示、品质底色）；个人进度（分页：第一页全体汇总、之后每页一名弟子，记录每件装备锻造阶段，自动汇总剩余材料） | `data/forging.js` |
| 关卡掉落 | 输入道具关键词，按普通关卡 / 英雄关卡 / 声望奖励三个分区统计掉落，先显示道具名再显示关卡 | `data/drops.js` |
| 图鉴 | 攻/血/内力/防四个图鉴分区；按弟子名、获取途径、所属图鉴、道具、等级（如 9级、10级以下）搜索；等级筛选（全部/5级以下/10级以下/15级以下）；图鉴等级为个人进度，等级 ≥ 10 无需装备，已超阶段自动隐藏；装备按紫/橙底色区分品质 | `data/atlas.js` |
| 楼兰棋阵 | 楼兰 5 张、棋阵 11 张本地图片展示 | `images/` |
| 铭文 | 个人进度、品质/天位/盾位查询筛选、天位主属性与盾位副属性资料图表 | `data/inscription.js` |
| 兵法 | 风、林、火、山、阴、雷选择；个人进度、材料计算和 0–15 阶资料查询 | `data/tactics.js` |
| 答题 | 按题目关键词查询标红正确答案 | `data/quiz.js` |

桌面导航顺序为图鉴、关卡掉落、装备属性、橙装锻造、铭文、兵法、答题、楼兰棋阵、设置。手机端的图鉴、关卡掉落、装备属性、橙装锻造为主导航；兵法在“更多”面板中，位于铭文之后、答题之前。

## 5. 文件结构

```
deepseek/
├─ index.html                      # 入口页面（双击打开）
├─ manifest.webmanifest            # PWA 名称、主题、启动范围和图标
├─ service-worker.js               # 完整离线预缓存与版本切换
├─ icons/                          # Android/桌面/iOS 应用图标
├─ .github/workflows/pages.yml     # GitHub Pages 自动部署
├─ css/style.css                   # 深色水墨主题 + 响应式样式
├─ js/
│  ├─ app.js                       # 页面渲染与交互
│  ├─ query.js                     # 特殊属性装备查询核心
│  ├─ forging.js                   # 橙装锻造查询核心
│  ├─ drops.js                     # 关卡掉落查询核心
│  ├─ progress.js                  # 锻造个人进度核心
│  ├─ atlas.js                     # 图鉴查询核心
│  ├─ inscription.js               # 铭文查询和个人进度
│  ├─ quiz.js                      # 只读题库搜索
│  ├─ settings.js                  # 本机进度导出、导入与导入前备份
│  ├─ pwa.js                       # 安装、离线状态和点击确认更新
│  └─ *.test.js                    # 对应核心的单元测试（node:test）
├─ data/                           # 解析脚本生成的只读数据（勿手改）
├─ tools/                          # Excel → 数据解析脚本（Python）
├─ tests/                          # 解析脚本单元测试（unittest）
├─ images/                         # 楼兰/棋阵图片副本（已提交）
├─ 图片/                           # 图片源文件夹（已提交）
├─ 秦时相关（更新贯侯钟离昧）20260618.xlsx  # 数据源 Excel（已提交）
├─ serve.js                        # Node 本地静态服务
├─ 启动服务.bat                    # 双击启动局域网服务
├─ HANDOVER.md                     # 本文档
└─ docs/superpowers/               # 设计文档与实施计划
```

## 6. 数据与重新生成

所有 `data/*.js` 由 `tools/*.py` 从 Excel 生成。Excel 更新后需要重新生成：

```powershell
# 本机未安装系统 Python，使用 Codex 运行时
$python = 'C:\Users\pghyl\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
& $python tools/build_special_equipment.py   # → data/special-equipment.js
& $python tools/build_forging.py             # → data/forging.js
& $python tools/build_drops.py               # → data/drops.js
& $python tools/build_atlas.py               # → data/atlas.js
& $python tools/build_tactics.py             # → data/tactics.js
```

解析规则要点：
- 特殊属性装备：品质/属性按单元格内容解析；主属性不参与排序
- 橙装锻造：主行为橙色装备；素材品质按字体颜色（紫=紫装、橙=橙装）；`-` 表示该阶段无需装备材料；关卡掉落/图鉴按各自表头与底色规则解析（详见各脚本注释）
- 图鉴：装备品质按单元格底色（theme:7 紫 / theme:9 橙）
- 兵法：`data/tactics.js` 只能由 `tools/build_tactics.py` 从“新兵法”工作表生成，禁止手改。六个固定数据区域是 `B2:P20`、`B24:P42`、`B45:P63`、`B66:P84`、`S2:AD20`、`S24:AD42`。业务修正包括：常规真言按显示百分比解析且统真言为固定值；阴、雷小数百分比换算为显示百分比；火之印记由兵法名称生成以避开错误表头；风兵法 6 阶防属性修正为 240。

## 7. 个人进度存储

个人进度保存在**本机浏览器的 localStorage**，键名：

| 键 | 内容 |
| --- | --- |
| `qinshi_forging_progress_v1` | 橙装锻造个人进度（弟子、装备、阶段） |
| `qinshi_atlas_levels_v1` | 图鉴等级个人进度 |
| `qinshi_atlas_target_level_v1` | 图鉴目标等级 |
| `qinshi_inscription_progress_v2` | 铭文个人进度 |
| `qinshi_quiz_items_v1` | 历史答题修订数据（兼容旧数据） |
| `qinshi_tactics_progress_v1` | 兵法个人进度：按兵法 ID 保存 `{ rank, rehearsalSpent, mantras }` |

注意：
- 换浏览器、清除浏览器数据、或换设备前应在“设置”中导出备份
- 导入备份会先自动下载当前数据，再整体替换所有 `qinshi_` 本机数据
- 通过手机局域网访问时，进度保存在手机浏览器的本地存储中

兵法存储对象以 `wind`、`forest`、`fire`、`mountain`、`yin`、`thunder` 为键；每项的 `rank` 为 0–15，`rehearsalSpent` 为本阶已消耗号角，`mantras` 按已知真言 ID 存储阶数，`-1` 表示未激活。读取和写入均会补齐已知真言、丢弃未知字段，并按当前兵法阶限制真言和号角范围。

## 7.1 兵法计算口径

- 起点和目标的兵法阶、每种真言阶均不能倒退。风、林、火、山的普通真言随兵法 0–9 阶解锁至 0–9 阶，极真言在兵法 10–15 阶解锁至 0–5 阶；阴、雷的单一真言随兵法 0–15 阶解锁。
- 兵法进阶材料累计区间为 `(当前兵法阶, 目标兵法阶]`；每种真言碎片累计区间为 `(当前真言阶, 目标真言阶]`，因此“未激活→0阶”包含 0 阶碎片。
- 仅风、林、火、山有目标阶演练号角。令目标阶单次号角为 `singleHorn`、完美保底为 `guaranteeHorn`、可继承已消耗号角为 `carriedSpent`，则 `carriedSpent` 仅在起点和目标同阶时继承，否则为 0；`remainingRuns = ceil(max(0, guaranteeHorn - carriedSpent) / singleHorn)`，实际还需号角为 `remainingRuns * singleHorn`。阴、雷不计算目标阶演练。

## 8. PWA 更新与发布

- `service-worker.js` 的缓存名格式为 `qinshi-site-<版本号>`；每次发布静态资源变更时必须同步提升该版本号。
- `js/pwa.js` 中的 `APP_VERSION` 必须与 Service Worker 缓存版本一致。
- `1.0.7` 的预缓存新增 `data/tactics.js`、`js/tactics.js`、`js/tactics-ui.js`；其余既有分区资源继续保留在预缓存清单中。
- 新 Service Worker 安装后保持等待状态，页面提示用户点击“立即更新”；确认后发送 `SKIP_WAITING` 并刷新一次。
- GitHub Actions 从远程 `main` 组装 `_site`，只发布运行时 HTML、CSS、数据、脚本、图标和图片。
- GitHub Pages 首次发布需要在仓库 `Settings → Pages → Source` 选择 `GitHub Actions`。

## 9. 测试

```powershell
$python = 'C:\Users\pghyl\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
node --test js/query.test.js js/forging.test.js js/drops.test.js js/progress.test.js js/atlas.test.js serve.test.js
& $python -m unittest discover -s tests
```

快照时全量测试通过：JS 60/60、Python 37/37。

## 10. Git 快照与回退

项目使用本地 git 仓库（分支 `master`），完整提交历史保留。

### 回退到本快照

```powershell
git -c safe.directory=C:/Users/pghyl/Desktop/deepseek reset --hard checkpoint-2026-08-10
```

### 查看历史与标签

```powershell
git -c safe.directory=C:/Users/pghyl/Desktop/deepseek log --oneline
git -c safe.directory=C:/Users/pghyl/Desktop/deepseek tag -l
```

## 11. 注意事项

- `index.html` 直接双击与 `启动服务.bat` 局域网访问共用同一套文件
- Excel 文件若被 Excel 打开，会产生 `~$` 临时锁文件（已被 .gitignore 忽略，不影响）
- 各解析脚本遇到无法识别的单元格会输出异常并中止生成，避免产出错误数据
- PWA 首次访问必须联网；完成预缓存后才具备完整离线能力

## 12. 2026-08-12 手机和平板布局优化

- 橙装锻造个人进度的阶段材料表在不超过 `1024px` 的视口内取消全局最小宽度和历史水平位移，阶段与材料在卡片内自适应展示，材料可自动换行。
- 图鉴“当前结果升至 X 级汇总”的所需装备在手机和平板端默认折叠，通过“展开所需装备/收起所需装备”按钮切换；桌面端仍默认直接展示。
- 橙装锻造材料总览和装备搜索结果在手机和平板端冻结第一行与第一列，从 B2 单元格开始滚动。
- 铭文“资料图表”的天位主属性和盾位副属性表在手机和平板端冻结第一行与第一列。
- 以上样式和交互限定在 `max-width: 1024px`，不改变桌面端布局；PWA 缓存和显示版本已提升为 `1.0.1`。
- 功能验证由用户手动执行，重点检查手机竖屏个人进度完整显示、图鉴折叠切换、三类表格双向滚动冻结效果，以及桌面端布局保持不变。

## 13. 2026-08-12 移动端宽表滚动体验修正

- 取消手机和平板宽表的内部纵向滚动和第一行冻结，统一由页面负责上下滚动，表格容器只负责左右滑动，避免 iPhone Safari 出现大块空白和滚动上下文割裂。
- 主锻造搜索结果不冻结；素材装备搜索结果仅冻结第一列“装备”。
- 四大类通用表格新增独立 `.summary-table-scroll` 滚动层，冻结第一列紧贴滚动视口，使用不透明背景、边框和阴影遮挡下层内容。
- 铭文资料图表仅冻结第一列，表头随页面正常上下移动。
- 手机端“该弟子剩余材料汇总”和“全体弟子剩余材料汇总”均为两列。
- 上述规则仅作用于不超过 `1024px` 的视口；桌面端保持不变。PWA 缓存和显示版本提升为 `1.0.2`。
