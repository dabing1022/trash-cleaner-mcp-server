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

// Xcode Junk Rules
const XCODE_JUNK_RULES_URI = "file:///config/xcode_junk.json";
const XCODE_JUNK_RULES_PATH = resolve(
  import.meta.dirname,
  "../../src/config/xcode_junk.json"
);

// Function to register Xcode junk rules
export function registerXcodeJunkRulesResource(server: McpServer) {
  const metadata: ResourceMetadata = {
    description: "定义用于识别 Xcode 相关垃圾文件和缓存的规则。",
    mimeType: "application/json",
  };

  const readCallback: ReadResourceCallback = async (
    uri: URL
  ): Promise<ReadResourceResult> => {
    if (uri.toString() === XCODE_JUNK_RULES_URI) {
      try {
        // Check if the xcode file exists
        const fileExists = await Bun.file(XCODE_JUNK_RULES_PATH).exists();
        if (!fileExists) {
           logger.error(`Xcode junk rules file not found at ${XCODE_JUNK_RULES_PATH}`);
           // Return empty contents or throw, depending on desired behavior
           return { contents: [] };
        }
        const fileContent = await Bun.file(XCODE_JUNK_RULES_PATH).text();
        return {
          contents: [
            {
              uri: XCODE_JUNK_RULES_URI,
              mimeType: metadata.mimeType as string,
              text: fileContent,
            },
          ],
        };
      } catch (error) {
        logger.error(`Error reading Xcode junk rules ${uri}:`, error);
        throw new Error(`Resource not found or could not be read: ${uri}`);
      }
    }
    logger.warn(`Received unexpected URI ${uri} for Xcode junk rules`);
    return { contents: [] };
  };

  logger.info(`Registering Xcode junk rules resource at ${XCODE_JUNK_RULES_URI}`);
  server.resource("Xcode 垃圾清理规则配置", XCODE_JUNK_RULES_URI, metadata, readCallback);
} 