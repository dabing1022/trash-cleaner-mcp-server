import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { logger } from "./logger"; // Assuming logger is available here

const TOOL_PREFIX = "[TrashCleaner] ";

// 定义工具实现函数的类型别名，以便类型提示
type ToolImplementation = (args: any) => Promise<{ content: Array<{ type: "text"; text: string }> }>;

// --- 添加 Map 来存储工具处理函数 ---
const toolHandlers = new Map<string, ToolImplementation>();

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
        async (args: any) => { // Ensure handler is async
            try {
                // Call the original implementation
                const result = await implementation(args);
                return result;
            } catch (error: any) {
                logger.error(`Error executing tool: ${prefixedName}`, { error: error.message || String(error), args });
                // Re-throw or return an error structure? Let's return error structure for MCP
                return {
                    content: [{ type: "text", text: `Tool execution failed: ${error.message || String(error)}` }]
                };
            }
        }
    );
    // --- 存储处理函数引用 ---
    // Note: Storing the raw implementation, assuming executeTool will handle errors
    toolHandlers.set(prefixedName, implementation);
    logger.debug(`Registered tool: ${prefixedName}`);
}


// --- 添加 executeTool 函数 ---
/**
 * 在服务器内部执行一个已注册的工具。
 * @param toolName 工具的完整名称（包含前缀）
 * @param params 要传递给工具的参数
 * @returns 工具执行的结果
 * @throws 如果工具未找到或执行出错
 */
export async function executeTool(toolName: string, params: any): Promise<{ content: Array<{ type: "text"; text: string }> }> {
    const handler = toolHandlers.get(toolName);
    if (!handler) {
        logger.error(`Attempted to execute non-existent tool: ${toolName}`);
        throw new Error(`Tool not found: ${toolName}`);
    }

    logger.info(`Executing tool internally: ${toolName}`, { params });
    try {
        // Directly call the stored handler
        const result = await handler(params);
        logger.info(`Internal execution of ${toolName} completed.`);
        return result;
    } catch (error: any) {
        logger.error(`Internal execution of tool ${toolName} failed`, { error: error.message || String(error) });
        // Re-throw the error to be handled by the caller (e.g., scheduler)
        throw error;
    }
}