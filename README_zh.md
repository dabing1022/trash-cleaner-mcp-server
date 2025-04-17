# 智能垃圾清理 MCP 服务 (中文)

一个专为桌面系统（初期支持 macOS，计划支持跨平台）设计的智能垃圾清理 Model Context Protocol (MCP) 服务器。

## 功能特性

*   **跨平台:** (计划中) 支持 Windows, macOS, Linux。
*   **智能扫描:** 识别各种类型的垃圾文件（缓存、日志、临时文件等）。
*   **选择性清理:** 提供清理特定区域的工具，如应用程序缓存、临时文件、应用残留等。
*   **VS Code 扩展管理:** 用于查找和清理旧的/未使用的 VS Code 扩展的工具。
*   **文件系统工具:** 提供目录分析、文件查找、大小计算、删除等工具。
*   **系统信息:** 基本的操作系统类型检测。
*   **审计日志:** 通过 `[Audit]` 工具追踪操作。
*   **定时任务:** 使用灵活的调度器自动化执行清理和其他任务。
    *   使用 cron 表达式或简单间隔定义任务。
    *   可指定执行任意已注册的工具。
    *   通过精确工具名 (`toolName`) 或自然语言查询 (`toolQuery`) 进行模糊匹配来创建/更新任务。
    *   完整的任务管理功能（列表、详情、更新、启用/禁用、删除）。
    *   支持手动触发和执行历史追踪。

## 核心 MCP 工具

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

### 定时任务 (`[Schedule]` 工具)

提供调度执行其他已注册工具的功能。

*   **`[Schedule] createTask`**: 创建一个新的定时任务。
    *   需要 `name`, `cronExpression`。
    *   需要 *二选一*：`toolName` (精确工具名，如 `"[TrashCleaner] cleanAppCaches"`) *或* `toolQuery` (模糊描述，如 `"清理应用缓存"`)。
    *   可选 `toolParams`, `enabled`。
*   **`[Schedule] listTasks`**: 列出所有已配置的定时任务及其状态。
*   **`[Schedule] getTaskDetails`**: 获取指定 ID 任务的详细信息。
*   **`[Schedule] updateTask`**: 更新现有任务。可修改名称、计划、目标工具（通过 `toolName` 或 `toolQuery`）、参数和启用状态。
*   **`[Schedule] enableTask`**: 启用一个已禁用的任务。
*   **`[Schedule] disableTask`**: 禁用一个已启用的任务。
*   **`[Schedule] deleteTask`**: 永久删除一个定时任务。
*   **`[Schedule] runTaskNow`**: 立即手动触发执行一个任务。
*   **`[Schedule] getTaskHistory`**: 获取任务最近的执行历史（成功/失败）。

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

## 安装

```bash
# 克隆仓库
git clone <repository-url>
cd trash-cleaner-mcp-server

# 安装依赖 (使用 Bun)
bun install
```

## 运行服务

```bash
bun start
```

## 配置

*   日志配置位于 `src/utils/logger.ts`。
*   定时任务定义存储在 `~/.trash-cleaner/schedules.json` 文件中。

## 开发

*(保留开发指南...)* 