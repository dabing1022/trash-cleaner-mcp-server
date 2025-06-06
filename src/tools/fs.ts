import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { registerTool } from "../utils/registerToolHelper";
import {
    getFolderSizeInfo,
    listDirectoryContents,
    findFilesInDirectory,
    findPathsInDirectory,
    findDirectoriesInDirectory,
    analyzeDirectoryContents,
    formatDirectoryAnalysis,
    calculateFileHash,
    getFileInfo,
    formatFileInfo,
    checkPathExists,
} from "../utils/fileUtils.js";
import { expandHomeDir } from "../utils/pathUtil";
import { isDangerousTarget } from "../utils/dangerPatterns";
import { safeDeletePath } from "../utils/cleanerUtils.js";
import { exec } from "child_process";

export function registerFsTools(server: McpServer) {
    // 获取文件夹大小
    registerTool(
        server,
        "Fs_GetFolderSize",
        "获取指定文件夹的大小（字节）。",
        {
            path: z.string().describe("文件夹路径")
        },
        async (args: { path: string }) => {
            try {
                const result = await getFolderSizeInfo(args.path);
                return {
                    content: [{ type: "text", text: `Folder size: ${result.formattedSize}` }]
                };
            } catch (error: any) {
                return {
                    content: [{ type: "text", text: `Error: ${error.message || String(error)}` }]
                };
            }
        }
    );

    // 列出目录内容
    registerTool(
        server,
        "Fs_ListDirectory",
        "列出指定目录下的所有文件和子目录。",
        {
            path: z.string().describe("目录路径"),
            showHidden: z.boolean().default(false).describe("是否显示隐藏文件")
        },
        async (args: { path: string; showHidden: boolean }) => {
            try {
                const output = await listDirectoryContents(args.path, args.showHidden);
                return {
                    content: [{ type: "text", text: output }]
                };
            } catch (error: any) {
                return {
                    content: [{ type: "text", text: `Error: ${error.message || String(error)}` }]
                };
            }
        }
    );

    // 查找文件
    registerTool(
        server,
        "Fs_FindFiles",
        "在指定目录中查找符合条件的文件。",
        {
            path: z.string().describe("起始目录路径"),
            pattern: z.string().describe("文件名匹配模式（支持 * 和 ? 通配符）"),
            maxDepth: z.number().int().min(0).default(5).describe("最大搜索深度")
        },
        async (args: { path: string; pattern: string; maxDepth: number }) => {
            try {
                const results = await findFilesInDirectory(args.path, args.pattern, args.maxDepth);

                if (results.length === 0) {
                    return {
                        content: [{ type: "text", text: "未找到匹配的文件" }]
                    };
                }

                return {
                    content: [{ type: "text", text: results.join('\n') }]
                };
            } catch (error: any) {
                return {
                    content: [{ type: "text", text: `Error: ${error.message || String(error)}` }]
                };
            }
        }
    );

    // 查找文件和目录（新工具）
    registerTool(
        server,
        "Fs_FindPaths",
        "在指定目录中查找符合条件的文件和文件夹。",
        {
            path: z.string().describe("起始目录路径"),
            pattern: z.string().describe("名称匹配模式（支持 * 和 ? 通配符）"),
            maxDepth: z.number().int().min(0).default(5).describe("最大搜索深度"),
            includeFiles: z.boolean().default(true).describe("是否包含文件"),
            includeDirectories: z.boolean().default(true).describe("是否包含目录")
        },
        async (args: { path: string; pattern: string; maxDepth: number; includeFiles: boolean; includeDirectories: boolean }) => {
            try {
                const results = await findPathsInDirectory(
                    args.path,
                    args.pattern,
                    args.maxDepth,
                    args.includeFiles,
                    args.includeDirectories
                );

                if (results.length === 0) {
                    return {
                        content: [{ type: "text", text: "未找到匹配的路径" }]
                    };
                }

                return {
                    content: [{ type: "text", text: results.join('\n') }]
                };
            } catch (error: any) {
                return {
                    content: [{ type: "text", text: `Error: ${error.message || String(error)}` }]
                };
            }
        }
    );

    // 查找目录（新工具）
    registerTool(
        server,
        "Fs_FindDirectories",
        "在指定目录中查找符合条件的文件夹。",
        {
            path: z.string().describe("起始目录路径"),
            pattern: z.string().describe("文件夹名称匹配模式（支持 * 和 ? 通配符）"),
            maxDepth: z.number().int().min(0).default(5).describe("最大搜索深度")
        },
        async (args: { path: string; pattern: string; maxDepth: number }) => {
            try {
                const results = await findDirectoriesInDirectory(args.path, args.pattern, args.maxDepth);

                if (results.length === 0) {
                    return {
                        content: [{ type: "text", text: "未找到匹配的文件夹" }]
                    };
                }

                return {
                    content: [{ type: "text", text: results.join('\n') }]
                };
            } catch (error: any) {
                return {
                    content: [{ type: "text", text: `Error: ${error.message || String(error)}` }]
                };
            }
        }
    );

    // 文件统计
    registerTool(
        server,
        "Fs_AnalyzeDirectory",
        "分析目录中文件的类型分布、大小分布等信息。",
        {
            path: z.string().describe("目录路径"),
            includeSubdirs: z.boolean().default(true).describe("是否包含子目录")
        },
        async (args: { path: string; includeSubdirs: boolean }) => {
            try {
                const stats = await analyzeDirectoryContents(args.path, args.includeSubdirs);
                const output = formatDirectoryAnalysis(stats, args.path);

                return {
                    content: [{ type: "text", text: output }]
                };
            } catch (error: any) {
                return {
                    content: [{ type: "text", text: `Error: ${error.message || String(error)}` }]
                };
            }
        }
    );

    // 计算文件哈希
    registerTool(
        server,
        "Fs_GetFileHash",
        "计算文件的 MD5/SHA256 哈希值，用于文件完整性校验。",
        {
            path: z.string().describe("文件路径"),
            algorithm: z.enum(["md5", "sha1", "sha256"]).default("md5").describe("哈希算法")
        },
        async (args: { path: string; algorithm: string }) => {
            try {
                const digest = await calculateFileHash(args.path, args.algorithm);
                return {
                    content: [{ type: "text", text: `${args.algorithm.toUpperCase()}: ${digest}` }]
                };
            } catch (error: any) {
                return {
                    content: [{ type: "text", text: `Error: ${error.message || String(error)}` }]
                };
            }
        }
    );

    // 检查文件类型
    registerTool(
        server,
        "Fs_GetFileType",
        "获取文件的MIME类型和基本信息。",
        {
            path: z.string().describe("文件路径")
        },
        async (args: { path: string }) => {
            try {
                const fileInfo = await getFileInfo(args.path);
                const output = formatFileInfo(fileInfo);

                return {
                    content: [{ type: "text", text: output }]
                };
            } catch (error: any) {
                return {
                    content: [{ type: "text", text: `Error: ${error.message || String(error)}` }]
                };
            }
        }
    );

    // 删除文件或文件夹（支持移到垃圾桶）
    registerTool(
        server,
        "Fs_DeletePath",
        "删除指定文件或文件夹。默认永久删除，可通过 useTrash 选项移到系统垃圾桶。需用户确认。",
        {
            path: z.string().describe("要删除的文件或文件夹路径"),
            useTrash: z.boolean().optional().default(false).describe("为 true 时移到垃圾桶，否则永久删除"),
            confirm: z.boolean().describe("是否确认删除，必须为 true 才会执行删除"),
            dangerConfirm: z.boolean().optional().describe("高危操作再次确认，必须为 true 才能删除高危路径")
        },
        async (args: { path: string; useTrash?: boolean; confirm: boolean; dangerConfirm?: boolean }) => {
            if (!args.confirm) {
                return {
                    content: [{ type: "text", text: "危险操作！请确认是否删除该路径。请将 confirm 参数设置为 true 后再执行。" }]
                };
            }
            if (isDangerousTarget(args.path) && !args.dangerConfirm) {
                return {
                    content: [{ type: "text", text: "高危路径！请再次确认，dangerConfirm 参数必须为 true 才能删除。" }]
                };
            }
            // 真实删除逻辑 - 使用 safeDeletePath
            try {
                const result = await safeDeletePath(expandHomeDir(args.path), {
                    useTrash: args.useTrash,
                    dryRun: false
                });

                let message = "";
                if (result.success) {
                    message = args.useTrash
                        ? `路径 "${args.path}" 已成功移动到垃圾桶。`
                        : `路径 "${args.path}" 已成功永久删除。`;
                    message += ` 清理大小: ${(result.size / 1024).toFixed(2)} KB`;
                } else {
                    message = `删除路径 "${args.path}" 失败: ${result.error || '未知错误'}`;
                }

                return {
                    content: [{ type: "text", text: message }]
                };
            } catch (error: any) {
                return {
                    content: [{ type: "text", text: `删除失败: ${error.message || String(error)}` }]
                };
            }
        }
    );

    // 检查路径是否存在
    registerTool(
        server,
        "Fs_CheckPathExists",
        "检查指定的文件或目录路径是否存在。",
        {
            path: z.string().describe("要检查的文件或目录路径")
        },
        async (args: { path: string }) => {
            try {
                const result = await checkPathExists(expandHomeDir(args.path));

                if (result.exists) {
                    return {
                        content: [{ type: "text", text: `路径 "${args.path}" 存在，类型: ${result.type}` }]
                    };
                } else {
                    return {
                        content: [{ type: "text", text: `路径 "${args.path}" 不存在` }]
                    };
                }
            } catch (error: any) {
                return {
                    content: [{ type: "text", text: `检查失败: ${error.message || String(error)}` }]
                };
            }
        }
    );

    // 清空垃圾桶 (新工具)
    registerTool(
        server,
        "Fs_EmptyTrash",
        "清空操作系统垃圾桶。这是一个不可恢复的操作！请谨慎使用。",
        {
            confirm: z.boolean().describe("必须将此参数设置为 true 才能执行清空操作")
        },
        async (args: { confirm: boolean }) => {
            if (!args.confirm) {
                return {
                    content: [{ type: "text", text: "未确认操作！请将 confirm 参数设置为 true 以清空垃圾桶。" }]
                };
            }

            let command = "";
            if (process.platform === 'darwin') { // macOS
                // 使用 AppleScript 调用 Finder 清空垃圾桶，更安全
                command = 'osascript -e \'tell application "Finder" to empty trash\'';
            } else if (process.platform === 'win32') { // Windows
                // 使用 PowerShell 清空回收站
                command = 'powershell.exe -Command "Clear-RecycleBin -Force"';
            } else { // Linux 或其他
                // Linux 清理比较复杂，暂不支持，或可尝试 rm 命令（风险较高）
                // command = 'rm -rf ~/.local/share/Trash/files/* ~/.local/share/Trash/info/*';
                return {
                    content: [{ type: "text", text: `当前操作系统 (${process.platform}) 暂不支持自动清空垃圾桶。` }]
                };
            }

            try {
                await new Promise<void>((resolve, reject) => {
                    exec(command, (error, stdout, stderr) => {
                        if (error) {
                            reject(new Error(`执行命令失败: ${stderr || error.message}`));
                        } else {
                            resolve();
                        }
                    });
                });
                return {
                    content: [{ type: "text", text: "操作系统垃圾桶已成功清空。" }]
                };
            } catch (error: any) {
                return {
                    content: [{ type: "text", text: `清空垃圾桶失败: ${error.message || String(error)}` }]
                };
            }
        }
    );
}