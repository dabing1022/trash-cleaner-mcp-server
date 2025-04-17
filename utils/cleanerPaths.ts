import os from 'os';
import path from 'path';

// 检测操作系统类型
const IS_MACOS = os.platform() === 'darwin';
if (!IS_MACOS) {
  console.warn('警告: 当前清理工具路径配置针对 macOS 系统优化，在其他操作系统上可能无法正常工作。');
}

// 用户主目录
const HOME_DIR = os.homedir();

/**
 * macOS 应用程序相关路径
 * 这些路径是特定于 macOS 系统的应用程序和用户数据存储位置
 */
export const APP_PATHS = {
  SYSTEM_APPS: '/Applications',                    // macOS 系统应用目录
  USER_APPS: path.join(HOME_DIR, 'Applications'),  // 用户应用目录
  DOWNLOADS: path.join(HOME_DIR, 'Downloads'),     // 下载目录
  DESKTOP: path.join(HOME_DIR, 'Desktop'),         // 桌面目录
  DOCUMENTS: path.join(HOME_DIR, 'Documents')      // 文档目录
};

/**
 * macOS 缓存和配置路径
 * 这些路径包含应用程序缓存、偏好设置和状态信息
 */
export const CACHE_PATHS = {
  SYSTEM_CACHE: '/Library/Caches',                              // 系统级缓存目录
  USER_CACHE: path.join(HOME_DIR, 'Library/Caches'),            // 用户级缓存目录
  TEMP_DIR: os.tmpdir(),                                        // 临时文件目录
  SYSTEM_PREFS: '/Library/Preferences',                         // 系统级偏好设置
  USER_PREFS: path.join(HOME_DIR, 'Library/Preferences'),       // 用户级偏好设置
  SAVED_STATE: path.join(HOME_DIR, 'Library/Saved Application State')  // 应用程序状态保存
};

/**
 * macOS 系统启动项和守护进程目录
 * 这些目录包含系统启动时自动运行的程序和后台服务
 */
export const SYSTEM_LAUNCH_PATHS = {
  SYSTEM_LAUNCH_AGENTS: '/Library/LaunchAgents',                // 系统启动代理
  SYSTEM_LAUNCH_DAEMONS: '/Library/LaunchDaemons',              // 系统守护进程
  SYSTEM_STARTUP_ITEMS: '/Library/StartupItems',                // 系统启动项
  USER_LAUNCH_AGENTS: path.join(HOME_DIR, 'Library/LaunchAgents'),    // 用户启动代理
  USER_LAUNCH_DAEMONS: path.join(HOME_DIR, 'Library/LaunchDaemons')   // 用户守护进程
};

/**
 * macOS 特定应用的特殊路径
 * 这些路径是某些特定应用程序在 macOS 上的缓存和配置文件位置
 */
export const SPECIAL_PATHS = {
  WEWORK_PROFILES: path.join(HOME_DIR, 'Library/Containers/com.tencent.WeWorkMac/Data/Documents/Profiles'),  // 企业微信配置
  CHROME_UPDATES: path.join(HOME_DIR, 'Library/Google/GoogleSoftwareUpdate'),                                // Chrome 更新缓存
  CHROME_BRAND: path.join(HOME_DIR, 'Library/Google/Google Chrome Brand.plist'),                             // Chrome 品牌信息
  QIHOO_DAEMON: '/Library/LaunchDaemons/com.qihoo.360safe.daemon.plist'                                     // 360安全卫士守护进程
};

/**
 * macOS 系统中应排除清理的重要路径
 * 这些路径包含关键系统文件，不应被清理工具处理
 */
export const EXCLUDE_PATHS = [
  path.join(HOME_DIR, 'Library'),  // 用户资源库目录
  '/Library',                      // 系统资源库
  '/System',                       // 系统目录
  '/Applications',                 // 应用程序目录
  '/bin',                          // 系统二进制文件
  '/cores',                        // 核心转储
  '/sbin',                         // 系统管理二进制文件
  '/usr',                          // 用户目录
  path.join(HOME_DIR, '.Trash')    // 垃圾桶
];

// 清理结果类型
export interface CleaningResult {
  cleanedPaths: string[];
  totalSize: number;
  failedPaths: string[];
  errors: string[];
}

// 清理选项
export interface CleaningOptions {
  dryRun?: boolean;         // 是否仅模拟清理
  recursive?: boolean;      // 是否递归清理
  maxDepth?: number;        // 最大递归深度
  excludePatterns?: string[]; // 排除的文件名模式
  includeHidden?: boolean;  // 是否包含隐藏文件
  olderThan?: number;       // 清理早于指定天数的文件
}

// 默认清理选项
export const DEFAULT_CLEANING_OPTIONS: CleaningOptions = {
  dryRun: true,
  recursive: true,
  maxDepth: 3,
  excludePatterns: [],
  includeHidden: false,
  olderThan: 30
}; 