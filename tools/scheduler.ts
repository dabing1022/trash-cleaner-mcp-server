import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { registerTool } from "../utils/registerToolHelper";
import { logger } from "../utils/logger";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { Cron } from "croner"; // We'll add this dependency later
import { randomUUID } from 'crypto';
import { executeTool } from "../utils/registerToolHelper"; // --- 导入 executeTool ---

// --- Configuration ---
const SCHEDULER_CONFIG_DIR = path.join(os.homedir(), '.trash-cleaner');
const SCHEDULES_FILE_PATH = path.join(SCHEDULER_CONFIG_DIR, 'schedules.json');
const MAX_HISTORY_PER_TASK = 20; // Limit the execution history stored

// --- Task Model ---
interface TaskExecutionRecord {
    timestamp: string;
    result: 'success' | 'failure';
    details?: string; // Error message or short result summary
}

interface ScheduledTask {
    id: string; // Unique identifier
    name: string; // User-friendly name
    cronExpression: string; // Cron pattern or interval syntax
    toolName: string; // The MCP tool to execute (e.g., "[Cleaner] cleanAppCaches")
    toolParams: Record<string, any>; // Parameters for the target tool
    enabled: boolean; // Whether the task is active
    createdAt: string; // ISO timestamp
    updatedAt: string; // ISO timestamp
    // --- Execution History --- Add these back
    lastRunAt?: string;
    lastRunResult?: 'success' | 'failure';
    executionHistory?: TaskExecutionRecord[];
}

// --- Persistence ---
let scheduledTasks: ScheduledTask[] = [];
let cronJobs: Map<string, Cron> = new Map(); // Map task ID to Croner instance

/**
 * Ensures the configuration directory exists.
 */
async function ensureConfigDir(): Promise<void> {
    try {
        await fs.mkdir(SCHEDULER_CONFIG_DIR, { recursive: true });
    } catch (error: any) {
        logger.error('Failed to create scheduler config directory', { path: SCHEDULER_CONFIG_DIR, error: error.message });
        throw new Error(`Failed to create config directory: ${error.message}`);
    }
}

/**
 * Loads tasks from the JSON file.
 */
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
            // Decide: Throw error or continue with empty list? Let's continue for resilience.
            scheduledTasks = [];
        }
    }
    // Initialize Croner jobs based on loaded tasks
    initializeCronJobs();
}

/**
 * Saves the current list of tasks to the JSON file.
 */
async function saveTasks(): Promise<void> {
    await ensureConfigDir();
    try {
        const data = JSON.stringify(scheduledTasks, null, 2);
        await fs.writeFile(SCHEDULES_FILE_PATH, data, 'utf-8');
        logger.debug('Scheduled tasks saved successfully.', { path: SCHEDULES_FILE_PATH });
    } catch (error: any) {
        logger.error('Failed to save scheduled tasks', { path: SCHEDULES_FILE_PATH, error: error.message });
        // Consider retry logic or user notification
    }
}

/**
 * Placeholder for initializing Croner jobs from loaded tasks.
 */
function initializeCronJobs(): void {
    cronJobs.forEach(job => job.stop()); // Stop existing jobs if any (e.g., during reload)
    cronJobs.clear();

    for (const task of scheduledTasks) {
        if (task.enabled) {
            try {
                const job = new Cron(task.cronExpression, { name: task.id, paused: !task.enabled, timezone: "UTC" /* Or detect local */ }, () => {
                    // TODO: Implement the actual tool execution logic here
                    logger.info(`Executing scheduled task: ${task.name} (ID: ${task.id})`);
                    executeScheduledTool(task);
                });
                cronJobs.set(task.id, job);
                logger.info(`Scheduled task "${task.name}" (ID: ${task.id})`);
            } catch (error: any) {
                 logger.error(`Failed to schedule task "${task.name}" (ID: ${task.id})`, { error: error.message, cron: task.cronExpression });
            }
        }
    }
     logger.info(`Initialized ${cronJobs.size} active cron jobs.`);
}

/**
 * Executes the target MCP tool using the shared helper.
 */
