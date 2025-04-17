import type {
  McpServer,
  ReadResourceCallback,
  ResourceMetadata,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import type {
  ReadResourceResult,
} from "@modelcontextprotocol/sdk/types.js";
import { resolve } from "path";
import { logger } from "../utils/logger"; // 导入 logger

const JUNK_RULES_URI = "file:///config/junk_rules.json";
const JUNK_RULES_PATH = resolve(
  import.meta.dirname,
  "../../src/config/junk_rules.json"
); // 使用 import.meta.dirname 获取当前目录

export function registerJunkRulesResource(server: McpServer) {
  const metadata: ResourceMetadata = {
    description: "定义用于识别垃圾文件和缓存的规则。",
    mimeType: "application/json",
  };

  const readCallback: ReadResourceCallback = async (
    uri: URL
  ): Promise<ReadResourceResult> => {
    if (uri.toString() === JUNK_RULES_URI) {
      try {
        const fileContent = await Bun.file(JUNK_RULES_PATH).text();
        return {
          contents: [
            {
              uri: JUNK_RULES_URI,
              mimeType: metadata.mimeType as string,
              text: fileContent,
            },
          ],
        };
      } catch (error) {
        logger.error(`Error reading resource ${uri}:`, error); // 使用 logger.error
        // 根据 SDK 的期望，可能需要抛出特定类型的错误或返回空数组
        throw new Error(`Resource not found or could not be read: ${uri}`);
      }
    }
    // 对于固定 URI 注册，理论上不应收到其他 URI
    logger.warn(`Received unexpected URI ${uri} for junk rules resource`); // 使用 logger.warn
    return { contents: [] }; // 或者抛出错误
  };

  logger.info(`Registering junk rules resource at ${JUNK_RULES_URI}`); // 使用 logger.info
  server.resource("垃圾清理规则配置", JUNK_RULES_URI, metadata, readCallback);
} 