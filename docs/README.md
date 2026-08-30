# 项目文档（Interview Forge 设计资料）

本目录收录产品的设计、技术方案与 AI 工作流说明，作为项目的文档记录。

## 文档地图

| 文档 | 路径 | 说明 |
| --- | --- | --- |
| 界面截图画廊 | [screenshots/README.md](screenshots/README.md) | 76 张真实运行截图总览，按页面分组、浅色 / 深色对照 |
| 产品说明 | [spec/产品说明.md](spec/产品说明.md) | 逐屏功能演示与界面截图（浅色 / 深色） |
| 技术方案设计文档 | [spec/技术方案设计文档.md](spec/技术方案设计文档.md) | 架构决策、并发策略、测试与 CI 策略 |
| 详细设计文档 | [spec/详细设计文档.md](spec/详细设计文档.md) | 关键模块的实现细节与伪代码 |
| 项目需求文档 | [spec/项目需求文档.md](spec/项目需求文档.md) | 功能需求、用户场景与数据模型 |
| AI 工作流-流程图总览 | [ai-workflow/AI工作流-流程图总览.md](ai-workflow/AI工作流-流程图总览.md) | LangGraph 5 节点工作流端到端流程图 |
| AI 出题提示词设计 | [ai-workflow/AI出题提示词设计.md](ai-workflow/AI出题提示词设计.md) | 自动出题 3 段提示词逐段介绍 + 设计方案（LLM/确定性分工、10 域分类、三层追问框架、错误回灌精炼环） |

## 配图位置

- **界面截图**：`spec/产品说明.md` 与 `screenshots/README.md` 通过相对路径 `../screenshots/*.png` / `*.png` 引用，实际存放于 `docs/screenshots/`。
  - `docs/screenshots/readme/` 是 README 用图（把原图缩放到宽 900px，避免 README 加载过慢），内容与原始图一致。
- **流程图 SVG**：`ai-workflow/AI工作流-流程图总览.md` 通过相对路径 `assets/*.svg` 引用，实际存放于 `docs/ai-workflow/assets/`。

> 配图与文档保持原始相对路径，因此在本仓库内直接打开 `.md` 即可正常渲染图片。
