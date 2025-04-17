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

    // 清理日志工具
    registerTool(
        server,
        "clearAuditLog",
        "清空应用程序的主运行日志文件（combined.log）。这是一个破坏性操作，请谨慎使用！",
        {
            confirm: z.boolean().describe("必须设置为 true 才能执行清空操作。")
        },
        async (args: { confirm: boolean }) => {
            if (!args.confirm) {
                return {
                    content: [{ type: "text", text: "危险操作！未提供确认。请将 confirm 参数设置为 true 以清空日志文件。" }]
                };
            }

            try {
                logger.warn('清空审计日志请求', { confirmation: args.confirm }); // 使用 warn 级别记录此危险操作

                if (!AUDIT_LOG_FILE_PATH) {
                    throw new Error("审计日志文件路径 (AUDIT_LOG_FILE_PATH) 未在 logger.ts 中配置或导出。");
                }

                // 尝试清空文件内容，而不是删除
                await fs.truncate(AUDIT_LOG_FILE_PATH, 0);
                logger.info(`审计日志文件 (${AUDIT_LOG_FILE_PATH}) 已成功清空。`);
                
                return {
                    content: [{ type: "text", text: `审计日志文件 (${AUDIT_LOG_FILE_PATH}) 已成功清空。` }]
                };
            } catch (error: any) {
                // 如果文件不存在，也视为成功（因为它已经是空的）
                if (error.code === 'ENOENT') {
                     logger.info(`尝试清空的审计日志文件 (${AUDIT_LOG_FILE_PATH}) 不存在，无需操作。`);
                     return {
                        content: [{ type: "text", text: `审计日志文件 (${AUDIT_LOG_FILE_PATH}) 不存在，无需清空。` }]
                    };
                }
                // 其他错误
                logger.error('清空审计日志失败', { error: error.message || String(error) });
                return {
                    content: [{ type: "text", text: `清空审计日志文件 (${AUDIT_LOG_FILE_PATH}) 出错: ${error.message || String(error)}` }]
                };
            }
        }
    );

    logger.info('审计工具注册完成 (包含 viewAuditLog 和 clearAuditLog)');
} 