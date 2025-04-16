import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { registerTool } from "../utils/registerToolHelper";
import {
  scanDirectory,
  scanFullSystem,
  formatSystemScanResult,
  getCommonTempDirectories
} from "../utils/scanUtils";
import { formatDirectoryAnalysis } from "../utils/fileUtils";
import { expandHomeDir } from "../utils/pathUtil";

export function registerScanTools(server: McpServer) {
  // 全盘扫描工具
  registerTool(
    server,
    "scanFullSystem",
    "执行全盘扫描，识别文件分布和大小情况",
    {
      excludePaths: z.array(z.string()).optional().describe("要排除的路径数组"),
      maxDepth: z.number().int().min(1).max(20).default(10).describe("最大搜索深度"),
    },
    async (args: { excludePaths?: string[]; maxDepth: number }) => {
      try {
        // 添加常见系统目录到排除列表
        const excludePaths = args.excludePaths || [];
        const systemTempDirs = getCommonTempDirectories();
        const allExcludePaths = [...new Set([...excludePaths, ...systemTempDirs])];
        
        // 定义进度回调（在实际实现中可以通过 server.send 发送进度更新）
        const progressCallback = (progress: number, currentPath: string) => {
          console.log(`扫描进度: ${Math.floor(progress * 100)}%, 当前路径: ${currentPath}`);
        };
        
        // 执行全盘扫描
        const result = await scanFullSystem(
          allExcludePaths,
          args.maxDepth,
          progressCallback
        );
        
        // 格式化并返回结果
        const formattedResult = formatSystemScanResult(result);
        return {
          content: [{ type: "text", text: formattedResult }]
        };
      } catch (error: any) {
        return {
          content: [{ type: "text", text: `扫描错误: ${error.message || String(error)}` }]
        };
      }
    }
  );
  
  // 指定目录扫描工具
  registerTool(
    server,
    "scanDirectory",
    "扫描指定目录，分析文件分布和大小情况",
    {
      path: z.string().describe("目录路径"),
      excludePaths: z.array(z.string()).optional().describe("要排除的路径数组"),
      maxDepth: z.number().int().min(1).max(20).default(10).describe("最大搜索深度"),
      includeSubdirs: z.boolean().default(true).describe("是否包含子目录")
    },
    async (args: { path: string; excludePaths?: string[]; maxDepth: number; includeSubdirs: boolean }) => {
      try {
        const expandedPath = expandHomeDir(args.path);
        
        // 定义进度回调
        const progressCallback = (currentPath: string) => {
          console.log(`扫描目录: ${currentPath}`);
        };
        
        // 执行目录扫描
        const result = await scanDirectory(
          expandedPath,
          args.excludePaths || [],
          args.maxDepth,
          progressCallback
        );
        
        // 格式化并返回结果
        const formattedResult = formatDirectoryAnalysis(result, args.path);
        return {
          content: [{ type: "text", text: formattedResult }]
        };
      } catch (error: any) {
        return {
          content: [{ type: "text", text: `扫描错误: ${error.message || String(error)}` }]
        };
      }
    }
  );
} 