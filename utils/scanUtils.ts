import fs from "fs/promises";
import path from "path";
import os from "os";
import { expandHomeDir } from "./pathUtil";
import { analyzeDirectoryContents } from "./fileUtils";
import type { DirectoryAnalysisResult } from "./fileUtils";

/**
 * 获取系统驱动器/磁盘列表（主要适用于Windows）
 * 在Linux/macOS中返回根目录
 */
export async function getSystemDrives(): Promise<string[]> {
  if (process.platform === "win32") {
    // Windows系统，获取所有可用驱动器
    try {
      // 使用命令行工具获取驱动器列表
      const { stdout } = await import('child_process').then(cp => 
        new Promise<{stdout: string, stderr: string}>((resolve, reject) => {
          cp.exec('wmic logicaldisk get caption', (error, stdout, stderr) => {
            if (error) reject(error);
            else resolve({stdout, stderr});
          });
        })
      );
      
      // 解析驱动器列表
      return stdout
        .split('\n')
        .slice(1) // 跳过标题行
        .map(line => line.trim())
        .filter(drive => drive.length > 0)
        .map(drive => `${drive}\\`);
    } catch (error) {
      // 如果上述方法失败，使用备用方法
      const drives: string[] = [];
      for (const letter of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") {
        try {
          const drivePath = `${letter}:\\`;
          await fs.access(drivePath);
          drives.push(drivePath);
        } catch {
          // 如果无法访问，则跳过该驱动器
        }
      }
      return drives;
    }
  } else {
    // macOS/Linux系统，返回根目录
    return ["/"];
  }
}

/**
 * 全盘扫描结果
 */
export interface SystemScanResult {
  timestamp: Date;
  totalSize: number;
  totalFiles: number;
  drives: {
    path: string;
    size: number;
    files: number;
  }[];
  byExtension: Record<string, { count: number; size: number }>;
  largestFiles: Array<{ path: string; size: number }>;
}

/**
 * 执行全盘扫描
 * @param excludePaths 要排除的路径数组
 * @param maxDepth 最大扫描深度，默认为10
 * @param progressCallback 进度回调函数
 * @returns 扫描结果
 */
export async function scanFullSystem(
  excludePaths: string[] = [],
  maxDepth: number = 10,
  progressCallback?: (progress: number, currentPath: string) => void
): Promise<SystemScanResult> {
  const drives = await getSystemDrives();
  const expandedExcludePaths = excludePaths.map(p => expandHomeDir(p));
  
  const result: SystemScanResult = {
    timestamp: new Date(),
    totalSize: 0,
    totalFiles: 0,
    drives: [],
    byExtension: {},
    largestFiles: []
  };
  
  let scannedDrives = 0;
  
  for (const drive of drives) {
    try {
      if (progressCallback) {
        progressCallback(scannedDrives / drives.length, drive);
      }
      
      // 分析驱动器
      const driveAnalysis = await scanDirectory(
        drive, 
        expandedExcludePaths, 
        maxDepth,
        (subPath) => {
          if (progressCallback) {
            progressCallback(
              (scannedDrives + 0.5) / drives.length,
              subPath
            );
          }
        }
      );
      
      // 更新总计数据
      result.totalSize += driveAnalysis.totalSize;
      result.totalFiles += driveAnalysis.totalFiles;
      
      // 添加驱动器信息
      result.drives.push({
        path: drive,
        size: driveAnalysis.totalSize,
        files: driveAnalysis.totalFiles
      });
      
      // 合并文件类型统计
      for (const [ext, data] of Object.entries(driveAnalysis.byExtension)) {
        if (!result.byExtension[ext]) {
          result.byExtension[ext] = { count: 0, size: 0 };
        }
        result.byExtension[ext].count += data.count;
        result.byExtension[ext].size += data.size;
      }
      
      // 更新最大文件列表
      result.largestFiles.push(...driveAnalysis.largestFiles);
      result.largestFiles.sort((a, b) => b.size - a.size);
      if (result.largestFiles.length > 20) {
        result.largestFiles = result.largestFiles.slice(0, 20);
      }
      
      scannedDrives++;
    } catch (error) {
      // 跳过无法访问的驱动器
      scannedDrives++;
    }
  }
  
  if (progressCallback) {
    progressCallback(1, "扫描完成");
  }
  
  return result;
}

/**
 * 格式化全盘扫描结果
 * @param result 扫描结果
 * @returns 格式化后的文本
 */
