import fs from "fs/promises";
import { createReadStream } from "fs";
import path from "path";
import { createHash } from "crypto";
import { expandHomeDir } from "./pathUtil";
import getFolderSize from "get-folder-size";
import { exec } from 'child_process';

/**
 * 获取文件夹大小
 * @param folderPath 文件夹路径
 * @returns 文件夹大小(字节)及格式化后的大小
 */
export async function getFolderSizeInfo(folderPath: string): Promise<{ size: number; formattedSize: string }> {
    const expandedPath = expandHomeDir(folderPath);
    const size = await getFolderSize.strict(expandedPath);
    const formattedSize = `${size} bytes (${(size / 1024 / 1024).toFixed(2)} MB)`;
    return { size, formattedSize };
}

/**
 * 列出目录内容
 * @param dirPath 目录路径
 * @param showHidden 是否显示隐藏文件
 * @returns 目录内容列表
 */
export async function listDirectoryContents(dirPath: string, showHidden: boolean = false): Promise<string> {
    const expandedPath = expandHomeDir(dirPath);
    const entries = await fs.readdir(expandedPath, { withFileTypes: true });
    
    // 过滤隐藏文件（如果 showHidden 为 false）
    const filteredEntries = showHidden 
        ? entries 
        : entries.filter(entry => !entry.name.startsWith('.'));
    
    // 格式化结果
    const results = await Promise.all(filteredEntries.map(async entry => {
        const fullPath = path.join(expandedPath, entry.name);
        let size = "";
        let type = "";
        
        if (entry.isDirectory()) {
            type = "Directory";
        } else if (entry.isFile()) {
            type = "File";
            const stats = await fs.stat(fullPath);
            size = `${(stats.size / 1024).toFixed(2)} KB`;
        } else if (entry.isSymbolicLink()) {
            type = "Symlink";
        } else {
            type = "Other";
        }
        
        return `${entry.name} (${type}${size ? ', ' + size : ''})`;
    }));
    
    return results.join('\n') || "目录为空";
}

/**
 * 根据模式在目录中查找文件
 * @param startPath 起始目录
 * @param pattern 文件名匹配模式（支持 * 和 ? 通配符）
 * @param maxDepth 最大搜索深度
 * @returns 匹配的文件路径列表
 */
export async function findFilesInDirectory(
    startPath: string, 
    pattern: string, 
    maxDepth: number = 5
): Promise<string[]> {
    const expandedPath = expandHomeDir(startPath);
    const regexPattern = pattern.replace(/\*/g, '.*').replace(/\?/g, '.');
    const regex = new RegExp(`^${regexPattern}$`, 'i');
    const results: string[] = [];
    
    async function searchDirectory(dirPath: string, depth: number): Promise<void> {
        if (depth > maxDepth) return;
        
        try {
            const entries = await fs.readdir(dirPath, { withFileTypes: true });
            
            for (const entry of entries) {
                const fullPath = path.join(dirPath, entry.name);
                
                if (entry.isFile() && regex.test(entry.name)) {
                    results.push(fullPath);
                } else if (entry.isDirectory()) {
                    await searchDirectory(fullPath, depth + 1);
                }
            }
        } catch (error) {
            // 忽略权限错误等，继续搜索其他目录
        }
    }
    
    await searchDirectory(expandedPath, 0);
    return results;
}

/**
 * 目录分析结果接口
 */
export interface DirectoryAnalysisResult {
    totalFiles: number;
    totalSize: number;
    byExtension: Record<string, { count: number; size: number }>;
    largestFiles: Array<{ path: string; size: number }>;
}

/**
 * 分析目录内容
 * @param dirPath 目录路径
 * @param includeSubdirs 是否包含子目录
 * @returns 分析结果对象
 */
export async function analyzeDirectoryContents(
    dirPath: string, 
    includeSubdirs: boolean = true
): Promise<DirectoryAnalysisResult> {
    const expandedPath = expandHomeDir(dirPath);
    const stats: DirectoryAnalysisResult = {
        totalFiles: 0,
        totalSize: 0,
        byExtension: {},
        largestFiles: []
    };
    
    async function analyzeDir(currentPath: string): Promise<void> {
        try {
            const entries = await fs.readdir(currentPath, { withFileTypes: true });
            
            for (const entry of entries) {
                const fullPath = path.join(currentPath, entry.name);
                
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
                } else if (entry.isDirectory() && includeSubdirs) {
                    await analyzeDir(fullPath);
                }
            }
        } catch (error) {
            // 忽略无权限目录
        }
    }
    
    await analyzeDir(expandedPath);
    return stats;
}

/**
 * 格式化目录分析结果
 * @param stats 分析结果对象
 * @param dirPath 原始目录路径
 * @returns 格式化后的文本
 */
export function formatDirectoryAnalysis(stats: DirectoryAnalysisResult, dirPath: string): string {
    let output = `目录分析: ${dirPath}\n\n`;
    output += `总文件数: ${stats.totalFiles}\n`;
    output += `总大小: ${(stats.totalSize / 1024 / 1024).toFixed(2)} MB\n\n`;
    
    output += "文件类型分布:\n";
    const sortedExts = Object.entries(stats.byExtension)
        .sort((a, b) => b[1].size - a[1].size);
    
    for (const [ext, data] of sortedExts) {
        output += `${ext}: ${data.count} 个文件, ${(data.size / 1024 / 1024).toFixed(2)} MB\n`;
    }
    
    output += "\n最大的文件:\n";
    stats.largestFiles.forEach((file, index) => {
        output += `${index + 1}. ${file.path} (${(file.size / 1024 / 1024).toFixed(2)} MB)\n`;
    });
    
    return output;
}

