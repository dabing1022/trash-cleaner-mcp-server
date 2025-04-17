import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { registerTool } from "../utils/registerToolHelper";
import { readLastLines } from "../utils/fileUtils"; 
import { logger, AUDIT_LOG_FILE_PATH } from "../utils/logger"; 
import fs from "fs/promises";

/**
 * 注册与审计相关的工具
 * @param server McpServer 实例
 */
export function registerAuditTools(server: McpServer) {
    registerTool(
        server,
        "viewAuditLog",
        "查看应用程序最近的运行日志（combined.log）。",
        {
            lines: z.number().int().min(1).max(1000).default(100).describe("要查看的最近日志行数 (默认 100, 最大 1000)")
            // TODO: 未来可以添加 level, since, until, keyword 等过滤参数
        },
        async (args: { lines: number }) => {
            try {
                logger.info('查看审计日志请求', { lines: args.lines });
                
                if (!AUDIT_LOG_FILE_PATH) {
                    throw new Error("审计日志文件路径 (AUDIT_LOG_FILE_PATH) 未在 logger.ts 中配置或导出。");
                }
                
                // 检查日志文件是否存在
                try {
                    await fs.access(AUDIT_LOG_FILE_PATH);
                } catch (err) {
                    return {
                        content: [{ type: "text", text: `审计日志文件 (${AUDIT_LOG_FILE_PATH}) 不存在或不可读。` }]
                    };
                }

                const logLines = await readLastLines(AUDIT_LOG_FILE_PATH, args.lines);
                
                if (logLines.length === 0) {
                     return {
                        content: [{ type: "text", text: `审计日志文件 (${AUDIT_LOG_FILE_PATH}) 为空或读取时发生错误。` }]
                    };
                }
                
                // 日志是 JSON 格式，美化输出可能更好，但直接返回原始行更通用
                // const formattedLogs = logLines.map(line => JSON.parse(line)); // 如果需要解析
                return {
                    content: [{ type: "text", text: logLines.join('\n') }]
                };
            } catch (error: any) {
                logger.error('查看审计日志失败', { error: error.message || String(error) });
                return {
                    content: [{ type: "text", text: `查看日志出错: ${error.message || String(error)}` }]
                };
            }
        }
    );

    logger.info('审计工具注册完成');
} 