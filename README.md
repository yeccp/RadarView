# RadarView

> 基于 Cesium 的雷达对空飞机实时监视与回放系统 | Radar Air Surveillance & Replay System based on Cesium

RadarView 是一款支持离线使用的桌面端雷达态势显示软件，能够接入 ADS-B 数据和自采雷达数据，在 3D 地球上实时展示空中目标航迹，并支持多源数据融合回放。


---

## 核心功能 | Features

- **多源数据接入** — 支持 ADS-B、自采雷达数据、外部报文文件导入
- **时间戳对齐** — 多源数据自动/手动时间对齐，支持用户微调偏移量
- **分类标注** — 不同数据源使用不同颜色和图标区分（ADS-B 青色、雷达绿色、仿真橙色）
- **历史回放** — 导入历史数据文件，按时间轴回放航迹
- **离线地图** — 基于天地图离线瓦片，断网环境下完整可用
- **图层控制** — 可独立开关各数据源图层的显示/隐藏

---

## 技术栈 | Tech Stack

| 模块   | 技术                     | 说明                         |
| ---- | ---------------------- | -------------------------- |
| 桌面框架 | **Tauri 2.x**          | Rust 后端 + 系统 WebView，轻量高性能 |
| 前端框架 | **Vue 3 + TypeScript** | 组合式 API，类型安全               |
| 地图引擎 | **Cesium.js**          | 3D 地球，航空领域事实标准             |
| 数据解析 | **Rust**               | ADS-B 报文解析、雷达协议解析、UDP 收发   |
| 离线瓦片 | **MBTiles (SQLite)**   | 天地图影像 + 标注，zoom 0-8        |
| 本地存储 | **SQLite**             | 航迹历史记录持久化                  |

---

## 系统架构 | Architecture

```
┌──────────────────────────────────────────────────────────┐
│                    Tauri Desktop App                      │
├────────────────────────┬─────────────────────────────────┤
│     Vue 3 Frontend     │         Rust Backend            │
│                        │                                 │
│  ┌──────────────────┐  │  ┌───────────────────────────┐  │
│  │   Cesium 3D Map  │  │  │   UDP Server              │  │
│  │   ├─ 影像底图     │  │  │   ├─ ADS-B Receiver      │  │
│  │   ├─ 航迹渲染     │◄─┼──┤   └─ Radar Receiver      │  │
│  │   └─ 图层控制     │  │  ├───────────────────────────┤  │
│  ├──────────────────┤  │  │   File Importer           │  │
│  │  Track Panel     │  │  │   └─ CSV / JSON / Binary  │  │
│  │  └─ 目标列表/详情 │  │  ├───────────────────────────┤  │
│  ├──────────────────┤  │  │   Time Aligner            │  │
│  │  Playback Bar    │  │  │   └─ 多源时间戳对齐        │  │
│  │  └─ 回放控制     │  │  ├───────────────────────────┤  │
│  └──────────────────┘  │  │   Tile Server             │  │
│                        │  │   └─ MBTiles → HTTP       │  │
│          WebSocket     │  ├───────────────────────────┤  │
│        ◄───────────────┼──┤   SQLite                  │  │
│                        │  │   └─ 航迹历史存储          │  │
│                        │  └───────────────────────────┘  │
└────────────────────────┴─────────────────────────────────┘

数据流 Data Flow:
═══════════════

实时模式:  ADS-B/雷达 ──UDP──► Rust 解析 ──WebSocket──► Cesium 渲染
回放模式:  文件导入 ──► Rust 按时间戳回放 ──WebSocket──► Cesium 渲染
                                  ↑
                           Time Aligner 对齐
```

---

## 项目结构 | Project Structure

