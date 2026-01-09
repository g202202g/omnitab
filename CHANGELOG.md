# 更新记录

这里会记录每次发布带来的主要变化，方便你回顾“这次更新了什么”。



## v0.2.0 - 2026-01-09

- 断点布局+resize稳定性
- 顶层页面直接早退，仅在iframe内运行
- 捕获 Extension context invalidated 并静默清理
- WidgetEditorForm 内置“添加到页面”基础字段
- AddWidgetDialog 回传 pageId，PageBoard 按目标页添加并自动跳转
- 新增dom_picker content script，支持Shift逐级选父元素
- 后台接管action点击，写入pending并复用已打开newtab
## v0.1.1 - 2025-12-26

- 修复网页卡片权限
## v0.1.0 - 2025-12-26

- 新标签页可自由添加、移动和调整卡片
- 支持多页面切换与编辑模式
- 设置页：权限管理、备份与迁移、使用引导
- 支持导入/导出配置