export function formatSystemScanResult(result: SystemScanResult): string {
  let output = "系统扫描结果:\n\n";
  
  output += `扫描时间: ${result.timestamp.toLocaleString()}\n`;
  output += `总文件数: ${result.totalFiles.toLocaleString()}\n`;
  output += `总大小: ${formatSize(result.totalSize)}\n\n`;
  
  output += "驱动器/分区:\n";
  for (const drive of result.drives) {
    output += `${drive.path}: ${drive.files.toLocaleString()} 个文件, ${formatSize(drive.size)}\n`;
  }
  
  output += "\n文件类型分布:\n";
  const sortedExts = Object.entries(result.byExtension)
    .sort((a, b) => b[1].size - a[1].size)
    .slice(0, 15); // 只显示前15种最大的文件类型
  
  for (const [ext, data] of sortedExts) {
    output += `${ext}: ${data.count.toLocaleString()} 个文件, ${formatSize(data.size)}\n`;
  }
  
  output += "\n最大的文件:\n";
  result.largestFiles.slice(0, 10).forEach((file, index) => {
    output += `${index + 1}. ${file.path} (${formatSize(file.size)})\n`;
  });
  
  return output;
}

/**
 * 扫描特定目录
 * @param dirPath 目录路径
 * @param excludePaths 排除路径数组
 * @param maxDepth 最大深度
 * @param progressCallback 进度回调
 * @returns 目录分析结果
 */
export async function scanDirectory(
  dirPath: string,
  excludePaths: string[] = [],
  maxDepth: number = 10,
  progressCallback?: (currentPath: string) => void
): Promise<DirectoryAnalysisResult> {
  const expandedPath = expandHomeDir(dirPath);
  const stats: DirectoryAnalysisResult = {
    totalFiles: 0,
    totalSize: 0,
    byExtension: {},
    largestFiles: []
  };
  
  async function analyzeDir(currentPath: string, depth: number): Promise<void> {
    if (depth > maxDepth) return;
    
    // 检查是否应该排除此路径
    if (excludePaths.some(exclude => currentPath.startsWith(exclude))) {
      return;
    }
    
    try {
      if (progressCallback) {
        progressCallback(currentPath);
      }
      
      const entries = await fs.readdir(currentPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(currentPath, entry.name);
        
        // 再次检查排除路径
        if (excludePaths.some(exclude => fullPath.startsWith(exclude))) {
          continue;
        }
        
        if (entry.isFile()) {
          try {
            const fileStats = await fs.stat(fullPath);
            stats.totalFiles++;
            stats.totalSize += fileStats.size;
            
            // 按扩展名统计
            const ext = path.extname(entry.name).toLowerCase() || '(无扩展名)';
            if (!stats.byExtension[ext]) {
              stats.byExtension[ext] = { count: 0, size: 0 };
            }
            stats.byExtension[ext].count++;
            stats.byExtension[ext].size += fileStats.size;
            
            // 记录大文件
            stats.largestFiles.push({ path: fullPath, size: fileStats.size });
            stats.largestFiles.sort((a, b) => b.size - a.size);
            if (stats.largestFiles.length > 10) {
              stats.largestFiles.pop();
            }
          } catch (e) {
            // 忽略无权限文件
          }
        } else if (entry.isDirectory()) {
          // 跳过特定系统目录
          const lowerName = entry.name.toLowerCase();
          if (
            lowerName === "system volume information" ||
            lowerName === "$recycle.bin" ||
            lowerName === "windows" || // 避免扫描整个windows目录
            lowerName === "node_modules" || // 避免扫描node_modules
            lowerName.startsWith(".")  // 跳过隐藏目录
          ) {
            continue;
          }
          
          await analyzeDir(fullPath, depth + 1);
        }
      }
    } catch (error) {
      // 忽略无权限目录
    }
  }
  
  await analyzeDir(expandedPath, 0);
  return stats;
}

/**
 * 格式化文件大小
 * @param bytes 字节数
 * @returns 格式化后的大小字符串
 */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

/**
 * 获取常见系统临时目录
 * @returns 临时目录路径数组
 */
export function getCommonTempDirectories(): string[] {
  const tempDirs = [os.tmpdir()];
  
  if (process.platform === "win32") {
    tempDirs.push(
      path.join(os.homedir(), "AppData", "Local", "Temp"),
      "C:\\Windows\\Temp"
    );
  } else if (process.platform === "darwin") {
    tempDirs.push(
      path.join(os.homedir(), "Library", "Caches"),
      "/Library/Caches",
      "/var/tmp",
      "/tmp"
    );
  } else {
    // Linux和其他系统
    tempDirs.push(
      "/var/tmp",
      "/tmp",
      path.join(os.homedir(), ".cache")
    );
  }
  
  return tempDirs;
} 