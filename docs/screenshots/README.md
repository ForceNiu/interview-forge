# 界面截图（screenshots）

本目录存放项目的**真实运行截图**（浅色 + 深色双主题，共 76 张），由 Playwright（浏览器自动化工具）驱动真实页面生成，**无 mock、无占位图**。

| 分组 | 张数 | 覆盖场景 |
| --- | --- | --- |
| 首页 · 题库 | 14 | 列表、搜索命中 / 无结果、删除二次确认与成功提示、移动端导航开合 |
| 新增题目 | 8 | 空表单、已填写、Zod 校验报错、创建成功 |
| 题目详情 | 6 | Markdown 答案渲染、删除二次确认、题目不存在 |
| 编辑题目 | 4 | 回填已有数据、校验报错 |
| 收藏页 | 6 | 空收藏、收藏列表、取消收藏后（乐观更新生效） |
| 标签管理 | 10 | 标签列表、新增、创建成功、删除确认与成功 |
| AI 出题（LangGraph 5 节点全流程） | 22 | 初始态 → Key 连通 → 填写简历/JD → 节点①②③④ 逐阶段 → 生成完成；含 Key 无效 / 部分域失败 / 错误横幅 |
| 边界状态 | 6 | loading 骨架屏、服务端错误边界、404 |

