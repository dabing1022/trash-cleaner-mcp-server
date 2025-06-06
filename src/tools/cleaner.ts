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
import { 
  cleanVSCodeExtensions, 
  cleanAllVSCodeExtensions,
  generateVSCodeExtensionReport,
  generateAllVSCodeExtensionReports
} from "../utils/vscodeCleaners";
import { formatCleaningResult } from "../utils/cleanerUtils";
import { DEFAULT_CLEANING_OPTIONS } from "../utils/cleanerPaths";
import { logger } from "../utils/logger";

// 检测是否为 macOS 系统
const IS_MACOS = os.platform() === 'darwin';

export function registerCleanerTools(server: McpServer) {
  logger.info('正在注册清理工具', { component: 'cleaner', isMacOS: IS_MACOS });
  
  // 非 macOS 系统警告
  if (!IS_MACOS) {
    logger.warn('清理工具在非 macOS 系统上运行，部分功能可能不可用', { platform: os.platform() });
    registerTool(
      server,
      "Cleaner_MacOSWarning",
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
    "Cleaner_CleanAppCaches",
    "清理各种应用程序缓存文件，包括用户缓存目录、应用程序保存的状态等。仅适用于 macOS 系统。",
    {
      dryRun: z.boolean().default(true).describe("是否仅模拟执行而不实际删除文件"),
      olderThan: z.number().int().min(0).optional().describe("只清理超过指定天数未使用的文件"),
    },
    async (args: { dryRun: boolean; olderThan?: number }) => {
      try {
        logger.info('执行应用缓存清理', { dryRun: args.dryRun, olderThan: args.olderThan });
        
        // 非 macOS 系统警告
        if (!IS_MACOS) {
          logger.warn('在非 macOS 系统上尝试运行 macOS 专用清理工具', { platform: os.platform() });
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
        
        logger.info('应用缓存清理完成', { 
          cleanedPaths: result.cleanedPaths.length,
          totalSize: result.totalSize,
          errors: result.errors.length,
          dryRun: args.dryRun
        });
        
        return {
          content: [{ type: "text", text: output }]
        };
      } catch (error: any) {
        logger.error('应用缓存清理失败', { error: error.message || String(error) });
        return {
          content: [{ type: "text", text: `清理应用缓存出错: ${error.message || String(error)}` }]
        };
      }
    }
  );
  
  // 临时文件清理工具
  registerTool(
    server,
    "Cleaner_CleanTempFiles",
    "清理系统临时文件目录中的临时文件。仅适用于 macOS 系统。",
    {
      dryRun: z.boolean().default(true).describe("是否仅模拟执行而不实际删除文件"),
      olderThan: z.number().int().min(0).optional().describe("只清理超过指定天数未使用的文件"),
    },
    async (args: { dryRun: boolean; olderThan?: number }) => {
      try {
        logger.info('执行临时文件清理', { dryRun: args.dryRun, olderThan: args.olderThan });
        
        // 非 macOS 系统警告
        if (!IS_MACOS) {
          logger.warn('在非 macOS 系统上尝试运行 macOS 专用清理工具', { platform: os.platform() });
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
        
        logger.info('临时文件清理完成', { 
          cleanedPaths: result.cleanedPaths.length,
          totalSize: result.totalSize,
          errors: result.errors.length,
          dryRun: args.dryRun
        });
        
        return {
          content: [{ type: "text", text: output }]
        };
      } catch (error: any) {
        logger.error('临时文件清理失败', { error: error.message || String(error) });
        return {
          content: [{ type: "text", text: `清理临时文件出错: ${error.message || String(error)}` }]
        };
      }
    }
  );
  
  // 应用卸载残留清理工具
  registerTool(
    server,
    "Cleaner_CleanAppRemnants",
    "清理已卸载应用程序的配置文件、缓存和其他残留文件。仅适用于 macOS 系统。",
    {
      appName: z.string().optional().describe("应用程序名称（可选，部分匹配）"),
      dryRun: z.boolean().default(true).describe("是否仅模拟执行而不实际删除文件")
    },
    async (args: { appName?: string; dryRun: boolean }) => {
      try {
        logger.info('执行应用残留清理', { appName: args.appName, dryRun: args.dryRun });
        
        // 非 macOS 系统警告
        if (!IS_MACOS) {
          logger.warn('在非 macOS 系统上尝试运行 macOS 专用清理工具', { platform: os.platform() });
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
        
        logger.info('应用残留清理完成', { 
          appName: args.appName,
          cleanedPaths: result.cleanedPaths.length,
          totalSize: result.totalSize,
          errors: result.errors.length,
          dryRun: args.dryRun
        });
        
        return {
          content: [{ type: "text", text: output }]
        };
      } catch (error: any) {
        logger.error('应用残留清理失败', { appName: args.appName, error: error.message || String(error) });
        return {
          content: [{ type: "text", text: `清理应用残留出错: ${error.message || String(error)}` }]
        };
      }
    }
  );
  
  // 系统智能清理工具
  registerTool(
    server,
    "Cleaner_SmartCleanSystem",
    "智能清理系统垃圾文件，支持不同的清理级别。仅适用于 macOS 系统。",
    {
      cleanLevel: z.enum(["safe", "normal", "deep"]).default("safe").describe("清理级别: safe(安全), normal(标准), deep(深度)"),
      dryRun: z.boolean().default(true).describe("是否仅模拟执行而不实际删除文件")
    },
    async (args: { cleanLevel: "safe" | "normal" | "deep"; dryRun: boolean }) => {
      try {
        logger.info('执行智能系统清理', { cleanLevel: args.cleanLevel, dryRun: args.dryRun });
        
        // 非 macOS 系统警告
        if (!IS_MACOS) {
          logger.warn('在非 macOS 系统上尝试运行 macOS 专用清理工具', { platform: os.platform() });
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
        
        logger.info('智能系统清理完成', { 
          cleanLevel: args.cleanLevel,
          cleanedPaths: result.cleanedPaths.length,
          totalSize: result.totalSize,
          errors: result.errors.length,
          dryRun: args.dryRun
        });
        
        return {
          content: [{ 
            type: "text", 
            text: `执行${args.cleanLevel === "safe" ? "安全" : args.cleanLevel === "normal" ? "标准" : "深度"}清理:\n${output}` 
          }]
        };
      } catch (error: any) {
        logger.error('智能系统清理失败', { cleanLevel: args.cleanLevel, error: error.message || String(error) });
        return {
          content: [{ type: "text", text: `智能清理系统出错: ${error.message || String(error)}` }]
        };
      }
    }
  );
  
  // VSCode 扩展清理工具
  registerTool(
    server,
    "Cleaner_CleanVSCodeExtensions",
    "清理 VSCode 及相关编辑器的低版本扩展。",
    {
      editorPath: z.string().optional().describe("编辑器扩展目录路径，如不指定则清理所有编辑器"),
      dryRun: z.boolean().default(true).describe("是否仅模拟执行而不实际删除文件")
    },
    async (args: { editorPath?: string; dryRun: boolean }) => {
      try {
        logger.info('执行 VSCode 扩展清理', { editorPath: args.editorPath, dryRun: args.dryRun });
        
        const options = {
          ...DEFAULT_CLEANING_OPTIONS,
          dryRun: args.dryRun
        };
        
        let result;
        
        if (args.editorPath) {
          // 清理指定编辑器的扩展
          result = await cleanVSCodeExtensions(args.editorPath, options);
        } else {
          // 清理所有编辑器的扩展
          result = await cleanAllVSCodeExtensions(options);
        }
        
        const output = formatCleaningResult(result);
        
        logger.info('VSCode 扩展清理完成', { 
          editorPath: args.editorPath || '所有编辑器',
          cleanedPaths: result.cleanedPaths.length,
          totalSize: result.totalSize,
          errors: result.errors.length,
          dryRun: args.dryRun
        });
        
        return {
          content: [{ type: "text", text: output }]
        };
      } catch (error: any) {
        logger.error('VSCode 扩展清理失败', { editorPath: args.editorPath, error: error.message || String(error) });
        return {
          content: [{ type: "text", text: `清理 VSCode 扩展出错: ${error.message || String(error)}` }]
        };
      }
    }
  );

  // VSCode 扩展清理报告工具
  registerTool(
    server,
    "Cleaner_ReportVSCodeExtensions",
    "生成 VSCode 及相关编辑器低版本扩展的报告。",
    {
      editorPath: z.string().optional().describe("编辑器扩展目录路径，如不指定则报告所有编辑器")
    },
    async (args: { editorPath?: string }) => {
      try {
        logger.info('生成 VSCode 扩展报告', { editorPath: args.editorPath });
        
        let report;
        
        if (args.editorPath) {
          // 生成指定编辑器的报告
          report = await generateVSCodeExtensionReport(args.editorPath);
        } else {
          // 生成所有编辑器的报告
          report = await generateAllVSCodeExtensionReports();
        }
        
        logger.debug('VSCode 扩展报告生成完成', { editorPath: args.editorPath || '所有编辑器' });
        
        return {
          content: [{ type: "text", text: report }]
        };
      } catch (error: any) {
        logger.error('VSCode 扩展报告生成失败', { editorPath: args.editorPath, error: error.message || String(error) });
        return {
          content: [{ type: "text", text: `生成 VSCode 扩展报告出错: ${error.message || String(error)}` }]
        };
      }
    }
  );
  
  // 大文件扫描工具
  registerTool(
    server,
    "Cleaner_FindLargeFiles",
    "在指定目录中查找超过指定大小的大文件。",
    {
      path: z.string().describe("要扫描的目录路径"),
      minSize: z.number().int().min(1).default(100 * 1024 * 1024).describe("最小文件大小（字节），默认100MB"),
      maxDepth: z.number().int().min(1).default(3).describe("最大扫描深度")
    },
    async (args: { path: string; minSize: number; maxDepth: number }) => {
      try {
        logger.info('执行大文件扫描', { 
          path: args.path, 
          minSize: args.minSize, 
          maxDepth: args.maxDepth 
        });
        
        const options = {
          ...DEFAULT_CLEANING_OPTIONS,
          dryRun: true, // 始终为只读模式
          maxDepth: args.maxDepth
        };
        
        const largeFiles = await findLargeFiles(args.path, args.minSize, options);
        const output = formatLargeFilesResult(largeFiles);
        
        logger.info('大文件扫描完成', { 
          path: args.path,
          filesFound: largeFiles.length,
          totalSize: largeFiles.reduce((sum, file) => sum + file.size, 0)
        });
        
        return {
          content: [{ type: "text", text: output }]
        };
      } catch (error: any) {
        logger.error('大文件扫描失败', { 
          path: args.path, 
          minSize: args.minSize, 
          error: error.message || String(error) 
        });
        return {
          content: [{ type: "text", text: `查找大文件出错: ${error.message || String(error)}` }]
        };
      }
    }
  );
  
  logger.info('清理工具注册完成');
} 