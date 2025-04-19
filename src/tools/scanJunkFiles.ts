import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import os from 'os';
import fs from 'fs/promises';
import path from 'path';
import glob from 'fast-glob'; // 需要安装 fast-glob
import { resolvePath } from '../utils/pathUtil'; // 假设有一个路径解析工具
import { registerTool } from "../utils/registerToolHelper";
import { logger } from '../utils/logger';

// --- 1. 定义规则结构 (可以在单独的 .d.ts 文件中) ---
interface JunkRule {
    /** 描述规则用途 */
    description?: string;
    /** 匹配路径模式 (支持 ~, %VAR%, *) */
    pathPattern: string;
    /** 适用的平台 ('darwin', 'win32', 'linux') */
    platforms: ('darwin' | 'win32' | 'linux')[];
    /** (可选) 递归扫描的最大深度, 默认 0 (不递归) */
    maxDepth?: number;
    /** (可选) 文件最小存在时间 (天), 早于此时间才算作垃圾 */
    minAgeDays?: number;
}

interface JunkRulesConfig {
    [category: string]: JunkRule[];
}

// --- 类型定义 (Input/Output) ---
// 从 Schema 生成或手动定义输入类型
interface ScanJunkFilesInput {
    categories?: string[];
    olderThan?: number;
}

// --- 2. 加载规则 ---
async function loadJunkRules(): Promise<JunkRulesConfig> {
    const currentModuleUrl = import.meta.url;
    const currentModulePath = new URL(currentModuleUrl).pathname;
    const correctedPath = os.platform() === 'win32' && currentModulePath.startsWith('/')
        ? currentModulePath.substring(1)
        : currentModulePath;
    const currentDir = path.dirname(correctedPath);
    // 修正路径解析，确保相对路径正确
    const rulesPath = path.resolve(currentDir, '..', 'config', 'junk_rules.json');
    logger.debug(`[loadJunkRules] Loading rules from: ${rulesPath}`);

    try {
        const content = await fs.readFile(rulesPath, 'utf-8');
        return JSON.parse(content) as JunkRulesConfig;
    } catch (error) {
        logger.error(`[loadJunkRules] Failed to load junk rules from ${rulesPath}`, error);
        return {};
    }
}

// --- 3. 扫描逻辑 ---
type SupportedPlatform = 'darwin' | 'win32' | 'linux';

async function scanByCategory(
    category: string,
    rules: JunkRule[],
    currentPlatform: SupportedPlatform, // 明确使用支持的平台类型
    options: { olderThan?: number } = {}
): Promise<{ category: string; files: string[]; totalSize: number }> {
    let foundFiles: string[] = [];
    let totalSize = 0;
    // 过滤规则时已经确保平台匹配
    const platformRules = rules.filter(rule => rule.platforms.includes(currentPlatform));

    for (const rule of platformRules) {
        try {
            const originalPattern = rule.pathPattern;
            // 确保 basePathPattern 不是 undefined
            const basePathPattern = originalPattern.split('*')[0] ?? ''; // 如果是 '*' 开头则为空字符串

            // 如果路径模式不包含分隔符（可能是环境变量或根目录），直接解析整个模式
            const firstSeparatorIndex = basePathPattern.includes(path.sep) ? basePathPattern.indexOf(path.sep) : -1;
            const potentiallyResolvableBase = firstSeparatorIndex !== -1 ? basePathPattern.substring(0, firstSeparatorIndex) : basePathPattern;

            // 尝试解析基础路径
            let resolvedBasePath: string | null = null;
            if (potentiallyResolvableBase) {
                resolvedBasePath = await resolvePath(potentiallyResolvableBase);
            }

            if (!resolvedBasePath) {
                 logger.debug(`[scanByCategory] Base path cannot be resolved (skipping rule): ${potentiallyResolvableBase} from ${originalPattern}`);
                 continue;
            }

            try {
                 await fs.access(resolvedBasePath);
            } catch (accessError) {
                 logger.debug(`[scanByCategory] Base path not accessible (skipping rule): ${resolvedBasePath}`, accessError);
                 continue;
            }

            const globPattern = await resolvePath(originalPattern); // 解析完整的 glob 模式
            if (!globPattern) {
                 logger.warn(`[scanByCategory] Could not resolve full glob pattern: ${originalPattern}`);
                 continue;
            }

            logger.debug(`[scanByCategory] Scanning with glob pattern: ${globPattern} (Depth: ${rule.maxDepth ?? 1})`);

            const entries = await glob(globPattern, {
                onlyFiles: false,
                deep: rule.maxDepth ?? 1,
                absolute: true,
                stats: true,
                ignore: ['**/node_modules/**', '**/.git/**', '**/vendor/**'],
                dot: true,
                suppressErrors: true,
                followSymbolicLinks: false
            });

            logger.debug(`[scanByCategory] Found ${entries.length} entries for pattern: ${globPattern}`);

            for (const entry of entries) {
                 const ruleMinAge = rule.minAgeDays ?? options.olderThan;
                 if (ruleMinAge !== undefined && entry.stats?.mtimeMs) {
                     const fileAgeDays = (Date.now() - entry.stats.mtimeMs) / (1000 * 60 * 60 * 24);
                     if (fileAgeDays < ruleMinAge) {
                         continue;
                     }
                 }

                if (entry.stats?.isFile()) {
                    foundFiles.push(entry.path);
                    totalSize += entry.stats.size;
                } else if (entry.stats?.isDirectory()) {
                    foundFiles.push(entry.path + path.sep); // 使用平台特定的分隔符
                }
            }
        } catch (error: any) {
            logger.warn(`[scanByCategory] Error scanning rule "${rule.pathPattern}": ${error.message}`, error);
        }
    }

    return { category, files: foundFiles, totalSize };
}

