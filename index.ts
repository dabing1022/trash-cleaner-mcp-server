#!/usr/bin/env bun

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerOsTools } from "./src/tools/os";
import { registerFsTools } from "./src/tools/fs";
import { registerScanTools } from "./src/tools/scan";
import { registerCleanerTools } from "./src/tools/cleaner";
import { registerAuditTools } from "./src/tools/audit";
import { registerSchedulerTools } from "./src/tools/scheduler";
import { registerScanJunkFilesTool } from "./src/tools/scanJunkFiles";
import { registerJunkRulesResource } from "./src/resources/junkRules";
import pkg from './package.json' assert { type: 'json' };


const server = new McpServer({
  name: "Trash Cleaner MCP Server",
  version: pkg.version
}, {
  capabilities: {
    tools: { list: true, call: true },
    resources: { list: true, read: true, listChanged: true },
    prompts: { list: true, get: true }
  }
});

registerOsTools(server);
registerFsTools(server);
registerCleanerTools(server);
registerScanTools(server);
registerScanJunkFilesTool(server);
registerAuditTools(server);
registerSchedulerTools(server);

// --- 注册资源处理器 ---
registerJunkRulesResource(server);

console.log('欢迎使用智能垃圾清理 MCP 服务！');
console.log('本工具将帮助您扫描和清理电脑中的垃圾文件。');

// 启动 MCP 服务
const transport = new StdioServerTransport();
await server.connect(transport);
