/// <reference types="node" />
import { type Throttle } from './types';
export declare const createSpawn: (taskId: string, { cwd, abortSignal, colorOutputPrefix, prefixOutput, throttleOutput, }?: {
    abortSignal?: AbortSignal | undefined;
    colorOutputPrefix?: boolean | undefined;
    cwd?: string | undefined;
    prefixOutput?: boolean | undefined;
    throttleOutput?: Throttle | undefined;
}) => (pieces: TemplateStringsArray, ...args: any[]) => Promise<import("zx").ProcessOutput>;
//# sourceMappingURL=createSpawn.d.ts.map