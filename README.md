# STRA

**把 Steam 玩家评论整理成可追溯的产品研究结果。** STRA 面向游戏产品与用户研究场景：采集评论，计算可复现的指标，按需用 LLM 提取话题，再从结论回到原始评论。它提供版本比较工作流，并可构建为 Windows 桌面应用。

> 30 秒了解：**当前观察到什么 → 哪些评论支持这个判断 → 下一步值得验证什么。** 只有设置了可比较的窗口，才讨论“变化”。

## 项目亮点

| 能力 | 具体做法 |
| --- | --- |
| 可复现的定量结果 | 保存采集范围与来源；基于 Steam 原始元数据计算评论量、推荐率和活动诊断。LLM 不可用时，定量结果仍可使用。 |
| 可回查的语义发现 | LLM 分类用于发现候选话题；分析结果保留证据入口，可回到原始评论核对。调用量与估算成本记录在 ledger。 |
| 有边界的版本比较 | 使用生命周期匹配窗口、覆盖门槛、3/7/14 天稳健性窗口及成对评论，帮助讨论变化及可能原因。 |

**案例：** 一次历史版本比较覆盖两组分别为 831 与 1,573 条的评论窗口，展示推荐率与话题变化，并保留样本覆盖和原文证据供复核。[查看案例与研究边界](docs/current/portfolio/STRA_PORTFOLIO_CASE_STUDY.md)。

## 从哪里看起

- **产品流程：** [60–90 秒演示脚本](docs/current/portfolio/STRA_DEMO_SCRIPT.md) → [案例说明](docs/current/portfolio/STRA_PORTFOLIO_CASE_STUDY.md)
- **关键实现：** [Steam 采集](apps/api/senti_next/acquisition.py) → [Research Core](apps/api/senti_next/research_core.py) → [版本比较](apps/api/senti_next/version_comparison.py) → [桌面构建](apps/desktop/package.json)
- **验证方式：** [自动化测试](tests/)与 [CI 配置](.github/workflows/ci.yml)

## 工作方式

```text
Steam 评论 → 采集范围与来源记录 → SQLite / FTS5
          → 确定性 Research Core → 指标与数据有效性
          → 可选 LLM 语义分析 → 话题与原文证据
          → Next.js Dashboard / Tauri 桌面应用
```

单次分析是一个快照；需要比较两个时期时，使用单独的版本比较流程。前端分别展示定量结果与语义结果，避免把模型输出当成原始事实。

## 运行与演示

Windows 桌面版构建需要 Python 3.11、Node.js、Rust MSVC 工具链和 WebView2。在 `apps/desktop` 中运行：

```powershell
npm ci
npm run build
```

安装包输出到 `apps/desktop/src-tauri/target/release/bundle/nsis/`。Web 本地开发与环境配置见 [开发说明](docs/current/LOCAL_DEVELOPMENT.md)。

## 研究边界

Steam 评论者是自选择样本，推荐率不代表全部玩家的满意度。LLM 标签是待核对的发现线索；版本比较呈现关联和可能机制，不能证明因果。数据来源或语义能力缺失时，界面会标明不可用。更完整的方法与限制见 [案例说明](docs/current/portfolio/STRA_PORTFOLIO_CASE_STUDY.md)。

[文档索引](docs/README.md) · [许可证](LICENSE)
