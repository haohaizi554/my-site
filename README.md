# 编译原理自测工具

这是基于 `编译原理.md` 生成的本地自测工具。它不需要服务器，打开 `app/index.html` 就可以做题。

## 目录结构

- `编译原理.md`：原始题库。
- `tools/parse-questions.js`：把 Markdown 题库解析成结构化数据。
- `tools/validate-questions.js`：校验题库数据质量。
- `app/index.html`：本地自测页面入口。
- `app/app.js`：做题、判分、错题、统计逻辑。
- `app/style.css`：界面样式。
- `app/questions.json`：结构化题库数据。
- `app/questions.js`：浏览器直接打开时使用的题库数据。
- `docx/`：调研、需求分析、复习资料和解析报告。

## 常用命令

```bash
npm run parse
npm run validate
npm run check
```

## 当前功能

- 顺序练习
- 随机 20 题
- 错题复习
- 模拟考试
- 单选、多选、判断题自动判分
- 综合题参考答案与自评
- 本地进度保存
- 章节统计和错题列表

## 设计边界

- 不需要登录。
- 不依赖网络。
- 不做综合题机器判分。
- 题库更新后先运行 `npm run parse`，再运行 `npm run validate`。
