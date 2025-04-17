import path from 'path';
import fs from 'fs/promises';
import type { CleaningOptions, CleaningResult } from './cleanerPaths';
import { APP_PATHS, CACHE_PATHS, SYSTEM_LAUNCH_PATHS, SPECIAL_PATHS, DEFAULT_CLEANING_OPTIONS } from './cleanerPaths';
import { cleanDirectory, formatCleaningResult, getPathSize, formatSize } from './cleanerUtils';

/**
 * 清理应用程序缓存
 * @param options 清理选项
 * @returns 清理结果
 */
export async function cleanAppCaches(options: CleaningOptions = DEFAULT_CLEANING_OPTIONS): Promise<CleaningResult> {
  const combinedResult: CleaningResult = {
    cleanedPaths: [],
    failedPaths: [],
    errors: [],
    totalSize: 0
  };
  
  // 用户缓存目录
  const userCacheResult = await cleanDirectory(CACHE_PATHS.USER_CACHE, options);
  
  // 合并结果
  combinedResult.cleanedPaths.push(...userCacheResult.cleanedPaths);
  combinedResult.failedPaths.push(...userCacheResult.failedPaths);
  combinedResult.errors.push(...userCacheResult.errors);
  combinedResult.totalSize += userCacheResult.totalSize;
  
  // 系统缓存目录（需要更高权限）
  if (options.dryRun) {
    try {
      const systemCacheSize = await getPathSize(CACHE_PATHS.SYSTEM_CACHE);
      combinedResult.errors.push(`系统缓存目录(${CACHE_PATHS.SYSTEM_CACHE})需要管理员权限才能清理，预计可释放: ${formatSize(systemCacheSize)}`);
    } catch (error) {
      combinedResult.errors.push(`无法访问系统缓存目录: ${CACHE_PATHS.SYSTEM_CACHE}`);
    }
  }
  
  // 应用保存状态
  const savedStateResult = await cleanDirectory(CACHE_PATHS.SAVED_STATE, options);
  combinedResult.cleanedPaths.push(...savedStateResult.cleanedPaths);
  combinedResult.failedPaths.push(...savedStateResult.failedPaths);
  combinedResult.errors.push(...savedStateResult.errors);
  combinedResult.totalSize += savedStateResult.totalSize;
  
  return combinedResult;
}

/**
 * 清理系统临时文件
 * @param options 清理选项
 * @returns 清理结果
 */
export async function cleanTempFiles(options: CleaningOptions = DEFAULT_CLEANING_OPTIONS): Promise<CleaningResult> {
  // 系统临时目录
  return await cleanDirectory(CACHE_PATHS.TEMP_DIR, {
    ...options,
    // 对临时文件，我们可以设置更短的留存时间
    olderThan: options.olderThan || 7
  });
}

/**
 * 扫描并清理应用卸载残留
 * @param appName 可选的应用名称（部分匹配）
 * @param options 清理选项
 * @returns 清理结果
 */
export async function cleanAppRemnants(
  appName?: string, 
  options: CleaningOptions = DEFAULT_CLEANING_OPTIONS
): Promise<CleaningResult> {
  const combinedResult: CleaningResult = {
    cleanedPaths: [],
    failedPaths: [],
    errors: [],
    totalSize: 0
  };
  
  // 要搜索残留的目录列表
  const dirsToSearch = [
    CACHE_PATHS.USER_PREFS,
    CACHE_PATHS.USER_CACHE,
    SYSTEM_LAUNCH_PATHS.USER_LAUNCH_AGENTS,
    SYSTEM_LAUNCH_PATHS.USER_LAUNCH_DAEMONS
  ];
  
  for (const dir of dirsToSearch) {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        // 如果指定了应用名，则只清理匹配的文件/目录
        if (appName && !entry.name.toLowerCase().includes(appName.toLowerCase())) {
          continue;
        }
        
        const entryPath = path.join(dir, entry.name);
        
        // 只处理有应用名但在系统中找不到的应用相关文件
        if (!appName) {
          // 复杂的逻辑：检测是否为残留文件
          // 实际项目中可能需要更复杂的检测逻辑
          const isRemnant = false; // 此处简化，实际应用中需要判断
          if (!isRemnant) continue;
        }
        
        // 清理找到的残留
        const result = await cleanDirectory(entryPath, options);
        combinedResult.cleanedPaths.push(...result.cleanedPaths);
        combinedResult.failedPaths.push(...result.failedPaths);
        combinedResult.errors.push(...result.errors);
        combinedResult.totalSize += result.totalSize;
      }
    } catch (error: any) {
      combinedResult.errors.push(`访问目录失败 ${dir}: ${error.message}`);
    }
  }
  
  return combinedResult;
}

/**
 * 执行系统智能垃圾扫描
 * @param cleanLevel 清理级别：'safe'(安全)，'normal'(标准)，'deep'(深度)
 * @param options 清理选项
 * @returns 清理结果
 */
