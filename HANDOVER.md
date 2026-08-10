# 秦时 · 攻略查询工具 交接文档

## 1. 快照信息

- 快照日期：2026-08-10
- Git 分支：`master`
- 检查点标签：`checkpoint-2026-08-10`
- 用途：当前为重要检查节点，可随时回退到本快照

## 2. 项目简介

完全离线的本地网页工具，用于查询秦时明月游戏攻略数据（装备、锻造、关卡掉落、图鉴）并记录个人进度。无需联网、无需安装依赖，浏览器直接打开即可使用。

## 3. 运行方式

### 电脑使用

双击 `index.html`，用默认浏览器打开即可（全部功能离线可用）。

### 手机访问（同一 Wi-Fi）

1. 双击 `启动服务.bat`
2. 首次运行如遇 Windows 防火墙弹窗，选「允许」
3. 手机浏览器打开窗口中显示的「手机访问」地址

前置条件：本机需安装 Node.js（已安装 v24）。

## 4. 功能分区

| 分区 | 功能 | 数据文件 |
| --- | --- | --- |
| 特殊属性装备 | 装备名/分类搜索；主属性独立筛选 + 副属性最多 2 个（AND）；按副属性最高值/红色/红金倒序；桌面表格 / 手机卡片 | `data/special-equipment.js` |
| 橙装锻造 | 锻造材料总览；两种查找（主锻造装备 / 素材装备，横向表展示、品质底色）；个人进度（分页：第一页全体汇总、之后每页一名弟子，记录每件装备锻造阶段，自动汇总剩余材料） | `data/forging.js` |
| 关卡掉落 | 输入道具关键词，按普通关卡 / 英雄关卡 / 声望奖励三个分区统计掉落，先显示道具名再显示关卡 | `data/drops.js` |
| 图鉴 | 攻/血/内力/防四个图鉴分区；按弟子名、获取途径、所属图鉴、道具、等级（如 9级、10级以下）搜索；等级筛选（全部/5级以下/10级以下/15级以下）；图鉴等级为个人进度，等级 ≥ 10 无需装备，已超阶段自动隐藏；装备按紫/橙底色区分品质 | `data/atlas.js` |
| 楼兰棋阵 | 楼兰 5 张、棋阵 11 张本地图片展示 | `images/` |

## 5. 文件结构

```
deepseek/
├─ index.html                      # 入口页面（双击打开）
├─ css/style.css                   # 深色水墨主题 + 响应式样式
├─ js/
│  ├─ app.js                       # 页面渲染与交互
│  ├─ query.js                     # 特殊属性装备查询核心
│  ├─ forging.js                   # 橙装锻造查询核心
│  ├─ drops.js                     # 关卡掉落查询核心
│  ├─ progress.js                  # 锻造个人进度核心
│  ├─ atlas.js                     # 图鉴查询核心
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
```

解析规则要点：
- 特殊属性装备：品质/属性按单元格内容解析；主属性不参与排序
- 橙装锻造：主行为橙色装备；素材品质按字体颜色（紫=紫装、橙=橙装）；`-` 表示该阶段无需装备材料；关卡掉落/图鉴按各自表头与底色规则解析（详见各脚本注释）
- 图鉴：装备品质按单元格底色（theme:7 紫 / theme:9 橙）

## 7. 个人进度存储

个人进度保存在**本机浏览器的 localStorage**，键名：

| 键 | 内容 |
| --- | --- |
| `qinshi_forging_progress_v1` | 橙装锻造个人进度（弟子、装备、阶段） |
| `qinshi_atlas_levels_v1` | 图鉴等级个人进度 |

注意：
- 换浏览器、清除浏览器数据、或换电脑会丢失进度
- 当前版本未提供导出/导入功能（可后续补充）
- 通过手机局域网访问时，进度保存在手机浏览器的本地存储中

## 8. 测试

```powershell
$python = 'C:\Users\pghyl\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
node --test js/query.test.js js/forging.test.js js/drops.test.js js/progress.test.js js/atlas.test.js serve.test.js
& $python -m unittest discover -s tests
```

快照时全量测试通过：JS 60/60、Python 37/37。

## 9. Git 快照与回退

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

## 10. 注意事项

- `index.html` 直接双击与 `启动服务.bat` 局域网访问共用同一套文件
- Excel 文件若被 Excel 打开，会产生 `~$` 临时锁文件（已被 .gitignore 忽略，不影响）
- 各解析脚本遇到无法识别的单元格会输出异常并中止生成，避免产出错误数据
- 后续计划（未实现）：紫装锻造并入装备锻造、进度导出/导入、其他子表模块、跨表汇总查询
