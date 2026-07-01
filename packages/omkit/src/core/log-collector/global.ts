import { LogsCollector } from "./LogsCollector.ts";

/**
 * The process-wide log. One per process: pipelines log into it and drain it, and
 * the event bus pushes an entry here on every `emit`. Created separately from any
 * pipeline so code that runs before/around a pipeline (like a bus) can reach it.
 */
export const log = new LogsCollector();