/**
 * 计算文件哈希值
 * @param filePath 文件路径
 * @param algorithm 哈希算法
 * @returns 哈希值
 */
export async function calculateFileHash(
    filePath: string, 
    algorithm: string = "md5"
): Promise<string> {
    const expandedPath = expandHomeDir(filePath);
    const hash = createHash(algorithm);
    const stream = createReadStream(expandedPath);
    
    for await (const chunk of stream) {
        hash.update(chunk);
    }
    
    return hash.digest('hex');
}

/**
 * 基本MIME类型映射表
 */
export const MIME_TYPES: Record<string, string> = {
    '.txt': 'text/plain',
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.xml': 'application/xml',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.pdf': 'application/pdf',
    '.zip': 'application/zip',
    '.mp3': 'audio/mpeg',
    '.mp4': 'video/mp4',
    '.mov': 'video/quicktime',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.ppt': 'application/vnd.ms-powerpoint',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

/**
 * 文件信息接口
 */
export interface FileInfo {
    path: string;
    size: number;
    sizeFormatted: string;
    mtime: Date;
    ctime: Date;
    mimeType: string;
    previewText?: string;
}

/**
 * 获取文件信息
 * @param filePath 文件路径
 * @returns 文件信息对象
 */
export async function getFileInfo(filePath: string): Promise<FileInfo> {
    const expandedPath = expandHomeDir(filePath);
    const stats = await fs.stat(expandedPath);
    const fileExt = path.extname(expandedPath).toLowerCase();
    const mimeType = MIME_TYPES[fileExt] || 'application/octet-stream';
    
    const fileInfo: FileInfo = {
        path: expandedPath,
        size: stats.size,
        sizeFormatted: `${(stats.size / 1024).toFixed(2)} KB`,
        mtime: stats.mtime,
        ctime: stats.birthtime,
        mimeType
    };
    
    // 如果是文本文件，尝试读取前几行
    if (mimeType.startsWith('text/') || mimeType.includes('javascript') || mimeType.includes('json') || mimeType.includes('xml')) {
        const content = await fs.readFile(expandedPath, { encoding: 'utf-8', flag: 'r' });
        fileInfo.previewText = content.slice(0, 500) + (content.length > 500 ? '...' : '');
    }
    
    return fileInfo;
}

/**
 * 格式化文件信息
 * @param fileInfo 文件信息对象
 * @returns 格式化后的文本
 */
export function formatFileInfo(fileInfo: FileInfo): string {
    let output = `文件路径: ${fileInfo.path}\n`;
    output += `文件大小: ${fileInfo.sizeFormatted}\n`;
    output += `修改时间: ${fileInfo.mtime.toLocaleString()}\n`;
    output += `创建时间: ${fileInfo.ctime.toLocaleString()}\n`;
    output += `MIME类型: ${fileInfo.mimeType}\n`;
    
    if (fileInfo.previewText) {
        output += '\n文件预览:\n' + fileInfo.previewText;
    }
    
    return output;
}

/**
 * 检查文件或目录是否存在
 * @param filePath 文件或目录路径
 * @returns 包含存在状态和类型的对象
 */
export async function checkPathExists(filePath: string): Promise<{ exists: boolean; type: string | null }> {
  try {
    const expandedPath = expandHomeDir(filePath);
    const stats = await fs.stat(expandedPath);
    
    let type = "unknown";
    if (stats.isFile()) {
      type = "file";
    } else if (stats.isDirectory()) {
      type = "directory";
    } else if (stats.isSymbolicLink()) {
      type = "symlink";
    }
    
    return {
      exists: true,
      type
    };
  } catch (error) {
    return {
      exists: false,
      type: null
    };
  }
}

export async function forceDeleteFile(filePath: string): Promise<{ success: boolean; message: string }> {
  try {
    const stats = await fs.stat(filePath);
    
    if (stats.isDirectory()) {
      // 如果是目录，使用 rm 递归删除
      await fs.rm(filePath, { recursive: true, force: true });
      return { success: true, message: "文件夹已成功删除" };
    } else {
      // 如果是文件，使用 unlink 删除
      await fs.unlink(filePath);
      return { success: true, message: "文件已成功删除" };
    }
  } catch (error) {
    // 如果常规删除失败，尝试提升权限删除
    try {
      const { stdout, stderr } = await new Promise<{stdout: string, stderr: string}>((resolve, reject) => {
        import('child_process').then(cp => {
          cp.exec(`sudo rm -rf "${filePath}"`, (error, stdout, stderr) => {
            if (error) reject(error);
            else resolve({stdout, stderr});
          });
        });
      });
      
      return { success: true, message: "路径已通过提升权限成功删除" };
    } catch (forceError) {
      return { 
        success: false, 
        message: `强制删除失败: ${(forceError as Error).message || String(forceError)}` 
      };
    }
  }
}

// 为了向后兼容，我们保留原始函数名，但内部调用新函数
export async function forceDeletePath(filePath: string): Promise<{ success: boolean; message: string }> {
  return forceDeleteFile(filePath);
} 