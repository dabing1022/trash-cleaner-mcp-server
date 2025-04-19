import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { registerTool, executeTool, getAllToolsForMatching } from "../utils/registerToolHelper";
import { logger } from "../utils/logger";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { Cron } from "croner";
import { randomUUID } from 'crypto';
import Fuse from 'fuse.js';

// --- Configuration ---
// Determine the appropriate configuration directory based on OS
const getConfigDir = (): string => {
    const baseDir = process.env.APPDATA || (process.platform === 'darwin' ? path.join(os.homedir(), 'Library', 'Preferences') : path.join(os.homedir(), '.config'));
    return path.join(baseDir, 'trash-cleaner-mcp'); // Using a more specific name
};
const SCHEDULER_CONFIG_DIR = getConfigDir();
const SCHEDULES_FILE_PATH = path.join(SCHEDULER_CONFIG_DIR, 'schedules.json');
const MAX_HISTORY_PER_TASK = 20;

// --- Task Model ---
interface TaskExecutionRecord {
    timestamp: string;
    result: 'success' | 'failure';
    details?: string;
}

interface ScheduledTask {
    id: string;
    name: string;
    cronExpression: string;
    toolName: string;
    toolParams: Record<string, any>;
    enabled: boolean;
    createdAt: string;
    updatedAt: string;
    lastRunAt?: string;
    lastRunResult?: 'success' | 'failure';
    executionHistory?: TaskExecutionRecord[];
}

// --- Persistence ---
let scheduledTasks: ScheduledTask[] = [];
let cronJobs: Map<string, Cron> = new Map();

async function ensureConfigDir(): Promise<void> {
    try {
        await fs.mkdir(SCHEDULER_CONFIG_DIR, { recursive: true });
    } catch (error: any) {
        logger.error('Failed to create scheduler config directory', { path: SCHEDULER_CONFIG_DIR, error: error.message });
        throw new Error(`Failed to create config directory: ${error.message}`);
    }
}

async function loadTasks(): Promise<void> {
    await ensureConfigDir();
    try {
        const data = await fs.readFile(SCHEDULES_FILE_PATH, 'utf-8');
        scheduledTasks = JSON.parse(data) as ScheduledTask[];
        logger.info(`Loaded ${scheduledTasks.length} scheduled tasks from ${SCHEDULES_FILE_PATH}`);
    } catch (error: any) {
        if (error.code === 'ENOENT') {
            logger.info('Schedules file not found, starting with empty list.', { path: SCHEDULES_FILE_PATH });
            scheduledTasks = [];
        } else {
            logger.error('Failed to load scheduled tasks', { path: SCHEDULES_FILE_PATH, error: error.message });
            scheduledTasks = [];
        }
    }
    initializeCronJobs();
}

async function saveTasks(): Promise<void> {
    await ensureConfigDir();
    try {
        const data = JSON.stringify(scheduledTasks, null, 2);
        await fs.writeFile(SCHEDULES_FILE_PATH, data, 'utf-8');
        logger.debug('Scheduled tasks saved successfully.', { path: SCHEDULES_FILE_PATH });
    } catch (error: any) {
        logger.error('Failed to save scheduled tasks', { path: SCHEDULES_FILE_PATH, error: error.message });
    }
}

// --- Helper Function for Name Resolution ---
/**
 * Resolves a tool name using either direct match or fuzzy search based on a query.
 * @param toolName Direct tool name (optional).
 * @param toolQuery Fuzzy query string (optional).
 * @returns The resolved exact tool name.
 * @throws If resolution fails (not found, ambiguous, invalid input).
 */
