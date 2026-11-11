import type { TraceEntry } from "./types";

const g = globalThis as unknown as { __traces?: Map<string, TraceEntry[]> };
const traces = (g.__traces ??= new Map<string, TraceEntry[]>());

export function pushTrace(sid: string, e: TraceEntry) {
  const list = traces.get(sid) ?? [];
  list.push(e);
  traces.set(sid, list.slice(-40));
}
export const getTrace = (sid: string): TraceEntry[] => traces.get(sid) ?? [];