import fs from 'fs/promises';
import path from 'path';
import { execSync } from 'child_process';
import type { CleaningOptions, CleaningResult } from './cleanerPaths';
import { DEFAULT_CLEANING_OPTIONS } from './cleanerPaths';

/**
 * 计算文件或目录的大小
 * @param filePath 文件或目录路径
 * @returns 大小（字节）
 */
export async function getPathSize(filePath: string): Promise<number> {
  try {
    const stats = await fs.stat(filePath);
    
    if (stats.isFile()) {
      return stats.size;
    } else if (stats.isDirectory()) {
      const files = await fs.readdir(filePath);
      const sizes = await Promise.all(
        files.map(file => getPathSize(path.join(filePath, file)))
      );
      return sizes.reduce((acc, size) => acc + size, 0);
    }
    
    return 0;
  } catch (error) {
    console.error(`获取路径大小失败: ${filePath}`, error);
    return 0;
  }
}

/**
 * 判断文件是否早于指定天数
 * @param filePath 文件路径
 * @param days 天数
 * @returns 是否早于指定天数
 */
export async function isFileOlderThan(filePath: string, days: number): Promise<boolean> {
  try {
    const stats = await fs.stat(filePath);
    const fileDate = new Date(stats.mtime).getTime();
    const cutoffDate = new Date().getTime() - (days * 24 * 60 * 60 * 1000);
    return fileDate < cutoffDate;
  } catch (error) {
    return false;
  }
}

/**
 * 安全删除路径（文件或目录）
 * @param targetPath 目标路径
 * @param options 清理选项
 * @returns 删除结果
 */
export async function safeDeletePath(
  targetPath: string, 
  options: CleaningOptions = DEFAULT_CLEANING_OPTIONS
): Promise<{ success: boolean; size: number; error?: string }> {
  try {
    // 检查文件是否存在
    const stats = await fs.stat(targetPath);
    
    // 获取文件大小
    const size = await getPathSize(targetPath);
    
    // 如果是模拟运行模式，仅返回信息不实际删除
    if (options.dryRun) {
      return { success: true, size };
    }
    
    // 根据文件类型执行不同的删除操作
    if (stats.isDirectory()) {
      await fs.rm(targetPath, { recursive: true, force: true });
    } else {
      await fs.unlink(targetPath);
    }
    
    return { success: true, size };
  } catch (error: any) {
    // 尝试使用系统命令强制删除
    try {
      if (!options.dryRun) {
        execSync(`rm -rf "${targetPath}"`);
        const size = 0; // 无法得知已删除文件的大小
        return { success: true, size };
      }
      return { success: false, size: 0, error: error.message };
    } catch (forceError: any) {
      return { 
        success: false, 
        size: 0, 
        error: `删除失败: ${forceError.message || String(forceError)}` 
      };
    }
  }
}

/**
 * 清理指定目录中符合条件的文件
 * @param dirPath 目录路径
 * @param options 清理选项
 * @param currentDepth 当前递归深度
 * @returns 清理结果
 */
export async function cleanDirectory(
  dirPath: string,
  options: CleaningOptions = DEFAULT_CLEANING_OPTIONS,
  currentDepth: number = 0
): Promise<CleaningResult> {
  const result: CleaningResult = {
    cleanedPaths: [],
    failedPaths: [],
    errors: [],
    totalSize: 0
  };
  
  try {
    // 检查目录是否存在
    const dirStats = await fs.stat(dirPath);
    if (!dirStats.isDirectory()) {
      result.errors.push(`路径不是目录: ${dirPath}`);
      return result;
    }
    
    // 读取目录内容
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    
    // 处理每个条目
    for (const entry of entries) {
      const entryPath = path.join(dirPath, entry.name);
      
      // 跳过隐藏文件（如果设置了不包含隐藏文件）
      if (!options.includeHidden && entry.name.startsWith('.')) {
        continue;
      }
      
      // 检查是否匹配排除模式
      if (options.excludePatterns && options.excludePatterns.some(pattern => {
        const regex = new RegExp(pattern.replace(/\*/g, '.*'));
        return regex.test(entry.name);
      })) {
        continue;
      }
      
      try {
        if (entry.isDirectory()) {
          // 处理目录
          if (options.recursive && (options.maxDepth === undefined || currentDepth < options.maxDepth)) {
            // 递归清理子目录
            const subResult = await cleanDirectory(entryPath, options, currentDepth + 1);
            result.cleanedPaths.push(...subResult.cleanedPaths);
            result.failedPaths.push(...subResult.failedPaths);
            result.errors.push(...subResult.errors);
            result.totalSize += subResult.totalSize;
          } else {
            // 删除整个目录
            const deleteResult = await safeDeletePath(entryPath, options);
            if (deleteResult.success) {
              result.cleanedPaths.push(entryPath);
              result.totalSize += deleteResult.size;
            } else {
              result.failedPaths.push(entryPath);
              if (deleteResult.error) result.errors.push(deleteResult.error);
            }
          }
        } else if (entry.isFile()) {
          // 处理文件 - 检查是否早于指定天数
          const shouldClean = options.olderThan === undefined || 
                             await isFileOlderThan(entryPath, options.olderThan);
          
          if (shouldClean) {
            const deleteResult = await safeDeletePath(entryPath, options);
            if (deleteResult.success) {
              result.cleanedPaths.push(entryPath);
              result.totalSize += deleteResult.size;
            } else {
              result.failedPaths.push(entryPath);
              if (deleteResult.error) result.errors.push(deleteResult.error);
            }
          }
        }
      } catch (entryError: any) {
        result.failedPaths.push(entryPath);
        result.errors.push(`处理路径出错 ${entryPath}: ${entryError.message}`);
      }
    }
  } catch (dirError: any) {
    result.errors.push(`处理目录出错 ${dirPath}: ${dirError.message}`);
  }
  
  return result;
}

/**
 * 格式化字节大小为人类可读格式
 * @param bytes 字节数
 * @returns 格式化后的大小字符串
 */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

/**
 * 格式化清理结果为可读文本
 * @param result 清理结果
 * @returns 格式化后的结果文本
 */
export function formatCleaningResult(result: CleaningResult): string {
  let output = `清理完成:\n`;
  output += `- 已清理: ${result.cleanedPaths.length} 个项目\n`;
  output += `- 释放空间: ${formatSize(result.totalSize)}\n`;
  
  if (result.failedPaths.length > 0) {
    output += `- 失败: ${result.failedPaths.length} 个项目\n`;
  }
  
  if (result.errors.length > 0) {
    output += `- 错误信息: ${result.errors.length} 个\n`;
    // 最多显示5个错误
    const errorsToShow = result.errors.slice(0, 5);
    output += errorsToShow.map(err => `  - ${err}`).join('\n');
    
    if (result.errors.length > 5) {
      output += `\n  ... 等 ${result.errors.length - 5} 个错误未显示`;
    }
  }
  
  return output;
} 