function resolveToolNameSync(toolName?: string, toolQuery?: string): string {
    const availableTools = getAllToolsForMatching();

    if (toolName) {
        const exists = availableTools.some(t => t.name === toolName);
        if (exists) {
            return toolName;
        } else {
             // Provide suggestions if direct name fails but might be close
            const fuseOptions = { includeScore: true, threshold: 0.6, keys: ['name'] };
            const fuse = new Fuse(availableTools, fuseOptions);
            const results = fuse.search(toolName);
             let suggestions = "";
             if (results.length > 0) {
                 suggestions = "\n可能的工具是：\n" + results.slice(0, 3).map(r => `  - ${r.item.name}`).join('\n');
             }
            throw new Error(`指定的工具名称不存在: "${toolName}"${suggestions}`);
        }
    } else if (toolQuery) {
        const fuseOptions = {
            includeScore: true,
            threshold: 0.4, // Start broader
            keys: ['name', 'description']
        };
        const fuse = new Fuse(availableTools, fuseOptions);
        const results = fuse.search(toolQuery);

        if (results.length === 0) {
            throw new Error(`找不到与查询 "${toolQuery}" 匹配的工具。`);
        }

        const bestMatch = results[0];
        // Use a stricter threshold for automatic selection
        if (bestMatch && bestMatch.score !== undefined && bestMatch.score < 0.3) {
            logger.info(`Fuzzy search resolved "${toolQuery}" to "${bestMatch.item.name}" with score ${bestMatch.score}`);
            return bestMatch.item.name;
        } else {
            const suggestions = results.slice(0, 3).map(r => `  - ${r.item.name} (相似度: ${((1 - (r.score ?? 1)) * 100).toFixed(0)}%)`);
            throw new Error(`查询 "${toolQuery}" 匹配不明确或相似度不够。可能的匹配项：\n${suggestions.join('\n')}\n请提供更精确的名称或查询，或使用 'toolName' 参数指定完整名称。`);
        }
    } else {
        throw new Error("内部错误：必须提供 toolName 或 toolQuery。");
    }
}

/**
 * Initializes Croner jobs from the loaded scheduledTasks array.
 */
function initializeCronJobs(): void {
    cronJobs.forEach(job => job.stop());
    cronJobs.clear();

    for (const task of scheduledTasks) {
        if (task.enabled) {
            try {
                // Ensure we pass a *copy* of the task to avoid closure issues if task object is modified later
                const taskCopy = { ...task };
                const job = new Cron(taskCopy.cronExpression, { name: taskCopy.id, paused: !taskCopy.enabled, timezone: "UTC" }, () => {
                    logger.info(`Executing scheduled task: ${taskCopy.name} (ID: ${taskCopy.id})`);
                    // Call executeScheduledTool with the task copy
                    executeScheduledTool(taskCopy).catch(err => {
                         // Error is already logged and history updated within executeScheduledTool's finally block
                         logger.error(`Unhandled exception during scheduled execution of task ${taskCopy.id}`, { error: err.message });
                     });
                });
                cronJobs.set(taskCopy.id, job);
                logger.info(`Scheduled task "${taskCopy.name}" (ID: ${taskCopy.id})`);
            } catch (error: any) {
                logger.error(`Failed to schedule task "${task.name}" (ID: ${task.id})`, { error: error.message, cron: task.cronExpression });
            }
        }
    }
    logger.info(`Initialized ${cronJobs.size} active cron jobs.`);
}

/**
 * Executes the target MCP tool using the shared helper and updates history.
 */