> 逐屏图文解说见 [../spec/产品说明.md](../spec/产品说明.md)。
> README 中的精选截图见 [../../README.md](../../README.md#界面截图精选)。
>
> **`readme/` 子目录**：存放 README 引用用的缩放副本（宽 900px），避免 README 直接引用动辄 1MB+ 的原图导致加载缓慢；内容与原图一致。
> **`screenshot-input.md`**：AI 出题截图所用的简历 / JD 输入文本——已全部替换为**虚构素材**（虚构公司、虚构学校、虚构时间线），仓库内不含任何真实个人信息。

---

## 首页 · 题库

| 场景 | 浅色（light） | 深色（dark） |
| --- | --- | --- |
| 题目列表（SSR 渲染） | ![home__list__light.png](home__list__light.png) | ![home__list__dark.png](home__list__dark.png) |
| 搜索命中 | ![home__search-results__light.png](home__search-results__light.png) | ![home__search-results__dark.png](home__search-results__dark.png) |
| 搜索无结果 | ![home__search-noresult__light.png](home__search-noresult__light.png) | ![home__search-noresult__dark.png](home__search-noresult__dark.png) |
| 删除二次确认 | ![home__delete-confirm__light.png](home__delete-confirm__light.png) | ![home__delete-confirm__dark.png](home__delete-confirm__dark.png) |
| 删除成功提示 | ![home__delete-success__light.png](home__delete-success__light.png) | ![home__delete-success__dark.png](home__delete-success__dark.png) |
| 移动端导航（收起） | ![home__mobile-nav-closed__light.png](home__mobile-nav-closed__light.png) | ![home__mobile-nav-closed__dark.png](home__mobile-nav-closed__dark.png) |
| 移动端导航（展开） | ![home__mobile-nav-open__light.png](home__mobile-nav-open__light.png) | ![home__mobile-nav-open__dark.png](home__mobile-nav-open__dark.png) |

## 新增题目

| 场景 | 浅色（light） | 深色（dark） |
| --- | --- | --- |
| 空表单 | ![new__empty__light.png](new__empty__light.png) | ![new__empty__dark.png](new__empty__dark.png) |
| 已填写 | ![new__filled__light.png](new__filled__light.png) | ![new__filled__dark.png](new__filled__dark.png) |
| Zod 校验报错 | ![new__validation__light.png](new__validation__light.png) | ![new__validation__dark.png](new__validation__dark.png) |
| 创建成功 | ![new__success__light.png](new__success__light.png) | ![new__success__dark.png](new__success__dark.png) |

## 题目详情

| 场景 | 浅色（light） | 深色（dark） |
| --- | --- | --- |
| Markdown 答案渲染 | ![detail__view__light.png](detail__view__light.png) | ![detail__view__dark.png](detail__view__dark.png) |
| 删除二次确认 | ![detail__delete-confirm__light.png](detail__delete-confirm__light.png) | ![detail__delete-confirm__dark.png](detail__delete-confirm__dark.png) |
| 题目不存在 | ![detail__notfound__light.png](detail__notfound__light.png) | ![detail__notfound__dark.png](detail__notfound__dark.png) |

## 编辑题目

| 场景 | 浅色（light） | 深色（dark） |
| --- | --- | --- |
| 回填已有数据 | ![edit__prefilled__light.png](edit__prefilled__light.png) | ![edit__prefilled__dark.png](edit__prefilled__dark.png) |
| 校验报错 | ![edit__validation__light.png](edit__validation__light.png) | ![edit__validation__dark.png](edit__validation__dark.png) |

## 收藏页

| 场景 | 浅色（light） | 深色（dark） |
| --- | --- | --- |
| 空收藏 | ![favorites__empty__light.png](favorites__empty__light.png) | ![favorites__empty__dark.png](favorites__empty__dark.png) |
| 收藏列表 | ![favorites__populated__light.png](favorites__populated__light.png) | ![favorites__populated__dark.png](favorites__populated__dark.png) |
| 取消收藏后（乐观更新生效） | ![favorites__after-unfavorite__light.png](favorites__after-unfavorite__light.png) | ![favorites__after-unfavorite__dark.png](favorites__after-unfavorite__dark.png) |

## 标签管理

| 场景 | 浅色（light） | 深色（dark） |
| --- | --- | --- |
| 标签列表 | ![tags__list__light.png](tags__list__light.png) | ![tags__list__dark.png](tags__list__dark.png) |
| 新增标签 | ![tags__new-filled__light.png](tags__new-filled__light.png) | ![tags__new-filled__dark.png](tags__new-filled__dark.png) |
| 创建成功 | ![tags__create-success__light.png](tags__create-success__light.png) | ![tags__create-success__dark.png](tags__create-success__dark.png) |
| 删除确认 | ![tags__delete-confirm__light.png](tags__delete-confirm__light.png) | ![tags__delete-confirm__dark.png](tags__delete-confirm__dark.png) |
| 删除成功 | ![tags__delete-success__light.png](tags__delete-success__light.png) | ![tags__delete-success__dark.png](tags__delete-success__dark.png) |

## AI 出题（LangGraph 5 节点全流程）

| 场景 | 浅色（light） | 深色（dark） |
| --- | --- | --- |
| 初始态 | ![ai__idle__light__real.png](ai__idle__light__real.png) | ![ai__idle__dark__real.png](ai__idle__dark__real.png) |
| 自带 Key 已连通 | ![ai__key-connected__light__real.png](ai__key-connected__light__real.png) | ![ai__key-connected__dark__real.png](ai__key-connected__dark__real.png) |
| 简历 + JD 已填 | ![ai__form-filled__light__real.png](ai__form-filled__light__real.png) | ![ai__form-filled__dark__real.png](ai__form-filled__dark__real.png) |
| 节点① 候选域路由（纯函数） | ![ai__phase-routeCandidate__light__real.png](ai__phase-routeCandidate__light__real.png) | ![ai__phase-routeCandidate__dark__real.png](ai__phase-routeCandidate__dark__real.png) |
| 节点② 简历分析 | ![ai__phase-analyzeResume__light__real.png](ai__phase-analyzeResume__light__real.png) | ![ai__phase-analyzeResume__dark__real.png](ai__phase-analyzeResume__dark__real.png) |
| 节点③ 命题策略 | ![ai__phase-planStrategy__light__real.png](ai__phase-planStrategy__light__real.png) | ![ai__phase-planStrategy__dark__real.png](ai__phase-planStrategy__dark__real.png) |
| 节点④ 生成题目 | ![ai__phase-generateQuestions__light__real.png](ai__phase-generateQuestions__light__real.png) | ![ai__phase-generateQuestions__dark__real.png](ai__phase-generateQuestions__dark__real.png) |
| 生成完成（可一键保存） | ![ai__success__light__real.png](ai__success__light__real.png) | ![ai__success__dark__real.png](ai__success__dark__real.png) |
| Key 无效 | ![ai__error-key-invalid__light.png](ai__error-key-invalid__light.png) | ![ai__error-key-invalid__dark.png](ai__error-key-invalid__dark.png) |
| 部分域失败（精炼环兜底） | ![ai__error-partial__light.png](ai__error-partial__light.png) | ![ai__error-partial__dark.png](ai__error-partial__dark.png) |
| 错误提示横幅 | ![ai__error-banner__light.png](ai__error-banner__light.png) | ![ai__error-banner__dark.png](ai__error-banner__dark.png) |

## 边界状态

| 场景 | 浅色（light） | 深色（dark） |
| --- | --- | --- |
| loading 骨架屏 | ![edge__loading__light.png](edge__loading__light.png) | ![edge__loading__dark.png](edge__loading__dark.png) |
| 服务端错误边界 | ![edge__error__light.png](edge__error__light.png) | ![edge__error__dark.png](edge__error__dark.png) |
| 404 页面 | ![edge__notfound__light.png](edge__notfound__light.png) | ![edge__notfound__dark.png](edge__notfound__dark.png) |

