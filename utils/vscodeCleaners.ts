import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import type { CleaningOptions, CleaningResult } from './cleanerPaths';
import { DEFAULT_CLEANING_OPTIONS } from './cleanerPaths';
import { formatSize } from './cleanerUtils';
import { logger } from './logger';
// 扩展版本信息接口
interface ExtensionVersion {
  name: string;
  version: string;
  fullPath: string;
  pureVersion: string;
  size: number;
}

// VSCode 相关编辑器路径
const VSCODE_EDITORS = [
  '~/.vscode/extensions',          // VSCode
  '~/.vscode-insiders/extensions', // VSCode Insiders
  '~/.windsurf/extensions',        // Windsurf
  '~/.cursor/extensions',          // Cursor
  '~/.trae/extensions',            // Trae
  '~/.trae-cn/extensions'          // Trae 中文版
];

/**
 * 展开路径中的用户主目录符号 (~)
 * @param inputPath 输入路径
 * @returns 展开后的绝对路径
 */
function expandUserPath(inputPath: string): string {
  if (inputPath.startsWith('~/') || inputPath === '~') {
    return path.join(os.homedir(), inputPath.slice(1));
  }
  return inputPath;
}

/**
 * 获取目录大小
 * @param dirPath 目录路径
 * @returns 目录大小（字节）
 */
async function getDirSize(dirPath: string): Promise<number> {
  let totalSize = 0;
  
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      
      if (entry.isFile()) {
        const stats = await fs.stat(fullPath);
        totalSize += stats.size;
      } else if (entry.isDirectory()) {
        totalSize += await getDirSize(fullPath);
      }
    }
  } catch (error) {
    console.error(`获取目录大小出错: ${dirPath}`, error);
  }
  
  return totalSize;
}

/**
 * 从扩展名中提取纯版本号
 * @param versionStr 版本字符串
 * @returns 提取的纯版本号
 */
function extractPureVersion(versionStr: string): string {
  const match = /(\d+\.\d+(\.\d+)?)/.exec(versionStr);
  return match?.[1] || versionStr;
}

/**
 * 比较版本号
 * @param v1 版本号1
 * @param v2 版本号2
 * @returns 比较结果：1(v1>v2), -1(v1<v2), 0(v1=v2)
 */
function compareVersions(v1: string, v2: string): number {
  // 确保解析结果为数字，避免 undefined
  const parts1 = v1.split('.').map(n => parseInt(n) || 0);
  const parts2 = v2.split('.').map(n => parseInt(n) || 0);
  
  const maxLength = Math.max(parts1.length, parts2.length);
  
  for (let i = 0; i < maxLength; i++) {
    // 明确指定默认值为0，解决可能 undefined 的问题
    const part1 = i < parts1.length ? (parts1[i] || 0) : 0;
    const part2 = i < parts2.length ? (parts2[i] || 0) : 0;
    
    if (part1 > part2) return 1;
    if (part1 < part2) return -1;
  }
  
  return 0;
}

/**
 * 扫描 VSCode 扩展目录，查找可清理的低版本扩展
 * @param extensionsDir 扩展目录路径
 * @param options 清理选项
 * @returns 清理结果
 */
export async function scanVSCodeExtensions(
  extensionsDir: string,
  options: CleaningOptions = DEFAULT_CLEANING_OPTIONS
): Promise<{lowVersionExtensions: Record<string, ExtensionVersion[]>, totalSize: number}> {
  const expandedPath = expandUserPath(extensionsDir);
  const extensionsMap: Record<string, ExtensionVersion[]> = {};
  let totalSize = 0;
  
  try {
    // 检查目录是否存在
    try {
      await fs.access(expandedPath);
    } catch (error) {
      return { lowVersionExtensions: {}, totalSize: 0 };
    }
    
    // 获取所有扩展目录
    const entries = await fs.readdir(expandedPath, { withFileTypes: true });
    
    // 收集扩展信息
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      
      const fullPath = path.join(expandedPath, entry.name);
      const nameMatch = /(.+?)\-(\d.+)/.exec(entry.name);
      
      if (!nameMatch || nameMatch.length < 3) continue;
      
      // 使用类型断言确保 nameMatch[1] 和 nameMatch[2] 不为 undefined
      const extName = nameMatch[1] as string;
      const extVersion = nameMatch[2] as string;
      const pureVersion = extractPureVersion(extVersion);
      
      // 获取目录大小
      const size = await getDirSize(fullPath);
      
      if (!extensionsMap[extName]) {
        extensionsMap[extName] = [];
      }
      
      extensionsMap[extName].push({
        name: extName,
        version: extVersion,
        pureVersion,
        fullPath,
        size
      });
    }
    
    // 保留只有多个版本的扩展
    const lowVersionExtensions: Record<string, ExtensionVersion[]> = {};
    
    for (const [extName, versions] of Object.entries(extensionsMap)) {
      if (versions.length <= 1) continue;
      
      // 按版本排序
      versions.sort((a, b) => compareVersions(b.pureVersion, a.pureVersion));
      
      // 保留最新版本，标记其他版本为可删除
      const oldVersions = versions.slice(1);
      
      lowVersionExtensions[extName] = oldVersions;
      
      // 计算可释放空间
      for (const oldVersion of oldVersions) {
        totalSize += oldVersion.size;
      }
    }
    
    return { lowVersionExtensions, totalSize };
  } catch (error) {
    console.error(`扫描 VSCode 扩展出错: ${extensionsDir}`, error);
    return { lowVersionExtensions: {}, totalSize: 0 };
  }
}

/**
 * 清理 VSCode 低版本扩展
 * @param extensionsDir 扩展目录路径
 * @param options 清理选项
 * @returns 清理结果
 */
