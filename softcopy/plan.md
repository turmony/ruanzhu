## 软著提交打包方案（代码页 + 操作说明书）

### 目录结构（已调整文件名）
- `softcopy/代码.docx`：源代码导出文件（建议 50 行/页，PDF 亦可）。
- `softcopy/操作说明书.docx`：操作说明书（20–30 页，推荐另存 PDF）。
- `softcopy/plan.md`：当前方案说明。

### 源代码推荐顺序（仅 JS，截取前若干行以控页）
> 目标：只取逻辑 JS，去掉 WXML/WXSS，并截取前段代码降低页数。

1. **全局入口**：`miniprogram/app.js`（全量）
2. **首页模块**：`miniprogram/pages/index/index.js`（截取前 400 行）
3. **分析模块**：`miniprogram/pages/analysis/analysis.js`（全量）
4. **站点详情模块**：`miniprogram/pages/station-detail/station-detail.js`（截取前 400 行）
5. **站点排名模块**：`miniprogram/pages/station-ranking/station-ranking.js`（截取前 400 行）
6. **模式识别模块**：`miniprogram/pages/pattern-recognition/pattern-recognition.js`（截取前 400 行）
7. **云函数（全量保留）**
   - `cloudfunctions/demandService/index.js`
   - `cloudfunctions/stationService/index.js`
   - `cloudfunctions/getBasicData/index.js`
8. **每日分析**：`miniprogram/pages/daily-insight/daily-insight.js`（全量）

**分页规则**：不插入分页符；在 Word 以等宽字体、固定行距（如 14–15 磅）手动分页，按需控制在 70–80 页；可再调整每个页面截取行数以进一步压缩。

### 操作说明书大纲（推荐 20–30 页）
1. 软件概述：功能、目标用户、运行环境、版本信息。
2. 安装与部署：微信开发者工具导入、云环境 ID 配置、数据库与云函数初始化步骤。
3. 数据说明：数据来源与范围（2021 年 5 月聚合数据）、主要集合字段简介。
4. 功能操作
   - 首页/地图总览：关键指标、热力标记查看。
   - 站点详情：站点选择、日期选择、趋势图表查看。
   - 时空分析：时间分布、热力图、联动视图。
   - 站点排名与对比：榜单切换、多站点对比。
   - 需求模式识别：聚类标签、典型曲线、异常提示。
   - 报告生成：长图/PDF 生成与导出（若已实现的部分）。
   - 个人中心：收藏、历史记录、主题/缓存设置。
5. 常见问题（FAQ）：云函数调用失败、地图/图表加载、权限与环境配置。
6. 版本与权属声明：软件名称、版本号、完成日期、著作权人。

### 生成与放置
- 将 60 页代码按上述顺序分页整理到 `softcopy/代码.docx`（可再导出 PDF）。
- 将操作说明书整理到 `softcopy/操作说明书.docx`（推荐另存 PDF）。
- 保留本文件，便于对照提交材料。