async function executeScheduledTool(task: ScheduledTask): Promise<void> {
    const executionStartTime = new Date();
    let executionResult: 'success' | 'failure' = 'failure';
    let executionDetails: string | undefined;

    logger.info(`Executing tool "${task.toolName}" for task "${task.name}" (ID: ${task.id}) via executeTool helper`, { params: task.toolParams });

    try {
        const result = await executeTool(task.toolName, task.toolParams);

        // Log success
        const resultText = result?.content?.[0]?.text;
        const summary = typeof resultText === 'string' ? resultText.substring(0, 200) : '(No text content)'; // Increased summary length
        logger.info(`Tool "${task.toolName}" executed successfully for task ${task.id}.`, { resultSummary: summary });
        executionResult = 'success';
        executionDetails = summary;

    } catch (error: any) {
        // callTool should throw if the tool doesn't exist or execution fails
        const errorMessage = error.message || String(error);
        logger.error(`Execution of tool "${task.toolName}" for task ${task.id} failed via executeTool helper.`, { error: errorMessage });
        executionResult = 'failure';
        executionDetails = errorMessage;
        // Do not re-throw here, handle history update below
    } finally {
        // --- Update Task History --- Always attempt to update history
        const taskIndex = scheduledTasks.findIndex(t => t.id === task.id);
        if (taskIndex !== -1) {
             const taskToUpdate = scheduledTasks[taskIndex];
             if(taskToUpdate) {
                taskToUpdate.lastRunAt = executionStartTime.toISOString();
                taskToUpdate.lastRunResult = executionResult;
                if (!taskToUpdate.executionHistory) {
                    taskToUpdate.executionHistory = [];
                }
                taskToUpdate.executionHistory.unshift({ // Add to the beginning
                    timestamp: executionStartTime.toISOString(),
                    result: executionResult,
                    details: executionDetails?.substring(0, 500) // Limit details length
                });
                // Trim history
                if (taskToUpdate.executionHistory.length > MAX_HISTORY_PER_TASK) {
                    taskToUpdate.executionHistory.length = MAX_HISTORY_PER_TASK;
                }
                taskToUpdate.updatedAt = new Date().toISOString(); // Reflect history update
                // Persist the updated task history
                await saveTasks();
                logger.debug(`Updated execution history for task ${task.id}. Result: ${executionResult}`);
            } else {
                 logger.error("Task disappeared while trying to update history", { taskId: task.id });
            }
        } else {
            logger.warn(`Task ${task.id} not found when trying to update history.`);
        }
         // If the execution failed originally, re-throw the error *after* history update attempt
         if (executionResult === 'failure') {
             throw new Error(executionDetails || "Scheduled task execution failed");
         }
    }
}


// --- MCP Tool Registration ---

