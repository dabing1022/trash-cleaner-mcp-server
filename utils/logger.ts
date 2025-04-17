import winston from 'winston';
import path from 'path';
import fs from 'fs';
import os from 'os';
// 使用Winston的类型
import type { TransformableInfo } from 'logform';

// 确定合适的日志目录位置
const determineLogDir = (): string => {
  const platform = os.platform();
  let logDir: string;
  
  if (platform === 'darwin') {
    // macOS: 使用用户库目录中的Logs子目录
    logDir = path.join(os.homedir(), 'Library', 'Logs', 'trash-cleaner-mcp-server');
  } else if (platform === 'win32') {
    // Windows: 使用AppData/Local下的logs目录
    logDir = path.join(os.homedir(), 'AppData', 'Local', 'trash-cleaner-mcp-server', 'logs');
  } else {
    // Linux和其他平台: 使用~/.trash-cleaner-mcp-server/logs
    logDir = path.join(os.homedir(), '.trash-cleaner-mcp-server', 'logs');
  }
  
  return logDir;
};

// 确保日志目录存在
const LOG_DIR = determineLogDir();
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

// 定义日志级别
const logLevels = {
  error: 0,   // 错误：系统错误、崩溃等
  warn: 1,    // 警告：可能的问题但不影响功能
  info: 2,    // 信息：重要的应用状态变化
  http: 3,    // HTTP：API和网络请求
  verbose: 4, // 详细：比debug稍微简单的日志
  debug: 5,   // 调试：详细调试信息
  silly: 6    // 琐碎：最详细的信息
};

// 定义日志颜色
const logColors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'blue',
  verbose: 'cyan',
  debug: 'magenta',
  silly: 'grey'
};

// 添加颜色
winston.addColors(logColors);

// 创建格式化器
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.colorize({ all: true }),
  winston.format.printf((info: TransformableInfo) => {
    const { level, message, timestamp, ...meta } = info;
    const metaString = Object.keys(meta).length ? `\n${JSON.stringify(meta, null, 2)}` : '';
    return `${timestamp} [${level}] ${message}${metaString}`;
  })
);

const fileFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.json()
);

// 确定日志级别，通过环境变量设置
const getLogLevel = (): string => {
  const env = process.env.NODE_ENV || 'development';
  const logLevel = process.env.LOG_LEVEL || (env === 'production' ? 'info' : 'debug');
  return logLevel;
};

// 创建日志记录器
const logger = winston.createLogger({
  levels: logLevels,
  level: getLogLevel(),
  transports: [
    // 控制台输出
    new winston.transports.Console({
      format: consoleFormat,
    }),
    // 信息及以上级别日志文件
    new winston.transports.File({ 
      filename: path.join(LOG_DIR, 'combined.log'),
      format: fileFormat,
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    // 错误级别日志文件
    new winston.transports.File({ 
      filename: path.join(LOG_DIR, 'error.log'),
      level: 'error',
      format: fileFormat,
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
  ],
  // 处理未捕获的异常和Promise拒绝
  exceptionHandlers: [
    new winston.transports.File({ 
      filename: path.join(LOG_DIR, 'exceptions.log'),
      format: fileFormat,
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    new winston.transports.Console({
      format: consoleFormat,
    }),
  ],
  // 是否退出程序当异常发生时
  exitOnError: false,
});

// 创建请求logger中间件（用于HTTP服务）
const morganStream = {
  write: (message: string) => {
    logger.http(message.trim());
  },
};

// 添加MCP特定元数据到日志
interface LogMetadata {
  [key: string]: any;
}

// 为MCP客户端添加会话ID
let mcpSessionId = 0;
const getNextMcpSessionId = (): string => `mcp-${Date.now()}-${++mcpSessionId}`;

// MCP日志专用方法
interface McpLogger {
  error(message: string, meta?: LogMetadata): void;
  warn(message: string, meta?: LogMetadata): void;
  info(message: string, meta?: LogMetadata): void;
  debug(message: string, meta?: LogMetadata): void;
  verbose(message: string, meta?: LogMetadata): void;
  createMcpClientLogger(clientName: string): McpLogger;
}

// 创建默认MCP日志记录器
const mcpLogger: McpLogger = {
  error(message: string, meta: LogMetadata = {}) {
    logger.error(message, { component: 'mcp', ...meta });
  },
  warn(message: string, meta: LogMetadata = {}) {
    logger.warn(message, { component: 'mcp', ...meta });
  },
  info(message: string, meta: LogMetadata = {}) {
    logger.info(message, { component: 'mcp', ...meta });
  },
  debug(message: string, meta: LogMetadata = {}) {
    logger.debug(message, { component: 'mcp', ...meta });
  },
  verbose(message: string, meta: LogMetadata = {}) {
    logger.verbose(message, { component: 'mcp', ...meta });
  },
  // 创建特定MCP客户端的日志记录器
  createMcpClientLogger(clientName: string): McpLogger {
    const sessionId = getNextMcpSessionId();
    
    return {
      error(message: string, meta: LogMetadata = {}) {
        logger.error(message, { component: 'mcp', client: clientName, sessionId, ...meta });
      },
      warn(message: string, meta: LogMetadata = {}) {
        logger.warn(message, { component: 'mcp', client: clientName, sessionId, ...meta });
      },
      info(message: string, meta: LogMetadata = {}) {
        logger.info(message, { component: 'mcp', client: clientName, sessionId, ...meta });
      },
      debug(message: string, meta: LogMetadata = {}) {
        logger.debug(message, { component: 'mcp', client: clientName, sessionId, ...meta });
      },
      verbose(message: string, meta: LogMetadata = {}) {
        logger.verbose(message, { component: 'mcp', client: clientName, sessionId, ...meta });
      },
      createMcpClientLogger: mcpLogger.createMcpClientLogger
    };
  }
};

// 添加系统信息
logger.info('日志系统初始化完成', { 
  platform: os.platform(), 
  hostname: os.hostname(),
  nodeVersion: process.version
});

export { logger, mcpLogger, morganStream }; 