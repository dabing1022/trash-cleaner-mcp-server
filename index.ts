#!/usr/bin/env bun

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import os from 'os';
import { registerOsTools } from "./tools/os";
import { registerFsTools } from "./tools/fs";
import { registerScanTools } from "./tools/scan";
import { registerCleanerTools } from "./tools/cleaner";
import pkg from './package.json' assert { type: 'json' };

// 检测操作系统
const IS_MACOS = os.platform() === 'darwin';

const server = new McpServer({
  name: "Trash Cleaner MCP Server",
  version: pkg.version
});

registerOsTools(server);
registerFsTools(server);
registerScanTools(server);
registerCleanerTools(server);

console.log('欢迎使用智能垃圾清理 MCP 服务！');
console.log('本工具将帮助您扫描和清理电脑中的垃圾文件。');
console.log(`当前操作系统: ${os.platform()} ${os.release()}`);

if (!IS_MACOS) {
  console.warn('警告: 当前清理工具主要针对 macOS 系统优化，在其他操作系统上可能无法正常工作。');
}

// 启动 MCP 服务
const transport = new StdioServerTransport();
await server.connect(transport);
