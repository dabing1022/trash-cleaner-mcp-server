import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { registerTool } from "../utils/registerToolHelper";
import {
    getFolderSizeInfo,
    listDirectoryContents,
    findFilesInDirectory,
    analyzeDirectoryContents,
    formatDirectoryAnalysis,
    calculateFileHash,
    getFileInfo,
    formatFileInfo
} from "../utils/fileUtils";

export function registerFsTools(server: McpServer) {
    // 获取文件夹大小
    registerTool(
        server,
        "getFolderSize",
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
        "listDirectory",
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

    // 文件查找
    registerTool(
        server,
        "findFiles",
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

    // 文件统计
    registerTool(
        server,
        "analyzeDirectory",
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
        "getFileHash",
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
        "getFileType",
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
}