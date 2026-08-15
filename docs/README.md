# 项目文档（Interview Forge 设计资料）

本目录收录产品的设计、技术方案与 AI 工作流说明，作为项目的文档记录。

## 文档地图

| 文档 | 路径 | 说明 |
| --- | --- | --- |
| 产品说明 | [project/spec/产品说明.md](project/spec/产品说明.md) | 逐屏功能演示与界面截图（浅色 / 深色） |
| 技术方案设计文档 | [project/spec/技术方案设计文档.md](project/spec/技术方案设计文档.md) | 架构决策、并发策略、测试与 CI 策略 |
| 详细设计文档 | [project/spec/详细设计文档.md](project/spec/详细设计文档.md) | 关键模块的实现细节与伪代码 |
| 项目需求文档 | [project/spec/项目需求文档.md](project/spec/项目需求文档.md) | 功能需求、用户场景与数据模型 |
| AI 工作流-流程图总览 | [learning/AI工作流-流程图总览.md](learning/AI工作流-流程图总览.md) | LangGraph 5 节点工作流端到端流程图 |

## 配图位置

- **界面截图**：`project/spec/产品说明.md` 通过相对路径 `../../screenshots/*.png` 引用，实际存放于 `docs/screenshots/`。
- **流程图 SVG**：`learning/AI工作流-流程图总览.md` 通过相对路径 `assets/*.svg` 引用，实际存放于 `docs/learning/assets/`。

> 配图与文档保持原始相对路径，因此在本仓库内直接打开 `.md` 即可正常渲染图片。
