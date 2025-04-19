import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { logger } from "./logger"; // Assuming logger is available here

const TOOL_PREFIX = "TrashCleaner_";

// 定义工具实现函数的类型别名
type ToolImplementation = (args: any) => Promise<{ content: Array<{ type: "text"; text: string }> }>;

// --- 定义 ToolInfo 类型 和 toolRegistry Map ---
interface ToolInfo {
    handler: ToolImplementation;
    description: string;
    // Optional: Add schema later if needed for advanced matching
    // paramsSchema: z.ZodRawShape;
}

const toolRegistry = new Map<string, ToolInfo>();

/**
 * 注册 MCP 工具，自动添加统一前缀。
 * @param server McpServer 实例
 * @param name 工具的原始名称（不含前缀）
 * @param description 工具描述
 * @param params 工具参数的 Zod 模式定义
 * @param implementation 工具实现函数
 */
export function registerTool(
    server: McpServer,
    name: string,
    description: string,
    params: z.ZodRawShape = {},
    implementation: ToolImplementation
): void {
    const prefixedName = `${TOOL_PREFIX}${name}`;
    server.tool(
        prefixedName,
        description,
        params,
        async (args: any) => {
            try {
                const result = await implementation(args);
                return result;
            } catch (error: any) {
                logger.error(`Error executing tool: ${prefixedName}`, { error: error.message || String(error), args });
                return {
                    content: [{ type: "text", text: `Tool execution failed: ${error.message || String(error)}` }]
                };
            }
        }
    );
    // --- 存储 ToolInfo 到 toolRegistry ---
    toolRegistry.set(prefixedName, {
         handler: implementation,
         description: description
         // paramsSchema: params // Store schema if needed later
     });
    logger.debug(`Registered tool: ${prefixedName}`);
}

// --- 修改 executeTool 以使用 toolRegistry ---
/**
 * 在服务器内部执行一个已注册的工具。
 * @param toolName 工具的完整名称（包含前缀）
 * @param params 要传递给工具的参数
 * @returns 工具执行的结果
 * @throws 如果工具未找到或执行出错
 */
export async function executeTool(toolName: string, params: any): Promise<{ content: Array<{ type: "text"; text: string }> }> {
    const toolInfo = toolRegistry.get(toolName);
    if (!toolInfo) {
        logger.error(`Attempted to execute non-existent tool: ${toolName}`);
        throw new Error(`Tool not found: ${toolName}`);
    }

    logger.info(`Executing tool internally: ${toolName}`, { params });
    try {
        const result = await toolInfo.handler(params);
        logger.info(`Internal execution of ${toolName} completed.`);
        return result;
    } catch (error: any) {
        logger.error(`Internal execution of tool ${toolName} failed`, { error: error.message || String(error) });
        throw error;
    }
}

// --- 添加 getAllToolInfo 函数 ---
/**
 * 获取所有已注册工具的信息（名称和描述）。
 * @returns 返回一个包含工具名称和描述的数组。
 */
export function getAllToolsForMatching(): Array<{ name: string; description: string }> {
    const tools: Array<{ name: string; description: string }> = [];
    for (const [name, info] of toolRegistry.entries()) {
        tools.push({ name: name, description: info.description });
    }
    return tools;
}