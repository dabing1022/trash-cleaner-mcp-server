#!/usr/bin/env bun

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { registerSystemTools } from "./tools/system";

const server = new McpServer({
  name: "Trash Cleaner MCP Server",
  version: "0.1.0"
});

registerSystemTools(server);

console.log('欢迎使用智能垃圾清理 MCP 服务！');
console.log('本工具将帮助您扫描和清理电脑中的垃圾文件。');

// 启动 MCP 服务
const transport = new StdioServerTransport();
await server.connect(transport);