async function executeScheduledTool(task: ScheduledTask): Promise<void> {
    const executionStartTime = new Date();
    let executionResult: 'success' | 'failure' = 'failure';
    let executionDetails: string | undefined;

    logger.info(`Executing tool "${task.toolName}" for task "${task.name}" (ID: ${task.id}) via executeTool helper`, { params: task.toolParams });

    try {
        const result = await executeTool(task.toolName, task.toolParams);
        const resultText = result?.content?.[0]?.text;
        const summary = typeof resultText === 'string' ? resultText.substring(0, 200) : '(No text content)';
        logger.info(`Tool "${task.toolName}" executed successfully for task ${task.id}.`, { resultSummary: summary });
        executionResult = 'success';
        executionDetails = summary;

    } catch (error: any) {
        const errorMessage = error.message || String(error);
        logger.error(`Execution of tool "${task.toolName}" for task ${task.id} failed via executeTool helper.`, { error: errorMessage });
        executionResult = 'failure';
        executionDetails = errorMessage;
    } finally {
        const taskIndex = scheduledTasks.findIndex(t => t.id === task.id);
        if (taskIndex !== -1) {
            const taskToUpdate = scheduledTasks[taskIndex];
            if(taskToUpdate) {
                taskToUpdate.lastRunAt = executionStartTime.toISOString();
                taskToUpdate.lastRunResult = executionResult;
                if (!taskToUpdate.executionHistory) {
                    taskToUpdate.executionHistory = [];
                }
                taskToUpdate.executionHistory.unshift({
                    timestamp: executionStartTime.toISOString(),
                    result: executionResult,
                    details: executionDetails?.substring(0, 500)
                });
                if (taskToUpdate.executionHistory.length > MAX_HISTORY_PER_TASK) {
                    taskToUpdate.executionHistory.length = MAX_HISTORY_PER_TASK;
                }
                taskToUpdate.updatedAt = new Date().toISOString();
                await saveTasks(); // Save history updates
                logger.debug(`Updated execution history for task ${task.id}. Result: ${executionResult}`);
            } else {
                 logger.error("Task disappeared while trying to update history", { taskId: task.id });
            }
        } else {
            logger.warn(`Task ${task.id} not found when trying to update history.`);
        }
         if (executionResult === 'failure') {
             // No need to re-throw here, the caller in initializeCronJobs catches it
             // throw new Error(executionDetails || "Scheduled task execution failed");
         }
    }
}

// --- MCP Tool Registration ---

