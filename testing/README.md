# 当前版本测试与报告

执行日期：2026-10-26（Australia/Sydney）。报告正文为英文；本目录说明为中文。

更新：三项真实 Gemini 冒烟测试均通过（同轮两项模拟 HTTP 测试也通过，共 5/5），结果现已整合进主报告。`reports/Live_AI_Successful_Retest_20261026.pdf` 保留单独的真实调用说明，原始日志为 `evidence/live-ai-latest.tap`。原确定性基线中的三项跳过仍按历史结果保留，主报告明确列出后续真实复测通过；更全面、重复的 AI 质量评估仍待执行。

## 先看这些文件

- `reports/Worldbuilding_Test_Report_20261026.pdf`：正式阅读版。
- `reports/Worldbuilding_Test_Report_20261026.md`：可编辑的英文源稿。
- `reports/Worldbuilding_Test_Report_20261026.html`：本地生成的 HTML 版本，不提交 Git。
- `reports/test-case-results.csv`：72 条后端基线叶子用例、13 条浏览器/观测用例及 3 条独立记录的真实 AI 复测结果，可用 Excel 打开；复测不计为新的独立用例。
- `test-plan/TEST_PLAN.md`：测试范围、验收主题对应、设计技术和待做的真实 AI 场景。
- `coverage/index.html`：后端逐文件/逐行覆盖率。
- `playwright-report/index.html`：浏览器交互报告。

## 本次结果

后端确定性基线叶子用例：68 通过、1 失败、3 跳过。Node 原始统计还包括两个父测试，因此显示 69 通过、2 失败、3 跳过；实际只有一个独立失败用例 Q14。三项历史跳过的真实 AI 用例随后均复测通过，单独列出，未篡改原运行统计。

浏览器：12 个用户流程和 1 个本机并发读取观测，13 项全部通过。前端单元测试 2 项通过；lint、类型检查和构建通过。后端行覆盖率 96.45%，分支覆盖率 89.14%。覆盖率不代表功能全部正确。

尚未修复的发现：

1. 注册 API 接受 `not-an-email`，与前端及资料修改 API 的邮箱约束不一致；Q14 保留失败。
2. 登录页 `.step-label` 的扫描对比度为 4.45:1，低于该规则要求的 4.5:1；仅扫描了一个页面。

真实 Gemini 调用已执行：普通问答、正文改写和草稿一致性检查均通过，使用 `gemini-3.8-flash`，各一次合成场景试验。已确认实际连接可用；五类场景各三次的完整质量评估尚未执行，不能把基础调用通过等同于全面质量保证。报告没有客户 UAT 签字，也没有完整官方 User Story 清单；US-T 编号是重建的验收主题。

## 复现

在根目录已有后端/前端依赖、已配置本机 MySQL 的前提下：

```sh
cd testing
npm ci
npx playwright install chromium
node scripts/run-backend.cjs
node scripts/frontend-checks.cjs
npm run test:browser
node scripts/verify-cleanup.cjs
python3 scripts/export-cases.py
node scripts/metadata.cjs
node scripts/report.cjs
node scripts/manifest.cjs
node scripts/export-summary.cjs
```

每条命令单独执行。Q14 未修复前，后端命令返回非零是预期的真实失败，仍会输出日志和覆盖率。不要使用 `&&` 把所有后续证据步骤挂在它后面。

测试需要本机端口、浏览器进程及独立测试库的 create/drop 权限。报告渲染需要 pandoc。浏览器测试使用 3390/3391 端口，创建 `wb_browser_test_<timestamp>`，退出时清理；后端集成测试各自创建临时库。不要改成使用业务数据库。`browser-fixture.json` 仅包含合成测试账号/会话，已忽略，不应作为凭据模板共享。

当前 macOS/Node 26 环境下 Playwright 下载后的自动解压曾停住，使用系统 ditto 解压同一份下载包后成功运行。配置对该 macOS Chromium 路径有回退；其他环境使用正常 Playwright 浏览器。多浏览器上下文曾触发 Playwright 内部 step-ID 日志警告；最终断言与 JSON 结果成功，部分嵌套步骤追踪可能不完整。

## 修改范围

新增测试在 `backend/test/*quality.test.js` 和本目录 `e2e/`。已有关系名称单元测试改为隔离数据库导入，避免纯校验测试连接业务数据库。没有修改应用业务逻辑，也没有为让测试全绿而移除失败用例。

原始证据位于 `evidence/`。历史测试脚本调试结果单独保留，最终统计仅取 `backend.junit.xml`、`browser-results.json` 等最终运行文件。报告中的所有图表来自已存证据；修改源稿后可重新生成 PDF。

## Git 提交范围

提交测试源代码、配置与锁文件、测试计划、正式 PDF/Markdown 报告、结果 CSV，以及 `evidence/` 中明确放行的四份脱敏摘要。`verification-summary.json` 由已有结果生成，只保留可移植的指标，不包含本机绝对路径或会话值。

依赖、覆盖率生成目录、原始运行日志、浏览器 trace/截图、调试归档、环境元数据、可再生 HTML、报告预览图和旧连接故障记录均已忽略；它们继续保留在本机，不会删除。复现命令会重新生成运行产物。完整证据包如需提交给老师，应另行检查后单独提供；Markdown 截图链接需要本地生成的 `test-results/`，PDF 内已嵌入代表性截图。

项目的真实 `backend/.env` 仍由根目录忽略规则保护。不要强制添加被忽略的凭据或原始产物。
