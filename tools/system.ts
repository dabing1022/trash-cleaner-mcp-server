import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { registerTool } from "../utils/registerToolHelper";

export function registerSystemTools(server: McpServer) {
    registerTool(
        server,
        "getSystemType",
        "获取当前操作系统的类型（例如：darwin, win32, linux）。",
        {},
        async () => ({
            content: [{ type: "text", text: `System type: ${process.platform}` }]
        })
    );
}