export async function cleanVSCodeExtensions(
  extensionsDir: string,
  options: CleaningOptions = DEFAULT_CLEANING_OPTIONS
): Promise<CleaningResult> {
  const result: CleaningResult = {
    cleanedPaths: [],
    failedPaths: [],
    errors: [],
    totalSize: 0
  };
  
  try {
    // 扫描低版本扩展
    const { lowVersionExtensions, totalSize } = await scanVSCodeExtensions(extensionsDir, options);
    
    // 如果没有低版本扩展，直接返回
    if (Object.keys(lowVersionExtensions).length === 0) {
      return result;
    }
    
    // 如果只是模拟运行，返回可清理的信息
    if (options.dryRun) {
      for (const versions of Object.values(lowVersionExtensions)) {
        for (const version of versions) {
          result.cleanedPaths.push(version.fullPath);
          result.totalSize += version.size;
        }
      }
      return result;
    }
    
    // 实际删除低版本扩展
    for (const [extName, versions] of Object.entries(lowVersionExtensions)) {
      for (const version of versions) {
        try {
          await fs.rm(version.fullPath, { recursive: true, force: true });
          logger.info(`成功删除扩展: ${version.fullPath}`, { size: version.size, extName });
          
          result.cleanedPaths.push(version.fullPath);
          result.totalSize += version.size;
        } catch (error: any) {
          // 尝试使用命令行强制删除
          try {
            execSync(`rm -rf "${version.fullPath}"`);
            result.cleanedPaths.push(version.fullPath);
            result.totalSize += version.size;
          } catch (cmdError: any) {
            result.failedPaths.push(version.fullPath);
            result.errors.push(`删除扩展失败: ${version.fullPath}, 错误: ${cmdError.message}`);
          }
        }
      }
    }
    
    return result;
  } catch (error: any) {
    result.errors.push(`清理 VSCode 扩展出错: ${error.message}`);
    return result;
  }
}

/**
 * 清理所有 VSCode 系列编辑器的低版本扩展
 * @param options 清理选项
 * @returns 清理结果
 */
export async function cleanAllVSCodeExtensions(
  options: CleaningOptions = DEFAULT_CLEANING_OPTIONS
): Promise<CleaningResult> {
  const result: CleaningResult = {
    cleanedPaths: [],
    failedPaths: [],
    errors: [],
    totalSize: 0
  };
  
  for (const editorPath of VSCODE_EDITORS) {
    try {
      const editorResult = await cleanVSCodeExtensions(editorPath, options);
      
      result.cleanedPaths.push(...editorResult.cleanedPaths);
      result.failedPaths.push(...editorResult.failedPaths);
      result.errors.push(...editorResult.errors);
      result.totalSize += editorResult.totalSize;
    } catch (error: any) {
      result.errors.push(`处理编辑器 ${editorPath} 时出错: ${error.message}`);
    }
  }
  
  return result;
}

/**
 * 生成 VSCode 扩展清理报告
 * @param extensionsDir 扩展目录路径
 * @returns 清理报告文本
 */
export async function generateVSCodeExtensionReport(extensionsDir: string): Promise<string> {
  try {
    const { lowVersionExtensions, totalSize } = await scanVSCodeExtensions(extensionsDir);
    
    if (Object.keys(lowVersionExtensions).length === 0) {
      return `目录 ${extensionsDir} 中没有发现可清理的低版本扩展。`;
    }
    
    let report = `在 ${extensionsDir} 中发现 ${Object.keys(lowVersionExtensions).length} 个具有低版本的扩展:\n\n`;
    
    for (const [extName, versions] of Object.entries(lowVersionExtensions)) {
      report += `- ${extName}:\n`;
      
      for (const version of versions) {
        report += `  * ${version.version} (${formatSize(version.size)})\n`;
      }
      
      report += '\n';
    }
    
    report += `清理所有低版本扩展可释放 ${formatSize(totalSize)} 的磁盘空间。`;
    
    return report;
  } catch (error: any) {
    return `生成报告时出错: ${error.message}`;
  }
}

/**
 * 生成所有 VSCode 系列编辑器的扩展清理报告
 * @returns 清理报告文本
 */
export async function generateAllVSCodeExtensionReports(): Promise<string> {
  let combinedReport = '# VSCode 系列编辑器扩展清理报告\n\n';
  let totalFoundSize = 0;
  let foundEditors = 0;
  
  for (const editorPath of VSCODE_EDITORS) {
    try {
      const expandedPath = expandUserPath(editorPath);
      
      // 检查目录是否存在
      try {
        await fs.access(expandedPath);
      } catch (error) {
        continue;
      }
      
      const { lowVersionExtensions, totalSize } = await scanVSCodeExtensions(editorPath);
      
      if (Object.keys(lowVersionExtensions).length === 0) {
        continue;
      }
      
      foundEditors++;
      totalFoundSize += totalSize;
      
      combinedReport += `## ${editorPath}\n\n`;
      
      for (const [extName, versions] of Object.entries(lowVersionExtensions)) {
        combinedReport += `- ${extName}:\n`;
        
        for (const version of versions) {
          combinedReport += `  * ${version.version} (${formatSize(version.size)})\n`;
        }
        
        combinedReport += '\n';
      }
      
      combinedReport += `此编辑器清理低版本扩展可释放 ${formatSize(totalSize)}\n\n`;
    } catch (error) {
      // 忽略错误，继续处理下一个编辑器
    }
  }
  
  if (foundEditors === 0) {
    return '未发现任何 VSCode 系列编辑器中有可清理的低版本扩展。';
  }
  
  combinedReport += `\n总结: 清理 ${foundEditors} 个编辑器中的低版本扩展，共可释放 ${formatSize(totalFoundSize)}。`;
  
  return combinedReport;
} 