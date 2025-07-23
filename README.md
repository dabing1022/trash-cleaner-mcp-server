# trash-cleaner-mcp-server

[中文 README](./README_zh.md)

A desktop MCP service providing tools to scan, analyze, and clean junk files, primarily optimized for macOS.

**Note:** Most cleaning tools (`cleanAppCaches`, `cleanTempFiles`, `cleanAppRemnants`, `smartCleanSystem`) are designed and tested specifically for **macOS**. Running them on other systems might not work or lead to unexpected behavior.

## Features

*   **Cross-Platform:** (Planned) Windows, macOS, Linux support.
*   **Intelligent Scanning:** Identifies various types of junk files (caches, logs, temp files, etc.).
*   **Selective Cleaning:** Tools for cleaning specific areas like application caches, temp files, and application remnants.
*   **VS Code Extension Management:** Tools to find and clean old/unused VS Code extensions.
*   **Filesystem Utilities:** Tools for directory analysis, file finding, size calculation, deletion, etc.
*   **System Information:** Basic OS detection.
*   **Audit Logging:** Tracks operations via `[Audit]` tools.
*   **Scheduled Tasks:** Automate cleaning and other tasks using a flexible scheduler.
    *   Define tasks using cron expressions or simple intervals.
    *   Target any registered tool for execution.
    *   Create/update tasks using exact tool names (`toolName`) or natural language queries (`toolQuery`) via fuzzy matching.
    *   Full task management (list, details, update, enable/disable, delete).
    *   Manual triggering and execution history tracking.

## Available Tools (Features)

This server registers several tools callable via the MCP protocol:

**macOS Cleaning Tools (Optimized for macOS):**
*   `macOSWarning`: Displays a warning if run on a non-macOS system.
*   `cleanAppCaches`: Cleans various application caches (user cache, saved app state).
    *   Options: `dryRun` (bool, default: true), `olderThan` (int, optional - days).
*   `cleanTempFiles`: Cleans system temporary files.
    *   Options: `dryRun` (bool, default: true), `olderThan` (int, optional, default: 7 days).
*   `cleanAppRemnants`: Scans for and cleans configuration/cache files left by uninstalled applications.
    *   Options: `appName` (string, optional - partial name match), `dryRun` (bool, default: true).
*   `smartCleanSystem`: Performs system cleaning based on predefined levels (targets common junk locations).
    *   Options: `cleanLevel` (enum: "safe", "normal", "deep", default: "safe"), `dryRun` (bool, default: true).

**Cross-Platform Tools (Scanning, File System, OS):**
*   `cleanVSCodeExtensions`: Cleans outdated versions of VS Code (and compatible editors like VSCodium, Cursor) extensions.
    *   Options: `editorPath` (string, optional - path to specific editor's extensions, default: scans all known locations), `dryRun` (bool, default: true).
*   `reportVSCodeExtensions`: Generates a report listing outdated VS Code extensions that can be cleaned.
    *   Options: `editorPath` (string, optional).
*   `findLargeFiles`: Finds files exceeding a specified size within a directory.
    *   Options: `path` (string), `minSize` (int, default: 100MB), `maxDepth` (int, default: 3).
*   `scanFullSystem`: Scans the entire system's file structure (respecting exclusions) to report on space usage.
    *   Options: `excludePaths` (string[], optional), `maxDepth` (int, default: 10).
*   `scanDirectory`: Analyzes the contents and size distribution within a specific directory.
    *   Options: `path` (string), `excludePaths` (string[], optional), `maxDepth` (int, default: 10), `includeSubdirs` (bool, default: true).
*   `getFolderSize`: Calculates and returns the total size of a folder.
    *   Options: `path` (string).
*   `listDirectory`: Lists the files and subdirectories within a specified path.
    *   Options: `path` (string), `showHidden` (bool, default: false).
*   `findFiles`: Searches for files matching a specific pattern (wildcards supported) within a directory.
    *   Options: `path` (string), `pattern` (string), `maxDepth` (int, default: 5).
*   `analyzeDirectory`: Provides statistics on file types and size distribution within a directory.
    *   Options: `path` (string), `includeSubdirs` (bool, default: true).
*   `getFileHash`: Computes the MD5, SHA1, or SHA256 hash of a file.
    *   Options: `path` (string), `algorithm` (enum: "md5", "sha1", "sha256", default: "md5").
*   `getFileType`: Retrieves basic file information, including MIME type.
    *   Options: `path` (string).
*   `deletePath`: Deletes a specified file or folder (requires explicit confirmation, with extra checks for dangerous paths).
    *   Options: `path` (string), `confirm` (bool, must be true), `dangerConfirm` (bool, optional - required for potentially risky deletions).
*   `checkPathExists`: Checks if a given path exists and identifies if it's a file or directory.
    *   Options: `path` (string).
*   `getSystemType`: Returns the operating system identifier (e.g., 'darwin', 'win32', 'linux').

**Audit Tools:**
*   `viewAuditLog`: Views the most recent lines from the application's main log file (`combined.log`).
    *   Options: `lines` (int, default: 100, max: 1000).
*   `clearAuditLog`: **Deletes** the main application log file (`combined.log`). Requires confirmation.
    *   Options: `confirm` (bool, must be true).

### Scheduled Tasks (`TrashCleaner_Scheduler` Tools)

Provides functionality to schedule the execution of other registered tools.

*   **`TrashCleaner_Scheduler_CreateTask`**: Creates a new scheduled task.
    *   Requires `name`, `cronExpression`.
    *   Requires *either* `toolName` (exact tool name like `"TrashCleaner_CleanAppCaches"`) *or* `toolQuery` (fuzzy description like `"clean app caches"`).
    *   Optional `toolParams`, `enabled`.
*   **`TrashCleaner_Scheduler_ListTasks`**: Lists all configured scheduled tasks and their status.
*   **`TrashCleaner_Scheduler_GetTaskDetails`**: Gets detailed information about a specific task by ID.
*   **`TrashCleaner_Scheduler_UpdateTask`**: Updates an existing task. Can modify name, schedule, target tool (via `toolName` or `toolQuery`), parameters, and enabled status.
*   **`TrashCleaner_Scheduler_EnableTask`**: Enables a disabled task.
*   **`TrashCleaner_Scheduler_DisableTask`**: Disables an enabled task.
*   **`TrashCleaner_Scheduler_DeleteTask`**: Permanently deletes a scheduled task.
*   **`TrashCleaner_Scheduler_RunTaskNow`**: Manually triggers the execution of a task immediately.
*   **`TrashCleaner_Scheduler_GetTaskHistory`**: Retrieves the recent execution history (success/failure) for a task.

## Tech Stack
- Bun.js
- TypeScript

## Usage
After publishing to npm, you can run the MCP server using either Bun or npm:

**Using Bun:**
```sh
bunx @childhoodandy/trash-cleaner-mcp-server
# or with auto-install
bunx -y @childhoodandy/trash-cleaner-mcp-server
```

**Using npm:**
```sh
npx @childhoodandy/trash-cleaner-mcp-server
# or with auto-install
npx -y @childhoodandy/trash-cleaner-mcp-server
```

## Installation

```bash
# Clone the repository
git clone <repository-url>
cd trash-cleaner-mcp-server

# Install dependencies (using Bun)
bun install
```

## Running the Server

```bash
bun start
```

## Configuration

*   Logging configuration is in `src/utils/logger.ts`.
*   Scheduled task definitions are stored in `~/.trash-cleaner/schedules.json`.

## Development

*(Development guidelines remain here...)*