```
RadarView/
├── src-tauri/                  # Rust 后端 (Tauri)
│   ├── src/
│   │   ├── main.rs             # 入口
│   │   ├── adsb.rs             # ADS-B 报文解析
│   │   ├── radar.rs            # 自采雷达协议解析
│   │   ├── track.rs            # 统一航迹数据结构
│   │   ├── time_align.rs       # 多源时间戳对齐
│   │   ├── replay.rs           # 文件回放引擎
│   │   ├── udp_server.rs       # UDP 数据接收
│   │   ├── tile_server.rs      # 离线瓦片 HTTP 服务
│   │   └── db.rs               # SQLite 航迹存储
│   └── Cargo.toml
├── src/                        # Vue 3 前端
│   ├── components/
│   │   ├── CesiumMap.vue       # 地图主视图
│   │   ├── TrackPanel.vue      # 航迹列表与详情
│   │   ├── RadarOverlay.vue    # 雷达覆盖扇区
│   │   ├── PlaybackBar.vue     # 回放进度控制
│   │   └── LayerControl.vue    # 图层开关面板
│   ├── composables/
│   │   ├── useWebSocket.ts     # WebSocket 数据接收
│   │   ├── useTracks.ts        # 航迹管理 (融合/去重/老化)
│   │   └── useTrackStyle.ts    # 数据源样式映射
│   ├── types/
│   │   └── track.ts            # TypeScript 类型定义
│   ├── App.vue
│   └── main.ts
├── tiles/                      # 离线瓦片数据
│   └── tianditu.mbtiles        # 天地图离线瓦片包
├── public/
│   └── icons/                  # 目标图标 (SVG)
├── scripts/
│   └── download_tiles.py       # 瓦片下载脚本
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```

---

## 快速开始 | Quick Start

### 环境准备 Prerequisites

| 工具      | 版本要求    | 说明       |
| ------- | ------- | -------- |
| Node.js | >= 18   | 前端构建     |
| Rust    | >= 1.70 | Tauri 后端 |
| pnpm    | >= 8    | 包管理器（推荐） |

```bash
# 1. 克隆仓库 Clone
git clone https://github.com/yeccp/RadarView.git
cd RadarView

# 2. 安装前端依赖 Install dependencies
pnpm install

# 3. 开发模式启动 Dev mode
pnpm tauri dev

# 4. 构建发布包 Build release
pnpm tauri build
```

### 离线瓦片准备 Offline Tiles

```bash
# 申请天地图 Key: https://console.tianditu.gov.cn/
# 下载 zoom 0-8 瓦片到 MBTiles
python scripts/download_tiles.py --key YOUR_TIANDITU_KEY --max-zoom 8
```

---

## 数据源说明 | Data Sources

### ADS-B（文件导入）

通过导入 `.csv` 格式的 ADS-B 历史数据文件获取航迹信息，按 ICAO Address 聚合航迹后送入回放引擎。

> 详细报文字段定义见 [docs/adsb-format.md](docs/adsb-format.md)

### 自采雷达数据

通过 UDP 接收自定义雷达协议报文（端口可配置），Rust 后端解析后转为统一航迹格式。

| 字段 | 说明 |
|------|------|
| Target ID | 雷达分配的目标批号 |
| Range | 目标斜距（km） |
| Azimuth | 方位角（°） |
| Elevation | 俯仰角（°） |
| Position | 经纬度（由距离/方位/雷达站位置解算） |
| Altitude | 高度（m，由斜距+俯仰解算或报文直接给出） |

雷达站位置在配置文件中设定，用于极坐标→经纬度转换。

### 文件导入

支持导入以下格式的历史数据进行回放：

| 格式 | 说明 |
|------|------|
| `.csv` | ADS-B 数据文件，文件名格式 `YYYY-MM-DD HH-MM-SS.csv`，详见 [报文格式](docs/adsb-format.md) |
| `.mat` | MATLAB 数据文件，包含航迹矩阵 |

---

## 离线地图 | Offline Map

使用天地图（TianDiTu）作为离线影像数据源：

- **影像底图** `img_w` — 卫星影像
- **影像标注** `cia_w` — 地名、道路、边界线
- **瓦片级别** zoom 0-8（km 级精度）
- **存储格式** MBTiles（SQLite 单文件）
- **预估体积** 约 200-500MB

在线时优先使用天地图在线服务，离线时自动回退到本地瓦片。

---

## Git 协作规范 | Git Workflow

### 分支策略 Branch Strategy

采用简化版 Git Flow，适合 2-3 人小团队：

```
main          ●━━━━━━━━━━━●━━━━━━━━━━━●  稳定发布分支
               ↑           ↑           ↑
dev           ●━●━●━●━●━●━●━●━●━●━●━●━●  日常开发主线
             ↗   ↗       ↗
feature/xxx  ●━●━●       ●━●━●━●         功能分支
```