export async function registerSchedulerTools(server: McpServer): Promise<void> {
    logger.info('Registering scheduler tools...');

    // Load tasks initially
    await loadTasks();

    // == Task Listing ==
    registerTool(
        server,
        "[Schedule] listTasks",
        "列出所有已配置的定时任务及其状态。",
        {}, // No input parameters for simple listing
        async () => {
            try {
                // Return a copy to avoid external modification
                const tasksToReturn = scheduledTasks.map(task => ({
                    id: task.id,
                    name: task.name,
                    cronExpression: task.cronExpression,
                    toolName: task.toolName,
                    enabled: task.enabled,
                    createdAt: task.createdAt,
                    updatedAt: task.updatedAt
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
     registerTool(
        server,
        "[Schedule] createTask",
        "创建一个新的定时任务。",
        {
            name: z.string().min(1).describe("任务的可读名称"),
            cronExpression: z.string().min(1).describe("Cron 表达式 (例如 '0 9 * * MON') 或间隔 (例如 '@daily', '*/15 * * * *')"),
            toolName: z.string().min(1).describe("要执行的 MCP 工具的完整名称 (例如 '[Cleaner] cleanAppCaches')"),
            toolParams: z.record(z.any()).optional().default({}).describe("要传递给目标工具的参数对象"),
            enabled: z.boolean().optional().default(true).describe("是否立即启用任务")
        },
        async (args: { name: string; cronExpression: string; toolName: string; toolParams: Record<string, any>; enabled: boolean }) => {
            try {
                // Basic validation (Croner will do more specific cron validation)
                if (!args.name || !args.cronExpression || !args.toolName) {
                     throw new Error("Missing required fields: name, cronExpression, toolName");
                }

                 // TODO: Add validation to check if toolName actually exists in the server?

                const newTask: ScheduledTask = {
                    id: randomUUID(),
                    name: args.name,
                    cronExpression: args.cronExpression,
                    toolName: args.toolName,
                    toolParams: args.toolParams,
                    enabled: args.enabled,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                };

                // Add to list
                scheduledTasks.push(newTask);

                // Schedule with Croner if enabled
                if (newTask.enabled) {
                    try {
                        const job = new Cron(newTask.cronExpression, { name: newTask.id, paused: false, timezone: "UTC" }, () => {
                             logger.info(`Executing scheduled task: ${newTask.name} (ID: ${newTask.id})`);
                             executeScheduledTool(newTask); // Use the placeholder
                        });
                        cronJobs.set(newTask.id, job);
                        logger.info(`Created and scheduled new task "${newTask.name}" (ID: ${newTask.id})`);
                    } catch (error: any) {
                        // Remove task if scheduling failed? Or keep it disabled? Let's keep it but log error.
                        logger.error(`Failed to schedule new task "${newTask.name}" (ID: ${newTask.id})`, { error: error.message, cron: newTask.cronExpression });
                         // Optionally disable the task on schedule failure
                         // newTask.enabled = false;
                         // return { content: [{ type: "text", text: `Task created but failed to schedule: ${error.message}. Task is disabled.` }] };
                         throw new Error(`Invalid cron expression or scheduling error: ${error.message}`);
                    }
                } else {
                     logger.info(`Created disabled task "${newTask.name}" (ID: ${newTask.id})`);
                }

                // Persist changes
                await saveTasks();

                return {
                    content: [{ type: "text", text: `Task "${newTask.name}" created successfully with ID: ${newTask.id}` }]
                };
            } catch (error: any) {
                logger.error('Failed to create scheduled task', { args, error: error.message });
                return { content: [{ type: "text", text: `Error creating task: ${error.message}` }] };
            }
        }
    );

    // == Get Task Details ==
    registerTool(
        server,
        "[Schedule] getTaskDetails",
        "获取指定定时任务的详细信息。",
        {
            taskId: z.string().uuid().describe("要获取详情的任务 ID")
        },
        async (args: { taskId: string }) => {
            try {
                const task = scheduledTasks.find(t => t.id === args.taskId);
                if (!task) {
                    return { content: [{ type: "text", text: `错误：未找到 ID 为 ${args.taskId} 的任务` }] };
                }
                // Return a copy
                return { content: [{ type: "text", text: JSON.stringify({ ...task }, null, 2) }] };
            } catch (error: any) {
                 logger.error('Failed to get task details', { taskId: args.taskId, error: error.message });
                 return { content: [{ type: "text", text: `获取任务详情出错: ${error.message}` }] };
            }
        }
    );

     // == Update Task ==
    registerTool(
        server,
        "[Schedule] updateTask",
        "更新现有定时任务的配置。",
        {
            taskId: z.string().uuid().describe("要更新的任务 ID"),
            name: z.string().min(1).optional().describe("新的任务名称"),
            cronExpression: z.string().min(1).optional().describe("新的 Cron 表达式或间隔"),
            toolName: z.string().min(1).optional().describe("新的目标 MCP 工具名称"),
            toolParams: z.record(z.any()).optional().describe("新的工具参数对象"),
            enabled: z.boolean().optional().describe("新的启用状态")
        },
        async (args: { taskId: string; name?: string; cronExpression?: string; toolName?: string; toolParams?: Record<string, any>; enabled?: boolean }) => {
            try {
                const taskIndex = scheduledTasks.findIndex(t => t.id === args.taskId);
                if (taskIndex === -1) {
                    return { content: [{ type: "text", text: `错误：未找到 ID 为 ${args.taskId} 的任务` }] };
                }

                // Get a reference safely
                let task = scheduledTasks[taskIndex];
                if (!task) { // Extra check for TS
                     logger.error('Task became undefined after findIndex', { taskId: args.taskId });
                     return { content: [{ type: "text", text: `内部错误：无法引用任务 ${args.taskId}` }] };
                }

                let updated = false;
                let needsReschedule = false;

                // Apply updates
                if (args.name !== undefined && args.name !== task.name) { task.name = args.name; updated = true; }
                if (args.toolName !== undefined && args.toolName !== task.toolName) { task.toolName = args.toolName; updated = true; }
                if (args.toolParams !== undefined /* Deep compare needed? */) { task.toolParams = args.toolParams; updated = true; }
                if (args.cronExpression !== undefined && args.cronExpression !== task.cronExpression) {
                    task.cronExpression = args.cronExpression;
                    updated = true;
                    needsReschedule = true;
                }
                 if (args.enabled !== undefined && args.enabled !== task.enabled) {
                    task.enabled = args.enabled;
                    updated = true;
                    needsReschedule = true; // Need to stop/start cron job
                }

                if (!updated) {
                    return { content: [{ type: "text", text: `任务 ${args.taskId} 未做任何更改。` }] };
                }

                task.updatedAt = new Date().toISOString();

                // Stop existing job if it needs rescheduling or disabling
                const existingJob = cronJobs.get(task.id);
                if (existingJob && (needsReschedule || !task.enabled)) {
                    existingJob.stop();
                    cronJobs.delete(task.id);
                     logger.info(`Stopped cron job for updated/disabled task ${task.id}`);
                }

                // Start new job if needed
                if (task.enabled && needsReschedule) {
                    try {
                        const newJob = new Cron(task.cronExpression, { name: task.id, paused: false, timezone: "UTC" }, () => {
                            logger.info(`Executing scheduled task: ${task.name} (ID: ${task.id})`);
                            executeScheduledTool(task);
                        });
                        cronJobs.set(task.id, newJob);
                         logger.info(`Rescheduled task "${task.name}" (ID: ${task.id})`);
                    } catch (error: any) {
                        logger.error(`Failed to reschedule task "${task.name}" (ID: ${task.id}) after update`, { error: error.message });
                        // Disable the task if rescheduling failed to prevent inconsistent state?
                        task.enabled = false;
                        await saveTasks(); // Save the disabled state
                         return { content: [{ type: "text", text: `任务更新成功，但在重新启用时调度失败: ${error.message}. 任务已被禁用。` }] };
                    }
                }

                // Persist
                await saveTasks();

                return { content: [{ type: "text", text: `任务 "${task.name}" (ID: ${task.id}) 更新成功。` }] };

            } catch (error: any) {
                logger.error('Failed to update scheduled task', { args, error: error.message });
                return { content: [{ type: "text", text: `更新任务出错: ${error.message}` }] };
            }
        }
    );

     // == Enable Task ==
    registerTool(
        server,
        "[Schedule] enableTask",
        "启用一个已禁用的定时任务。",
        {
            taskId: z.string().uuid().describe("要启用的任务 ID")
        },
        async (args: { taskId: string }) => {
             try {
                 const taskIndex = scheduledTasks.findIndex(t => t.id === args.taskId);
                if (taskIndex === -1) {
                    return { content: [{ type: "text", text: `错误：未找到 ID 为 ${args.taskId} 的任务` }] };
                }
                // Get a reference safely
                let task = scheduledTasks[taskIndex];
                if (!task) { // Extra check for TS
                     logger.error('Task became undefined after findIndex', { taskId: args.taskId });
                     return { content: [{ type: "text", text: `内部错误：无法引用任务 ${args.taskId}` }] };
                }

                if (task.enabled) {
                     return { content: [{ type: "text", text: `任务 "${task.name}" (ID: ${task.id}) 已经是启用状态。` }] };
                }

                // Enable the task
                task.enabled = true;
                task.updatedAt = new Date().toISOString();

                 // Schedule the job
                try {
                    const existingJob = cronJobs.get(task.id);
                     if (existingJob) existingJob.stop(); // Stop if exists somehow

                    const newJob = new Cron(task.cronExpression, { name: task.id, paused: false, timezone: "UTC" }, () => {
                        logger.info(`Executing scheduled task: ${task.name} (ID: ${task.id})`);
                        executeScheduledTool(task);
                    });
                    cronJobs.set(task.id, newJob);
                     logger.info(`Enabled and scheduled task "${task.name}" (ID: ${task.id})`);
                } catch (error: any) {
                     logger.error(`Failed to schedule task "${task.name}" (ID: ${task.id}) upon enabling`, { error: error.message });
                     // Revert enable status?
                     task.enabled = false;
                     await saveTasks(); // Save reverted state
                     return { content: [{ type: "text", text: `启用任务失败，无法调度: ${error.message}. 任务保持禁用状态。` }] };
                }

                // Persist
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
        "[Schedule] disableTask",
        "禁用一个当前启用的定时任务。",
        {
            taskId: z.string().uuid().describe("要禁用的任务 ID")
        },
        async (args: { taskId: string }) => {
            try {
                const taskIndex = scheduledTasks.findIndex(t => t.id === args.taskId);
                if (taskIndex === -1) {
                    return { content: [{ type: "text", text: `错误：未找到 ID 为 ${args.taskId} 的任务` }] };
                }
                 // Get a reference safely
                let task = scheduledTasks[taskIndex];
                 if (!task) { // Extra check for TS
                     logger.error('Task became undefined after findIndex', { taskId: args.taskId });
                     return { content: [{ type: "text", text: `内部错误：无法引用任务 ${args.taskId}` }] };
                }

                if (!task.enabled) {
                    return { content: [{ type: "text", text: `任务 "${task.name}" (ID: ${task.id}) 已经是禁用状态。` }] };
                }

                // Disable the task
                task.enabled = false;
                task.updatedAt = new Date().toISOString();

                // Stop the cron job
                const existingJob = cronJobs.get(task.id);
                if (existingJob) {
                    existingJob.stop();
                    cronJobs.delete(task.id);
                    logger.info(`Stopped cron job for disabled task ${task.id}`);
                }

                // Persist
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
        "[Schedule] deleteTask",
        "永久删除一个定时任务。",
        {
            taskId: z.string().uuid().describe("要删除的任务 ID")
        },
        async (args: { taskId: string }) => {
             try {
                const taskIndex = scheduledTasks.findIndex(t => t.id === args.taskId);
                if (taskIndex === -1) {
                    return { content: [{ type: "text", text: `错误：未找到 ID 为 ${args.taskId} 的任务` }] };
                }
                // Get a reference safely
                let task = scheduledTasks[taskIndex];
                 if (!task) { // Extra check for TS
                     logger.error('Task became undefined after findIndex', { taskId: args.taskId });
                     return { content: [{ type: "text", text: `内部错误：无法引用任务 ${args.taskId}` }] };
                }

                // Stop the cron job if active
                const existingJob = cronJobs.get(task.id);
                if (existingJob) {
                    existingJob.stop();
                    cronJobs.delete(task.id);
                    logger.info(`Stopped cron job for deleted task ${task.id}`);
                }

                // Remove from the list
                scheduledTasks.splice(taskIndex, 1);

                // Persist
                await saveTasks();
                 return { content: [{ type: "text", text: `任务 "${task.name}" (ID: ${task.id}) 已成功删除。` }] };

             } catch (error: any) {
                logger.error('Failed to delete scheduled task', { taskId: args.taskId, error: error.message });
                return { content: [{ type: "text", text: `删除任务出错: ${error.message}` }] };
            }
        }
    );

    // == Run Task Now ==
    registerTool(
        server,
        "[Schedule] runTaskNow",
        "立即手动执行一个定时任务，无论其当前启用状态或计划如何。",
        {
            taskId: z.string().uuid().describe("要立即执行的任务 ID")
        },
        async (args: { taskId: string }) => {
            try {
                const task = scheduledTasks.find(t => t.id === args.taskId);
                if (!task) {
                    return { content: [{ type: "text", text: `错误：未找到 ID 为 ${args.taskId} 的任务` }] };
                }

                logger.info(`Manually triggering task: ${task.name} (ID: ${task.id})`);
                // Call the actual execution logic (currently placeholder)
                // We need to handle the promise and potential errors here
                try {
                    await executeScheduledTool(task);
                    logger.info(`Manual execution of task ${task.id} completed.`);
                     return { content: [{ type: "text", text: `任务 "${task.name}" (ID: ${task.id}) 已手动触发执行。` }] }; // Note: This response is immediate, execution is async.
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
        "[Schedule] getTaskHistory",
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
