# trash-cleaner-mcp-server 中文说明

一个桌面端的 MCP 服务，提供用于扫描、分析和清理垃圾文件的工具，主要针对 macOS 进行了优化。

**请注意:** 大多数清理工具（`cleanAppCaches`, `cleanTempFiles`, `cleanAppRemnants`, `smartCleanSystem`）是专门为 **macOS** 设计和测试的。在其他系统上运行它们可能无法工作或导致意外行为。

## 可用工具 (主要功能)

该服务注册了多个可通过 MCP 协议调用的工具：

**macOS 清理工具 (针对 macOS 优化):**
*   `macOSWarning`: 如果在非 macOS 系统上运行，则显示警告。
*   `cleanAppCaches`: 清理各种应用程序缓存（用户缓存、应用保存状态）。
    *   选项: `dryRun` (布尔值, 默认: true), `olderThan` (整数, 可选 - 天数)。
*   `cleanTempFiles`: 清理系统临时文件。
    *   选项: `dryRun` (布尔值, 默认: true), `olderThan` (整数, 可选, 默认: 7 天)。
*   `cleanAppRemnants`: 扫描并清理已卸载应用程序残留的配置文件/缓存文件。
    *   选项: `appName` (字符串, 可选 - 部分名称匹配), `dryRun` (布尔值, 默认: true)。
*   `smartCleanSystem`: 根据预定义级别（针对常见垃圾位置）执行系统清理。
    *   选项: `cleanLevel` (枚举: "safe", "normal", "deep", 默认: "safe"), `dryRun` (布尔值, 默认: true)。

**跨平台工具 (扫描, 文件系统, 操作系统):**
*   `cleanVSCodeExtensions`: 清理 VS Code（及兼容编辑器如 VSCodium, Cursor）扩展的过时版本。
    *   选项: `editorPath` (字符串, 可选 - 特定编辑器扩展路径, 默认: 扫描所有已知位置), `dryRun` (布尔值, 默认: true)。
*   `reportVSCodeExtensions`: 生成报告，列出可清理的过时 VS Code 扩展。
    *   选项: `editorPath` (字符串, 可选)。
*   `findLargeFiles`: 在目录中查找超过指定大小的文件。
    *   选项: `path` (字符串), `minSize` (整数, 默认: 100MB), `maxDepth` (整数, 默认: 3)。
*   `scanFullSystem`: 扫描整个系统的文件结构（遵循排除规则）以报告空间使用情况。
    *   选项: `excludePaths` (字符串数组, 可选), `maxDepth` (整数, 默认: 10)。
*   `scanDirectory`: 分析特定目录内的内容和大小分布。
    *   选项: `path` (字符串), `excludePaths` (字符串数组, 可选), `maxDepth` (整数, 默认: 10), `includeSubdirs` (布尔值, 默认: true)。
*   `getFolderSize`: 计算并返回文件夹的总大小。
    *   选项: `path` (字符串)。
*   `listDirectory`: 列出指定路径下的文件和子目录。
    *   选项: `path` (字符串), `showHidden` (布尔值, 默认: false)。
*   `findFiles`: 在目录内搜索匹配特定模式（支持通配符）的文件。
    *   选项: `path` (字符串), `pattern` (字符串), `maxDepth` (整数, 默认: 5)。
*   `analyzeDirectory`: 提供目录内文件类型和大小分布的统计信息。
    *   选项: `path` (字符串), `includeSubdirs` (布尔值, 默认: true)。
*   `getFileHash`: 计算文件的 MD5, SHA1 或 SHA256 哈希值。
    *   选项: `path` (字符串), `algorithm` (枚举: "md5", "sha1", "sha256", 默认: "md5")。
*   `getFileType`: 获取基本文件信息，包括 MIME 类型。
    *   选项: `path` (字符串)。
*   `deletePath`: 删除指定的文件或文件夹（需要显式确认，对危险路径有额外检查）。
    *   选项: `path` (字符串), `confirm` (布尔值, 必须为 true), `dangerConfirm` (布尔值, 可选 - 删除高风险路径时需要)。
*   `checkPathExists`: 检查给定路径是否存在，并识别其是文件还是目录。
    *   选项: `path` (字符串)。
*   `getSystemType`: 返回操作系统标识符（例如：'darwin', 'win32', 'linux'）。

**审计工具:**
*   `viewAuditLog`: 查看应用程序主日志文件 (`combined.log`) 的最近日志行。
    *   选项: `lines` (整数, 默认: 100, 最大: 1000)。
*   `clearAuditLog`: **删除**主应用程序日志文件 (`combined.log`)。需要确认。
    *   选项: `confirm` (布尔值, 必须为 true)。

## 技术栈
- Bun.js
- TypeScript

## 使用方法
发布到 npm 后，可通过 bunx 运行 MCP 服务：

```sh
bunx @childhoodandy/trash-cleaner-mcp-server
```

1. 启动本服务。
2. 选择需要扫描的目录。
3. 点击"扫描"按钮，等待扫描完成。
4. 查看扫描结果，选择需要清理的文件。
5. 点击"清理"按钮，完成垃圾清理。

## 联系方式
如有问题或建议，请通过 issue 或邮箱联系我们。 