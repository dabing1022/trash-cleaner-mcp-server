import os from "os";
import path from "path";

// 路径展开工具：将 ~ 替换为 home 目录
export function expandHomeDir(inputPath: string): string {
    if (inputPath.startsWith("~")) {
        return path.join(os.homedir(), inputPath.slice(1));
    }
    return inputPath;
} 