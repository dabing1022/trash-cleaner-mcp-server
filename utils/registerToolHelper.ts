import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

const TOOL_PREFIX = "[TrashCleaner] ";

// 定义工具实现函数的类型别名，以便类型提示
type ToolImplementation = (args: any) => Promise<{ content: Array<{ type: "text"; text: string }> }>;

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
        implementation
    );
}