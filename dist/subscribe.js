"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.subscribe = void 0;
const createSpawn_1 = require("./createSpawn");
const generateShortId_1 = require("./generateShortId");
const Logger_1 = require("./Logger");
const p_retry_1 = __importDefault(require("p-retry"));
const log = Logger_1.Logger.child({
    namespace: 'subscribe',
});
const subscribe = (trigger) => {
    let teardownInitiated = false;
    let activeTask = null;
    let first = true;
    let fileChangeEventQueue = [];
    const handleSubscriptionEvent = async () => {
        let currentFirst = first;
        if (first) {
            currentFirst = true;
            first = false;
        }
        let abortController = null;
        if (trigger.interruptible) {
            abortController = new AbortController();
        }
        let abortSignal = abortController === null || abortController === void 0 ? void 0 : abortController.signal;
        if (abortSignal && trigger.abortSignal) {
            trigger.abortSignal.addEventListener('abort', () => {
                abortController === null || abortController === void 0 ? void 0 : abortController.abort();
            });
        }
        else if (trigger.abortSignal) {
            abortSignal = trigger.abortSignal;
        }
        if (activeTask) {
            if (trigger.interruptible) {
                log.warn('%s (%s): aborted task', trigger.name, activeTask.id);
                if (!activeTask.abortController) {
                    throw new Error('Expected abort controller to be set');
                }
                activeTask.abortController.abort();
                activeTask = null;
            }
            else {
                if (trigger.persistent) {
                    log.warn('%s (%s): ignoring event because the trigger is persistent', trigger.name, activeTask.id);
                    return undefined;
                }
                log.warn('%s (%s): waiting for task to complete', trigger.name, activeTask.id);
                if (activeTask.queued) {
                    return undefined;
                }
                activeTask.queued = true;
                try {
                    await activeTask.promise;
                }
                catch (_a) {
                    // nothing to do
                }
            }
        }
        if (teardownInitiated) {
            log.warn('teardown already initiated');
            return undefined;
        }
        const affectedPaths = [];
        const event = {
            files: fileChangeEventQueue
                .filter(({ filename }) => {
                if (affectedPaths.includes(filename)) {
                    return false;
                }
                affectedPaths.push(filename);
                return true;
            })
                .map(({ filename }) => {
                return {
                    name: filename,
                };
            }),
        };
        fileChangeEventQueue = [];
        const taskId = (0, generateShortId_1.generateShortId)();
        if (trigger.initialRun && currentFirst) {
            log.debug('%s (%s): initial run...', trigger.name, taskId);
        }
        else if (event.files.length > 10) {
            log.debug({
                files: event.files.slice(0, 10).map((file) => {
                    return file.name;
                }),
            }, '%s (%s): %d files changed; showing first 10', trigger.name, taskId, event.files.length);
        }
        else {
            log.debug({
                files: event.files.map((file) => {
                    return file.name;
                }),
            }, '%s (%s): %d %s changed', trigger.name, taskId, event.files.length, event.files.length === 1 ? 'file' : 'files');
        }
        const taskPromise = (0, p_retry_1.default)((attempt) => {
            var _a, _b;
            return trigger.onChange({
                abortSignal,
                attempt,
                files: event.files.map((file) => {
                    return {
                        name: file.name,
                    };
                }),
                first: currentFirst,
                log,
                spawn: (0, createSpawn_1.createSpawn)(taskId, {
                    abortSignal,
                    colorOutputPrefix: (_a = trigger.output) === null || _a === void 0 ? void 0 : _a.colorPrefix,
                    cwd: trigger.cwd,
                    prefixOutput: (_b = trigger.output) === null || _b === void 0 ? void 0 : _b.prefix,
                    throttleOutput: trigger.throttleOutput,
                }),
                taskId,
            });
        }, {
            ...trigger.retry,
            onFailedAttempt: ({ retriesLeft }) => {
                if (retriesLeft > 0) {
                    log.warn('%s (%s): retrying task %d/%d...', trigger.name, taskId, trigger.retry.retries - retriesLeft, trigger.retry.retries);
                }
            },
        })
            // eslint-disable-next-line promise/prefer-await-to-then
            .then(() => {
            if (taskId === (activeTask === null || activeTask === void 0 ? void 0 : activeTask.id)) {
                log.debug('%s (%s): completed task', trigger.name, taskId);
                activeTask = null;
            }
        })
            // eslint-disable-next-line promise/prefer-await-to-then
            .catch(() => {
            log.warn('%s (%s): task failed', trigger.name, taskId);
        });
        // eslint-disable-next-line require-atomic-updates
        activeTask = {
            abortController,
            id: taskId,
            promise: taskPromise,
            queued: false,
        };
        log.debug('%s (%s): started task', trigger.name, taskId);
        return taskPromise;
    };
    return {
        activeTask,
        expression: trigger.expression,
        initialRun: trigger.initialRun,
        persistent: trigger.persistent,
        teardown: async () => {
            var _a, _b;
            if (teardownInitiated) {
                log.warn('teardown already initiated');
                return;
            }
            teardownInitiated = true;
            if (trigger.onTeardown) {
                const taskId = (0, generateShortId_1.generateShortId)();
                try {
                    await trigger.onTeardown({
                        spawn: (0, createSpawn_1.createSpawn)(taskId, {
                            colorOutputPrefix: (_a = trigger.output) === null || _a === void 0 ? void 0 : _a.colorPrefix,
                            prefixOutput: (_b = trigger.output) === null || _b === void 0 ? void 0 : _b.prefix,
                            throttleOutput: trigger.throttleOutput,
                        }),
                    });
                }
                catch (error) {
                    log.error({
                        error,
                    }, 'teardown produced an error');
                }
            }
        },
        trigger: async (events) => {
            fileChangeEventQueue.push(...events);
            try {
                await handleSubscriptionEvent();
            }
            catch (error) {
                log.error({
                    error,
                }, 'trigger produced an error');
            }
        },
    };
};
exports.subscribe = subscribe;
//# sourceMappingURL=subscribe.js.map