export async function smartSystemClean(
  cleanLevel: 'safe' | 'normal' | 'deep' = 'safe',
  options: CleaningOptions = DEFAULT_CLEANING_OPTIONS
): Promise<CleaningResult> {
  const combinedResult: CleaningResult = {
    cleanedPaths: [],
    failedPaths: [],
    errors: [],
    totalSize: 0
  };
  
  // 根据清理级别设置不同的选项
  const levelOptions: CleaningOptions = { ...options };
  
  switch (cleanLevel) {
    case 'safe':
      // 安全模式：只清理明确的缓存和临时文件，文件需要至少30天未使用
      levelOptions.olderThan = options.olderThan || 30;
      levelOptions.maxDepth = 2;
      break;
      
    case 'normal':
      // 标准模式：清理更多类型的缓存和临时文件，7天未使用
      levelOptions.olderThan = options.olderThan || 7;
      levelOptions.maxDepth = 3;
      break;
      
    case 'deep':
      // 深度模式：清理所有支持的垃圾文件类型，包括应用状态，3天未使用
      levelOptions.olderThan = options.olderThan || 3;
      levelOptions.maxDepth = 5;
      levelOptions.includeHidden = true;
      break;
  }
  
  // 1. 清理应用缓存
  const cacheResult = await cleanAppCaches(levelOptions);
  combinedResult.cleanedPaths.push(...cacheResult.cleanedPaths);
  combinedResult.failedPaths.push(...cacheResult.failedPaths);
  combinedResult.errors.push(...cacheResult.errors);
  combinedResult.totalSize += cacheResult.totalSize;
  
  // 2. 清理临时文件
  const tempResult = await cleanTempFiles(levelOptions);
  combinedResult.cleanedPaths.push(...tempResult.cleanedPaths);
  combinedResult.failedPaths.push(...tempResult.failedPaths);
  combinedResult.errors.push(...tempResult.errors);
  combinedResult.totalSize += tempResult.totalSize;
  
  // 3. 对于 normal 和 deep 级别，清理更多系统文件
  if (cleanLevel === 'normal' || cleanLevel === 'deep') {
    // 清理下载中的临时文件和部分缓存
    const downloadsResult = await cleanDirectory(
      APP_PATHS.DOWNLOADS, 
      { 
        ...levelOptions,
        // 只清理明确的临时文件和缓存文件
        excludePatterns: [
          '.*(?<!\.tmp|\.temp|\.cache|\.log|\.dmg|\.part)$'
        ]
      }
    );
    
    combinedResult.cleanedPaths.push(...downloadsResult.cleanedPaths);
    combinedResult.failedPaths.push(...downloadsResult.failedPaths);
    combinedResult.errors.push(...downloadsResult.errors);
    combinedResult.totalSize += downloadsResult.totalSize;
  }
  
  // 4. 对于 deep 级别，执行更彻底的清理
  if (cleanLevel === 'deep') {
    // 清理特定软件缓存
    try {
      // Chrome 更新缓存
      if (await pathExists(SPECIAL_PATHS.CHROME_UPDATES)) {
        const chromeResult = await cleanDirectory(SPECIAL_PATHS.CHROME_UPDATES, levelOptions);
        combinedResult.cleanedPaths.push(...chromeResult.cleanedPaths);
        combinedResult.failedPaths.push(...chromeResult.failedPaths);
        combinedResult.errors.push(...chromeResult.errors);
        combinedResult.totalSize += chromeResult.totalSize;
      }
      
      // 更多特定软件缓存...
    } catch (error: any) {
      combinedResult.errors.push(`处理特定软件缓存时出错: ${error.message}`);
    }
  }
  
  return combinedResult;
}

/**
 * 检查路径是否存在
 */
async function pathExists(checkPath: string): Promise<boolean> {
  try {
    await fs.access(checkPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * 查找大文件
 * @param startPath 起始路径
 * @param minSize 最小文件大小（字节）
 * @param options 清理选项
 * @returns 找到的大文件列表
 */
export async function findLargeFiles(
  startPath: string,
  minSize: number = 100 * 1024 * 1024, // 默认100MB
  options: CleaningOptions = DEFAULT_CLEANING_OPTIONS
): Promise<{ path: string; size: number }[]> {
  const largeFiles: { path: string; size: number }[] = [];
  
  async function scanDirectory(dirPath: string, depth: number = 0): Promise<void> {
    if (options.maxDepth !== undefined && depth > options.maxDepth) {
      return;
    }
    
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const entryPath = path.join(dirPath, entry.name);
        
        // 跳过隐藏文件（如果设置了不包含隐藏文件）
        if (!options.includeHidden && entry.name.startsWith('.')) {
          continue;
        }
        
        try {
          if (entry.isDirectory()) {
            // 递归扫描子目录
            await scanDirectory(entryPath, depth + 1);
          } else if (entry.isFile()) {
            // 检查文件大小
            const stats = await fs.stat(entryPath);
            if (stats.size >= minSize) {
              largeFiles.push({
                path: entryPath,
                size: stats.size
              });
            }
          }
        } catch (error) {
          // 忽略单个文件的错误，继续扫描
        }
      }
    } catch (error) {
      // 忽略访问错误，继续扫描其他目录
    }
  }
  
  await scanDirectory(startPath);
  
  // 按大小降序排序
  return largeFiles.sort((a, b) => b.size - a.size);
}

/**
 * 格式化大文件列表为可读文本
 */
export function formatLargeFilesResult(files: { path: string; size: number }[]): string {
  if (files.length === 0) {
    return "未找到大文件";
  }
  
  let output = `找到 ${files.length} 个大文件:\n\n`;
  
  files.forEach((file, index) => {
    output += `${index + 1}. ${file.path}\n   大小: ${formatSize(file.size)}\n\n`;
  });
  
  return output;
} 