export async function registerSchedulerTools(server: McpServer): Promise<void> {
    logger.info('Registering scheduler tools...');

    await loadTasks();

    // == Task Listing ==
    registerTool(
        server,
        "Schedule_ListTasks",
        "列出所有已配置的定时任务及其状态。",
        {},
        async () => {
            try {
                const tasksToReturn = scheduledTasks.map(task => ({
                    id: task.id,
                    name: task.name,
                    cronExpression: task.cronExpression,
                    toolName: task.toolName,
                    enabled: task.enabled,
                    createdAt: task.createdAt,
                    updatedAt: task.updatedAt,
                    lastRunAt: task.lastRunAt,
                    lastRunResult: task.lastRunResult
                }));
                return {
                    content: [{ type: "text", text: JSON.stringify(tasksToReturn, null, 2) }]
                };
            } catch (error: any) {
                logger.error('Failed to list scheduled tasks', { error: error.message });
                return { content: [{ type: "text", text: `Error listing tasks: ${error.message}` }] };
            }
        }
    );

    // == Task Creation ==
    // Define the base shape without refine
    const createTaskShape = {
        name: z.string().min(1).describe("任务的可读名称"),
        cronExpression: z.string().min(1).describe("Cron 表达式 (例如 '0 9 * * MON') 或间隔 (例如 '@daily', '*/15 * * * *')"),
        toolName: z.string().min(1).optional().describe("要执行的 MCP 工具的【精确】完整名称 (例如 '[TrashCleaner] cleanAppCaches')"),
        toolQuery: z.string().min(1).optional().describe("用于【模糊搜索】目标工具的自然语言描述或部分名称"),
        toolParams: z.record(z.any()).optional().default({}).describe("要传递给目标工具的参数对象"),
        enabled: z.boolean().optional().default(true).describe("是否立即启用任务")
    };
    // Type inference helper
    const createTaskArgParser = z.object(createTaskShape);
    type CreateTaskArgs = z.infer<typeof createTaskArgParser>;

    registerTool(
        server,
        "Schedule_CreateTask",
        "创建一个新的定时任务。可以通过 'toolName' 指定精确工具名，或通过 'toolQuery' 进行模糊搜索。",
        createTaskShape, // Pass the raw shape
        async (args: CreateTaskArgs) => { // Use inferred type
            // --- Manual Validation for toolName/toolQuery ---
            if (!args.toolName && !args.toolQuery) {
                throw new Error("必须提供 'toolName' 或 'toolQuery' 中的一个。");
            }
            if (args.toolName && args.toolQuery) {
                throw new Error("不能同时提供 'toolName' 和 'toolQuery'。");
            }
            // --- End Manual Validation ---

            try {
                const resolvedToolName = resolveToolNameSync(args.toolName, args.toolQuery);

                const newTask: ScheduledTask = {
                    id: randomUUID(),
                    name: args.name,
                    cronExpression: args.cronExpression,
                    toolName: resolvedToolName,
                    toolParams: args.toolParams,
                    enabled: args.enabled,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    executionHistory: []
                };

                scheduledTasks.push(newTask);

                if (newTask.enabled) {
                    try {
                        const taskCopy = { ...newTask };
                        const job = new Cron(taskCopy.cronExpression, { name: taskCopy.id, paused: false, timezone: "UTC" }, () => {
                            logger.info(`Executing scheduled task: ${taskCopy.name} (ID: ${taskCopy.id})`);
                            executeScheduledTool(taskCopy).catch(err => {
                                logger.error(`Unhandled exception during scheduled execution of task ${taskCopy.id}`, { error: err.message });
                            });
                        });
                        cronJobs.set(taskCopy.id, job);
                        logger.info(`Created and scheduled new task "${taskCopy.name}" (ID: ${taskCopy.id}) targeting tool ${taskCopy.toolName}`);
                    } catch (error: any) {
                        logger.error(`Failed to schedule new task "${newTask.name}" (ID: ${newTask.id})`, { error: error.message, cron: newTask.cronExpression });
                        newTask.enabled = false;
                        throw new Error(`任务 "${newTask.name}" 已创建但调度失败: ${error.message}. 任务已被禁用。`);
                    }
                } else {
                    logger.info(`Created disabled task "${newTask.name}" (ID: ${newTask.id}) targeting tool ${resolvedToolName}`);
                }

                await saveTasks();
                return {
                    content: [{ type: "text", text: `任务 "${newTask.name}" (ID: ${newTask.id}) 创建成功，将执行工具: ${resolvedToolName}` }]
                };
            } catch (error: any) {
                await saveTasks().catch(saveErr => logger.error("Failed to save tasks after create error", {saveErr}));
                logger.error('Failed to create scheduled task', { args: { ...args, toolName: args.toolName ?? 'N/A', toolQuery: args.toolQuery ?? 'N/A' }, error: error.message });
                return { content: [{ type: "text", text: `创建任务出错: ${error.message}` }] };
            }
        }
    );

    // == Get Task Details ==
    registerTool(
        server,
        "Schedule_GetTaskDetails",
        "获取指定定时任务的详细信息。",
        { taskId: z.string().uuid().describe("要获取详情的任务 ID") },
        async (args: { taskId: string }) => {
            try {
                const task = scheduledTasks.find(t => t.id === args.taskId);
                if (!task) {
                    return { content: [{ type: "text", text: `错误：未找到 ID 为 ${args.taskId} 的任务` }] };
                }
                return { content: [{ type: "text", text: JSON.stringify({ ...task }, null, 2) }] };
            } catch (error: any) {
                 logger.error('Failed to get task details', { taskId: args.taskId, error: error.message });
                 return { content: [{ type: "text", text: `获取任务详情出错: ${error.message}` }] };
            }
        }
    );

    // == Update Task ==
    // Define the base shape without refine
     const updateTaskShape = {
        taskId: z.string().uuid().describe("要更新的任务 ID"),
        name: z.string().min(1).optional().describe("新的任务名称"),
        cronExpression: z.string().min(1).optional().describe("新的 Cron 表达式或间隔"),
        toolName: z.string().min(1).optional().describe("要执行的 MCP 工具的【精确】完整名称"),
        toolQuery: z.string().min(1).optional().describe("用于【模糊搜索】目标工具的自然语言描述或部分名称"),
        toolParams: z.record(z.any()).optional().describe("新的工具参数对象"),
        enabled: z.boolean().optional().describe("新的启用状态")
     };
    // Type inference helper
    const updateTaskArgParser = z.object(updateTaskShape);
    type UpdateTaskArgs = z.infer<typeof updateTaskArgParser>;

    registerTool(
        server,
        "Schedule_UpdateTask",
        "更新现有定时任务的配置。可以通过 'toolName' 或 'toolQuery' 更新目标工具。",
        updateTaskShape, // Pass the raw shape
        async (args: UpdateTaskArgs) => { // Use inferred type
             // --- Manual Validation for toolName/toolQuery ---
             if (args.toolName && args.toolQuery) {
                 throw new Error("不能同时提供 'toolName' 和 'toolQuery'。");
             }
             // --- End Manual Validation ---

            try {
                const taskIndex = scheduledTasks.findIndex(t => t.id === args.taskId);
                if (taskIndex === -1) {
                    return { content: [{ type: "text", text: `错误：未找到 ID 为 ${args.taskId} 的任务` }] };
                }
                let task = scheduledTasks[taskIndex];
                 if (!task) {
                     logger.error('Task became undefined after findIndex', { taskId: args.taskId });
                     return { content: [{ type: "text", text: `内部错误：无法引用任务 ${args.taskId}` }] };
                 }

                let updated = false;
                let needsReschedule = false;
                let resolvedToolName = task.toolName; // Start with current name

                if (args.toolQuery || args.toolName) { // Check if either is provided for update
                    try {
                        // Pass undefined if not provided, resolveToolNameSync handles it
                        resolvedToolName = resolveToolNameSync(args.toolName, args.toolQuery);
                        if (resolvedToolName !== task.toolName) {
                            task.toolName = resolvedToolName;
                            updated = true;
                            logger.info(`Task ${task.id} target tool updated to: ${resolvedToolName}`);
                        }
                    } catch (resolveError: any) {
                        return { content: [{ type: "text", text: `更新目标工具失败: ${resolveError.message}` }] };
                    }
                }
                if (args.name !== undefined && args.name !== task.name) { task.name = args.name; updated = true; }
                if (args.toolParams !== undefined) { task.toolParams = args.toolParams; updated = true; }
                if (args.cronExpression !== undefined && args.cronExpression !== task.cronExpression) {
                    task.cronExpression = args.cronExpression;
                    updated = true;
                    needsReschedule = true;
                }
                 if (args.enabled !== undefined && args.enabled !== task.enabled) {
                    task.enabled = args.enabled;
                    updated = true;
                    needsReschedule = true;
                }

                if (!updated) {
                    return { content: [{ type: "text", text: `任务 ${args.taskId} 未做任何更改。` }] };
                }
                task.updatedAt = new Date().toISOString();
                const existingJob = cronJobs.get(task.id);
                if (existingJob && (needsReschedule || !task.enabled)) {
                    existingJob.stop();
                    cronJobs.delete(task.id);
                    logger.info(`Stopped cron job for updated/disabled task ${task.id}`);
                }
                if (task.enabled && (needsReschedule || !existingJob)) {
                    try {
                        const taskCopy = { ...task };
                        const newJob = new Cron(taskCopy.cronExpression, { name: taskCopy.id, paused: false, timezone: "UTC" }, () => {
                            logger.info(`Executing scheduled task: ${taskCopy.name} (ID: ${taskCopy.id})`);
                             executeScheduledTool(taskCopy).catch(err => {
                                logger.error(`Unhandled exception during scheduled execution of task ${taskCopy.id}`, { error: err.message });
                             });
                        });
                        cronJobs.set(taskCopy.id, newJob);
                         logger.info(`Rescheduled/Scheduled task "${taskCopy.name}" (ID: ${taskCopy.id})`);
                    } catch (error: any) {
                        logger.error(`Failed to reschedule task "${task.name}" (ID: ${task.id}) after update`, { error: error.message });
                        task.enabled = false;
                        await saveTasks();
                        return { content: [{ type: "text", text: `任务更新成功，但在重新启用/调度时失败: ${error.message}. 任务已被禁用。` }] };
                    }
                }
                await saveTasks();
                return { content: [{ type: "text", text: `任务 "${task.name}" (ID: ${task.id}) 更新成功。` }] };
            } catch (error: any) {
                 await saveTasks().catch(saveErr => logger.error("Failed to save tasks after update error", {saveErr}));
                logger.error('Failed to update scheduled task', { args: { taskId: args.taskId }, error: error.message });
                return { content: [{ type: "text", text: `更新任务出错: ${error.message}` }] };
            }
        }
    );

    // == Enable Task ==
    registerTool(
        server,
        "Schedule_EnableTask",
        "启用一个已禁用的定时任务。",
         { taskId: z.string().uuid().describe("要启用的任务 ID") },
        async (args: { taskId: string }) => {
             try {
                 const taskIndex = scheduledTasks.findIndex(t => t.id === args.taskId);
                if (taskIndex === -1) {
                    return { content: [{ type: "text", text: `错误：未找到 ID 为 ${args.taskId} 的任务` }] };
                }
                let task = scheduledTasks[taskIndex];
                if (!task) {
                     logger.error('Task became undefined after findIndex', { taskId: args.taskId });
                     return { content: [{ type: "text", text: `内部错误：无法引用任务 ${args.taskId}` }] };
                }

                if (task.enabled) {
                     return { content: [{ type: "text", text: `任务 "${task.name}" (ID: ${task.id}) 已经是启用状态。` }] };
                }
                task.enabled = true;
                task.updatedAt = new Date().toISOString();

                try {
                    const existingJob = cronJobs.get(task.id);
                     if (existingJob) existingJob.stop();

                    const taskCopy = { ...task };
                    const newJob = new Cron(taskCopy.cronExpression, { name: taskCopy.id, paused: false, timezone: "UTC" }, () => {
                        logger.info(`Executing scheduled task: ${taskCopy.name} (ID: ${taskCopy.id})`);
                         executeScheduledTool(taskCopy).catch(err => {
                             logger.error(`Unhandled exception during scheduled execution of task ${taskCopy.id}`, { error: err.message });
                         });
                    });
                    cronJobs.set(taskCopy.id, newJob);
                     logger.info(`Enabled and scheduled task "${taskCopy.name}" (ID: ${taskCopy.id})`);
                } catch (error: any) {
                     logger.error(`Failed to schedule task "${task.name}" (ID: ${task.id}) upon enabling`, { error: error.message });
                     task.enabled = false;
                     await saveTasks();
                     return { content: [{ type: "text", text: `启用任务失败，无法调度: ${error.message}. 任务保持禁用状态。` }] };
                }
                await saveTasks();
                return { content: [{ type: "text", text: `任务 "${task.name}" (ID: ${task.id}) 已成功启用。` }] };
             } catch (error: any) {
                logger.error('Failed to enable scheduled task', { taskId: args.taskId, error: error.message });
                return { content: [{ type: "text", text: `启用任务出错: ${error.message}` }] };
            }
        }
    );

    // == Disable Task ==
    registerTool(
        server,
        "Schedule_DisableTask",
        "禁用一个当前启用的定时任务。",
        { taskId: z.string().uuid().describe("要禁用的任务 ID") },
        async (args: { taskId: string }) => {
             try {
                const taskIndex = scheduledTasks.findIndex(t => t.id === args.taskId);
                if (taskIndex === -1) {
                    return { content: [{ type: "text", text: `错误：未找到 ID 为 ${args.taskId} 的任务` }] };
                }
                let task = scheduledTasks[taskIndex];
                 if (!task) {
                     logger.error('Task became undefined after findIndex', { taskId: args.taskId });
                     return { content: [{ type: "text", text: `内部错误：无法引用任务 ${args.taskId}` }] };
                }
                if (!task.enabled) {
                    return { content: [{ type: "text", text: `任务 "${task.name}" (ID: ${task.id}) 已经是禁用状态。` }] };
                }
                task.enabled = false;
                task.updatedAt = new Date().toISOString();
                const existingJob = cronJobs.get(task.id);
                if (existingJob) {
                    existingJob.stop();
                    cronJobs.delete(task.id);
                    logger.info(`Stopped cron job for disabled task ${task.id}`);
                }
                await saveTasks();
                return { content: [{ type: "text", text: `任务 "${task.name}" (ID: ${task.id}) 已成功禁用。` }] };
            } catch (error: any) {
                 logger.error('Failed to disable scheduled task', { taskId: args.taskId, error: error.message });
                 return { content: [{ type: "text", text: `禁用任务出错: ${error.message}` }] };
            }
        }
    );

    // == Delete Task ==
    registerTool(
        server,
        "Schedule_DeleteTask",
        "永久删除一个定时任务。",
        { taskId: z.string().uuid().describe("要删除的任务 ID") },
        async (args: { taskId: string }) => {
             try {
                const taskIndex = scheduledTasks.findIndex(t => t.id === args.taskId);
                if (taskIndex === -1) {
                    return { content: [{ type: "text", text: `错误：未找到 ID 为 ${args.taskId} 的任务` }] };
                }
                let task = scheduledTasks[taskIndex];
                 if (!task) {
                     logger.error('Task became undefined after findIndex', { taskId: args.taskId });
                     return { content: [{ type: "text", text: `内部错误：无法引用任务 ${args.taskId}` }] };
                }
                const existingJob = cronJobs.get(task.id);
                if (existingJob) {
                    existingJob.stop();
                    cronJobs.delete(task.id);
                    logger.info(`Stopped cron job for deleted task ${task.id}`);
                }
                const deletedTaskName = task.name;
                scheduledTasks.splice(taskIndex, 1);
                await saveTasks();
                 return { content: [{ type: "text", text: `任务 "${deletedTaskName}" (ID: ${args.taskId}) 已成功删除。` }] };
             } catch (error: any) {
                logger.error('Failed to delete scheduled task', { taskId: args.taskId, error: error.message });
                return { content: [{ type: "text", text: `删除任务出错: ${error.message}` }] };
            }
        }
    );

    // == Run Task Now ==
    registerTool(
        server,
        "Schedule_RunTaskNow",
        "立即手动执行一个定时任务，无论其当前启用状态或计划如何。",
         { taskId: z.string().uuid().describe("要立即执行的任务 ID") },
        async (args: { taskId: string }) => {
             try {
                const task = scheduledTasks.find(t => t.id === args.taskId);
                if (!task) {
                    return { content: [{ type: "text", text: `错误：未找到 ID 为 ${args.taskId} 的任务` }] };
                }
                logger.info(`Manually triggering task: ${task.name} (ID: ${task.id})`);
                try {
                    await executeScheduledTool(task);
                    logger.info(`Manual execution of task ${task.id} completed.`);
                    return { content: [{ type: "text", text: `任务 "${task.name}" (ID: ${task.id}) 已手动触发执行。` }] };
                } catch (executionError: any) {
                     logger.error(`Manual execution of task ${task.id} failed`, { error: executionError.message || executionError });
                    return { content: [{ type: "text", text: `手动执行任务 "${task.name}" (ID: ${task.id}) 时出错: ${executionError.message}` }] };
                }
            } catch (error: any) {
                logger.error('Failed to manually run scheduled task', { taskId: args.taskId, error: error.message });
                return { content: [{ type: "text", text: `手动运行任务出错: ${error.message}` }] };
            }
        }
    );

    // == Get Task History ==
     registerTool(
        server,
        "Schedule_GetTaskHistory",
        "获取指定定时任务的最近执行历史记录。",
        {
            taskId: z.string().uuid().describe("要获取历史记录的任务 ID"),
            limit: z.number().int().min(1).max(MAX_HISTORY_PER_TASK).optional().default(10).describe(`返回最近的记录条数 (默认 10, 最大 ${MAX_HISTORY_PER_TASK})`)
        },
        async (args: { taskId: string; limit: number }) => {
             try {
                const task = scheduledTasks.find(t => t.id === args.taskId);
                if (!task) {
                    return { content: [{ type: "text", text: `错误：未找到 ID 为 ${args.taskId} 的任务` }] };
                }
                const history = task.executionHistory || [];
                const limitedHistory = history.slice(0, args.limit);
                return { content: [{ type: "text", text: JSON.stringify(limitedHistory, null, 2) }] };
            } catch (error: any) {
                logger.error('Failed to get task history', { taskId: args.taskId, error: error.message });
                return { content: [{ type: "text", text: `获取任务历史出错: ${error.message}` }] };
            }
        }
    );

    logger.info('Scheduler tools registered.');
}
