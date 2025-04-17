import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import os from 'os';
import { registerTool } from "../utils/registerToolHelper";
import { 
  cleanAppCaches, 
  cleanTempFiles, 
  cleanAppRemnants,
  smartSystemClean,
  findLargeFiles,
  formatLargeFilesResult
} from "../utils/specializedCleaners";
import { formatCleaningResult } from "../utils/cleanerUtils";
import { DEFAULT_CLEANING_OPTIONS } from "../utils/cleanerPaths";

// 检测是否为 macOS 系统
const IS_MACOS = os.platform() === 'darwin';

export function registerCleanerTools(server: McpServer) {
  // 非 macOS 系统警告
  if (!IS_MACOS) {
    registerTool(
      server,
      "macOSWarning",
      "显示当前系统不是 macOS 的警告信息。",
      {},
      async () => {
        return {
          content: [{ 
            type: "text", 
            text: "警告：当前清理工具专为 macOS 系统设计，在其他操作系统上可能无法正常工作或可能造成意外后果。" 
          }]
        };
      }
    );
  }

  // 应用缓存清理工具
  registerTool(
    server,
    "cleanAppCaches",
    "清理各种应用程序缓存文件，包括用户缓存目录、应用程序保存的状态等。仅适用于 macOS 系统。",
    {
      dryRun: z.boolean().default(true).describe("是否仅模拟执行而不实际删除文件"),
      olderThan: z.number().int().min(0).optional().describe("只清理超过指定天数未使用的文件"),
    },
    async (args: { dryRun: boolean; olderThan?: number }) => {
      try {
        // 非 macOS 系统警告
        if (!IS_MACOS) {
          return {
            content: [{ 
              type: "text", 
              text: "错误：此工具仅适用于 macOS 系统。当前系统为 " + os.platform() + "。" 
            }]
          };
        }

        const options = {
          ...DEFAULT_CLEANING_OPTIONS,
          dryRun: args.dryRun,
          olderThan: args.olderThan
        };
        
        const result = await cleanAppCaches(options);
        const output = formatCleaningResult(result);
        
        return {
          content: [{ type: "text", text: output }]
        };
      } catch (error: any) {
        return {
          content: [{ type: "text", text: `清理应用缓存出错: ${error.message || String(error)}` }]
        };
      }
    }
  );
  
  // 临时文件清理工具
  registerTool(
    server,
    "cleanTempFiles",
    "清理系统临时文件目录中的临时文件。仅适用于 macOS 系统。",
    {
      dryRun: z.boolean().default(true).describe("是否仅模拟执行而不实际删除文件"),
      olderThan: z.number().int().min(0).optional().describe("只清理超过指定天数未使用的文件"),
    },
    async (args: { dryRun: boolean; olderThan?: number }) => {
      try {
        // 非 macOS 系统警告
        if (!IS_MACOS) {
          return {
            content: [{ 
              type: "text", 
              text: "错误：此工具仅适用于 macOS 系统。当前系统为 " + os.platform() + "。" 
            }]
          };
        }

        const options = {
          ...DEFAULT_CLEANING_OPTIONS,
          dryRun: args.dryRun,
          olderThan: args.olderThan || 7 // 默认清理7天以上的临时文件
        };
        
        const result = await cleanTempFiles(options);
        const output = formatCleaningResult(result);
        
        return {
          content: [{ type: "text", text: output }]
        };
      } catch (error: any) {
        return {
          content: [{ type: "text", text: `清理临时文件出错: ${error.message || String(error)}` }]
        };
      }
    }
  );
  
  // 应用卸载残留清理工具
  registerTool(
    server,
    "cleanAppRemnants",
    "清理已卸载应用程序的配置文件、缓存和其他残留文件。仅适用于 macOS 系统。",
    {
      appName: z.string().optional().describe("应用程序名称（可选，部分匹配）"),
      dryRun: z.boolean().default(true).describe("是否仅模拟执行而不实际删除文件")
    },
    async (args: { appName?: string; dryRun: boolean }) => {
      try {
        // 非 macOS 系统警告
        if (!IS_MACOS) {
          return {
            content: [{ 
              type: "text", 
              text: "错误：此工具仅适用于 macOS 系统。当前系统为 " + os.platform() + "。" 
            }]
          };
        }

        const options = {
          ...DEFAULT_CLEANING_OPTIONS,
          dryRun: args.dryRun
        };
        
        const result = await cleanAppRemnants(args.appName, options);
        const output = formatCleaningResult(result);
        
        return {
          content: [{ type: "text", text: output }]
        };
      } catch (error: any) {
        return {
          content: [{ type: "text", text: `清理应用残留出错: ${error.message || String(error)}` }]
        };
      }
    }
  );
  
  // 系统智能清理工具
  registerTool(
    server,
    "smartCleanSystem",
    "智能清理系统垃圾文件，支持不同的清理级别。仅适用于 macOS 系统。",
    {
      cleanLevel: z.enum(["safe", "normal", "deep"]).default("safe").describe("清理级别: safe(安全), normal(标准), deep(深度)"),
      dryRun: z.boolean().default(true).describe("是否仅模拟执行而不实际删除文件")
    },
    async (args: { cleanLevel: "safe" | "normal" | "deep"; dryRun: boolean }) => {
      try {
        // 非 macOS 系统警告
        if (!IS_MACOS) {
          return {
            content: [{ 
              type: "text", 
              text: "错误：此工具仅适用于 macOS 系统。当前系统为 " + os.platform() + "。" 
            }]
          };
        }

        const options = {
          ...DEFAULT_CLEANING_OPTIONS,
          dryRun: args.dryRun
        };
        
        const result = await smartSystemClean(args.cleanLevel, options);
        const output = formatCleaningResult(result);
        
        return {
          content: [{ 
            type: "text", 
            text: `执行${args.cleanLevel === "safe" ? "安全" : args.cleanLevel === "normal" ? "标准" : "深度"}清理:\n${output}` 
          }]
        };
      } catch (error: any) {
        return {
          content: [{ type: "text", text: `智能清理系统出错: ${error.message || String(error)}` }]
        };
      }
    }
  );
  
  // 大文件扫描工具
  registerTool(
    server,
    "findLargeFiles",
    "在指定目录中查找超过指定大小的大文件。",
    {
      path: z.string().describe("要扫描的目录路径"),
      minSize: z.number().int().min(1).default(100 * 1024 * 1024).describe("最小文件大小（字节），默认100MB"),
      maxDepth: z.number().int().min(1).default(3).describe("最大扫描深度")
    },
    async (args: { path: string; minSize: number; maxDepth: number }) => {
      try {
        const options = {
          ...DEFAULT_CLEANING_OPTIONS,
          dryRun: true, // 始终为只读模式
          maxDepth: args.maxDepth
        };
        
        const largeFiles = await findLargeFiles(args.path, args.minSize, options);
        const output = formatLargeFilesResult(largeFiles);
        
        return {
          content: [{ type: "text", text: output }]
        };
      } catch (error: any) {
        return {
          content: [{ type: "text", text: `查找大文件出错: ${error.message || String(error)}` }]
        };
      }
    }
  );
} 