#!/usr/bin/env bun

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerOsTools } from "./tools/os";
import { registerFsTools } from "./tools/fs";
import { registerScanTools } from "./tools/scan";
import { registerCleanerTools } from "./tools/cleaner";
import { registerAuditTools } from "./tools/audit";
import pkg from './package.json' assert { type: 'json' };

const server = new McpServer({
  name: "Trash Cleaner MCP Server",
  version: pkg.version
});

registerOsTools(server);
registerFsTools(server);
registerCleanerTools(server);
registerScanTools(server);
registerAuditTools(server);

console.log('欢迎使用智能垃圾清理 MCP 服务！');
console.log('本工具将帮助您扫描和清理电脑中的垃圾文件。');

// 启动 MCP 服务
const transport = new StdioServerTransport();
await server.connect(transport);