| 分支 | 用途 | 保护规则 |
|------|------|----------|
| `main` | 稳定版本，可随时发布 | 禁止直接 push，只接受来自 `dev` 的 PR |
| `dev` | 日常开发集成分支 | 禁止 force push，PR 需至少 1 人 Review |
| `feature/*` | 新功能开发 | 从 `dev` 创建，完成后 PR 回 `dev` |
| `fix/*` | Bug 修复 | 同 feature，紧急修复可直接 PR 到 `main` |

### 日常开发流程 Daily Workflow

```bash
# 1. 从 dev 创建功能分支
git checkout dev
git pull origin dev
git checkout -b feature/adsb-parser

# 2. 开发，提交
git add .
git commit -m "feat(adsb): implement Mode S DF17 message parser"

# 3. 推送并创建 PR
git push origin feature/adsb-parser
# 在 GitHub 上创建 PR: feature/adsb-parser → dev

# 4. Code Review 通过后，Squash Merge 到 dev
# 5. 删除已合并的 feature 分支
```

### Commit 规范 Commit Convention

使用 [Conventional Commits](https://www.conventionalcommits.org/) 格式：

```
<type>(<scope>): <description>
```

| Type | 说明 | 示例 |
|------|------|------|
| `feat` | 新功能 | `feat(map): add layer toggle control` |
| `fix` | Bug 修复 | `fix(adsb): correct altitude decoding for DF17` |
| `refactor` | 重构 | `refactor(track): simplify deduplication logic` |
| `docs` | 文档 | `docs: update data source configuration guide` |
| `style` | 代码格式 | `style: format with prettier` |
| `test` | 测试 | `test(replay): add time alignment unit tests` |
| `chore` | 构建/工具 | `chore: upgrade Tauri to 2.1` |

Scope 建议使用模块名：`map`, `adsb`, `radar`, `track`, `replay`, `tiles`

### Code Review 规范

每个 PR 合并前需要满足：

- [ ] 至少 1 位成员 Approve
- [ ] 通过 CI 检查（lint + type check + test）
- [ ] PR 描述清楚说明改动内容和测试方式
- [ ] 不包含无关改动（保持 PR 聚焦）

### 版本发布 Release

```bash
# dev 稳定后，创建 PR 到 main
# 合并后打 tag
git tag -a v0.1.0 -m "v0.1.0: basic ADS-B display and offline map"
git push origin v0.1.0
```

版本号遵循 [Semantic Versioning](https://semver.org/)：`MAJOR.MINOR.PATCH`

### .gitignore 建议

```gitignore
# Dependencies
node_modules/

# Build output
dist/
src-tauri/target/

# Offline tiles (体积大，不入库，单独分发)
tiles/*.mbtiles

# Environment
.env
*.local

# IDE
.vscode/
.idea/
```

> **注意**：离线瓦片文件（`.mbtiles`）体积较大（200-500MB），不建议提交到 Git 仓库。建议通过网盘或内部文件服务器单独分发。

---

## 里程碑 | Milestones

2-3 人并行开发，总周期约 2.5 周。

```
         Day1─2       Day3─5       Day6─8       Day9─11      Day12+
成员A:   ┣━ M1 脚手架 ━┫┣━━ M2 ADS-B 接入 ━━┫┣━ M4 回放 ━━┫┣━ 联调 ━┫
成员B:   ┣━ M1 瓦片  ━━┫┣━━ M3 雷达接入 ━━━━┫┣━ M4 对齐 ━━┫┣━ 联调 ━┫
成员C:                  ┣━━ M5 UI 面板 ━━━━━━━━━━━━━━━━━━━━┫┣━ 联调 ━┫
```

| 阶段  | 目标                         | 负责     | 预估           |
| --- | -------------------------- | ------ | ------------ |
| M1  | 项目脚手架 + Cesium 地球 + 离线瓦片加载 | A+B 并行 | 2 天          |
| M2  | ADS-B 数据接入 + 实时航迹渲染        | A      | 3 天          |
| M3  | 雷达数据接入 + 多源分类标注            | B      | 3 天          |
| M4  | 文件导入 + 时间对齐 + 回放功能         | A+B 并行 | 3 天          |
| M5  | UI 完善（图层控制 + 航迹面板 + 回放条）   | C      | 与 M2-M4 同步进行 |
| M6  | 联调 + 集成测试 + 打包发布           | 全员     | 2 天          |

---

## License

MIT
