import os from "os";
import path from 'path';
import { logger } from './logger'; // Assuming logger is available

// 路径展开工具：将 ~ 替换为 home 目录
export function expandHomeDir(inputPath: string): string {
    if (inputPath.startsWith("~")) {
        return path.join(os.homedir(), inputPath.slice(1));
    }
    return inputPath;
}

/**
 * Resolves a path pattern that may contain `~` (home directory)
 * and environment variables (e.g., `%TEMP%`, `%LOCALAPPDATA%`).
 *
 * @param pattern The path pattern string to resolve.
 * @returns The resolved absolute path string, or null if resolution fails (e.g., invalid env var).
 */
export async function resolvePath(pattern: string): Promise<string | null> {
    if (!pattern) {
        return null;
    }

    let resolved = pattern;

    // 1. Resolve home directory (`~`)
    if (resolved.startsWith('~')) {
        const homeDir = os.homedir();
        if (!homeDir) {
            logger.warn(`[resolvePath] Could not determine home directory for pattern: ${pattern}`);
            return null; // Cannot resolve if home dir is unknown
        }
        // Replace only at the beginning, ensuring it's followed by a separator or is the whole path
        if (resolved === '~') {
            resolved = homeDir;
        } else if (resolved.startsWith('~/') || resolved.startsWith('~\\')) {
            resolved = path.join(homeDir, resolved.substring(2));
        } else {
             // Handle cases like '~file' which are less common but might occur.
             // This simple replacement might be okay, or might need adjustment based on usage.
             // Sticking to the common '~/' or '~\' case for now.
             logger.debug(`[resolvePath] Pattern starts with '~' but not '~/' or '~\\'. Treating '~' as literal?: ${pattern}`);
             // If we decide ~ must be followed by separator, we could return null here or not replace.
        }
    }

    // 2. Resolve environment variables (e.g., %TEMP%, %LOCALAPPDATA%)
    // Regex to find %VAR_NAME%
    const envVarRegex = /%([^%]+)%/g;
    let match;
    let potentialFailure = false;

    // Need to loop as replaceAll might not work correctly if vars are nested or adjacent
    // Keep replacing until no more variables are found or a failure occurs
    let iterations = 0; // Safety break
    const MAX_ITERATIONS = 10;
    let currentPattern = resolved;
    while ((match = envVarRegex.exec(currentPattern)) !== null && iterations < MAX_ITERATIONS) {
        const varName = match[1];
        // Ensure varName is a valid string before using as index
        if (!varName) {
            logger.warn(`[resolvePath] Found empty variable placeholder (%) in pattern: ${pattern}`);
            potentialFailure = true;
            break;
        }
        
        const varValue = process.env[varName];

        if (varValue === undefined) {
            logger.warn(`[resolvePath] Environment variable not found: ${varName} in pattern: ${pattern}`);
            potentialFailure = true;
            break; // Stop processing this path if a variable is missing
        }

        currentPattern = currentPattern.replace(`%${varName}%`, varValue);
        envVarRegex.lastIndex = 0;
        iterations++;
    }
     resolved = currentPattern;

    if (potentialFailure) {
        return null;
    }
     if (iterations >= MAX_ITERATIONS) {
        logger.warn(`[resolvePath] Max iterations reached resolving environment variables for pattern: ${pattern}. Result: ${resolved}`);
        // Decide if partial resolution is okay or should fail
        // return null;
    }


    // 3. Normalize the path
    // path.normalize helps clean up separators (e.g., multiple slashes)
    // path.resolve can also be used if we want to ensure it's absolute relative to CWD,
    // but since we handle ~ and env vars which usually lead to absolute paths,
    // normalize might be sufficient and safer.
    try {
        const normalizedPath = path.normalize(resolved);
        // Maybe add a check to ensure it looks like a valid path?
        return normalizedPath;
    } catch (error) {
         logger.error(`[resolvePath] Error normalizing path: ${resolved}`, error);
         return null;
    }
} 