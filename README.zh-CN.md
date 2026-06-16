# Nolia Reader

[English](README.md) | [简体中文](README.zh-CN.md)

Nolia Reader 是一个本地优先的浏览器扩展，用于阅读、转换和导出 Markdown 网页。它可以渲染原始 Markdown 页面、本地 Markdown 文件、代码托管平台上的文档以及 Mermaid 片段，并且不会将文档内容发送到远程服务。

## 功能

- 自动检测原始 URL、`.md` 文件、Markdown 内容类型以及浏览器纯文本页面中的 Markdown。
- 在常见代码托管平台的 README 或 blob 页面中进行内联渲染。
- 完整阅读器模式，支持目录、预览/源码切换、主题切换、内容宽度、代码复制、阅读进度以及返回原始浏览器视图。
- 支持 GitHub Flavored Markdown、表格、任务列表、脚注、frontmatter、callout、wiki 链接、语法高亮、Mermaid 和 KaTeX。
- 支持 Markdown 下载、HTML 导出、打印为 PDF 以及离线 zip 包导出。
- 使用 Readability 和 Turndown 将网页转换为 Markdown。
- 默认在本地处理，无遥测。

## 从源码安装

```sh
npm install
npm run build
```

加载未打包的扩展：

- Chrome：打开 `chrome://extensions/`，启用开发者模式，然后加载 `dist/chrome`。
- Edge：打开 `edge://extensions/`，启用开发者模式，然后加载 `dist/edge`。
- Firefox：打开 `about:debugging#/runtime/this-firefox`，并加载 `dist/firefox/manifest.json`。

生成打包产物：

```sh
npm run package
```

## 开发

```sh
npm run typecheck
npm run lint
npm test
npm run build:chrome
```

完整校验：

```sh
npm run verify
```

端到端测试会通过 Playwright 加载真实的未打包扩展运行：

```sh
npm run e2e
```

## 仓库结构

- `src/background`：扩展 service worker、下载和动态内容脚本注册。
- `src/content`：内容脚本运行时、Markdown 检测、托管页面适配器、Mermaid 增强和网页提取。
- `src/reader`：阅读器 UI 和文档渲染控制。
- `src/renderer`：Markdown 管线、HTML 导出生成、frontmatter 和目录辅助逻辑。
- `src/popup`：扩展弹窗。
- `src/options`：选项页。
- `src/shared`：消息类型、设置、浏览器封装、URL、文件名和 i18n。
- `tests`：单元测试和扩展端到端测试。
- `docs`：架构和开发说明。

## 隐私

Nolia Reader 会在浏览器本地渲染和转换文档。扩展不会将 Markdown 内容、转换后的 HTML 或网页文本上传到外部服务。

主机权限是可选的，用于为用户允许的网站启用自动渲染。本地 Markdown 文档的文件访问权限需要在浏览器扩展详情页中启用。

## 文档

- [架构](docs/architecture.md)
- [开发与 QA](docs/development.md)

## 许可证

MIT