// --- 4. 定义新工具 ---
// 使用 ToolExecutionContext<InputType, OutputType> (如果存在)
// 否则，明确指定 params 类型
export function registerScanJunkFilesTool(server: McpServer) {
    registerTool(
        server,
        "Scan_ScanJunkFiles",
        "扫描常见类型的垃圾文件 (缓存, 临时文件, 日志等)。依赖于 junk_rules.json 配置文件。",
        // 输入 Schema 使用 ZodRawShape 定义
        {
            categories: z.array(z.string()).optional().describe("要扫描的垃圾文件类别 (可选, 默认扫描所有已知类别)。有效类别可在 junk_rules.json 中查看。 例如: [\"caches\", \"logs\"]"),
            olderThan: z.number().int().min(0).optional().describe("全局选项：仅扫描比指定天数更旧的文件 (可选, 会被规则中的 minAgeDays 覆盖)")
        },
        // 执行函数
        async (args: { categories?: string[]; olderThan?: number }) => {
            const platform = os.platform();
            const ruleIssues: string[] = [];

            if (platform !== 'darwin' && platform !== 'win32' && platform !== 'linux') {
                logger.warn(`[scanJunkFiles] Unsupported platform: ${platform}. Skipping scan.`);
                ruleIssues.push(`Unsupported platform: ${platform}`);
                return {
                    content: [{ type: "text", text: formatScanResults({}, 0, 0, ruleIssues) }]
                };
            }
            const currentPlatform = platform as SupportedPlatform;

            const allRules = await loadJunkRules();
            if (Object.keys(allRules).length === 0) {
                logger.error("[scanJunkFiles] No rules loaded. Aborting scan.");
                ruleIssues.push("Failed to load any junk rules.");
                return {
                     content: [{ type: "text", text: formatScanResults({}, 0, 0, ruleIssues) }]
                 };
            }

            const categoriesToScan = args.categories && args.categories.length > 0
                ? args.categories
                : Object.keys(allRules);

            const results: { [category: string]: { count: number; totalSize: number; files: string[] } } = {};
            let totalFoundCount = 0;
            let totalFoundSize = 0;
            const MAX_FILES_TO_LIST = 50;

            logger.info(`[scanJunkFiles] Starting scan on ${currentPlatform} for categories: ${categoriesToScan.join(', ')}`);

            const validCategories = categoriesToScan.filter((cat: string) => {
                if (!allRules[cat]) {
                    logger.warn(`[scanJunkFiles] Requested category "${cat}" not defined in rules. Skipping.`);
                    ruleIssues.push(`Category not found in rules: ${cat}`);
                    return false;
                }
                return true;
            });

            if (validCategories.length === 0 && categoriesToScan.length > 0) {
                logger.warn("[scanJunkFiles] No valid categories requested for scan.");
                 return {
                     content: [{ type: "text", text: formatScanResults({}, 0, 0, ruleIssues) }]
                 };
            }

            const categoriesToProcess = validCategories.length > 0 ? validCategories : Object.keys(allRules);

            for (const category of categoriesToProcess) {
                if (allRules[category]) {
                    const scanResult = await scanByCategory(category, allRules[category], currentPlatform, { olderThan: args.olderThan });
                    results[category] = {
                        count: scanResult.files.length,
                        totalSize: scanResult.totalSize,
                        files: scanResult.files
                    };
                    totalFoundCount += scanResult.files.length;
                    totalFoundSize += scanResult.totalSize;
                    if (scanResult.files.length > 0) {
                        logger.info(`[scanJunkFiles] Category "${category}": Found ${scanResult.files.length} items, total file size ${scanResult.totalSize} bytes.`);
                    } else {
                        logger.info(`[scanJunkFiles] Category "${category}": No items found.`);
                    }
                }
            }

            logger.info(`[scanJunkFiles] Scan finished. Found ${totalFoundCount} total items, total file size ${totalFoundSize} bytes.`);
            const outputText = formatScanResults(results, totalFoundCount, totalFoundSize, ruleIssues);

            return {
                content: [{ type: "text", text: outputText }]
            };
        }
    );
}

function formatScanResults(results: { [category: string]: { count: number; totalSize: number; files: string[] } }, totalFoundCount: number, totalFoundSize: number, ruleIssues: string[]): string {
    let output = `扫描完成. 总共找到 ${totalFoundCount} 个条目, 文件总大小 ${(totalFoundSize / (1024 * 1024)).toFixed(2)} MB.\n\n`;
    for (const [category, result] of Object.entries(results)) {
        if (result) {
            if (result.count > 0) {
                output += `类别 [${category}]: ${result.count} 个条目, 文件大小 ${(result.totalSize / (1024 * 1024)).toFixed(2)} MB\n`;
            } else {
                 output += `类别 [${category}]: 未找到匹配条目\n`;
            }
        } else {
             logger.warn(`[formatScanResults] Unexpected undefined result for category: ${category}`);
             output += `类别 [${category}]: 无法处理结果\n`;
        }
    }
     if (ruleIssues.length > 0) {
        output += `\n扫描问题:\n${ruleIssues.map(issue => ` - ${issue}`).join('\n')}`;
    }
    return output;
} 