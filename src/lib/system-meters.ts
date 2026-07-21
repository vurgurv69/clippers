/**
 * Lightweight process meters for job UX (CPU %, RSS memory).
 */
import os from "os";

let lastCpu = process.cpuUsage();
let lastWall = Date.now();

export type SystemMeters = {
  cpuPercent: number;
  memoryMb: number;
  memoryPercent: number;
  cores: number;
};

export function sampleMeters(): SystemMeters {
  const now = Date.now();
  const cpu = process.cpuUsage(lastCpu);
  const wallMs = Math.max(1, now - lastWall);
  lastCpu = process.cpuUsage();
  lastWall = now;

  // user+system micros → percent of one core, then / cores
  const cpuMs = (cpu.user + cpu.system) / 1000;
  const cores = Math.max(1, os.cpus().length);
  const cpuPercent = Math.min(100, Math.round((cpuMs / wallMs) * 100 * (1 / Math.min(4, cores)) * 10) / 10);

  const mem = process.memoryUsage();
  const total = os.totalmem();
  const memoryMb = Math.round(mem.rss / (1024 * 1024));
  const memoryPercent = Math.round((mem.rss / total) * 1000) / 10;

  return {
    cpuPercent: Math.max(0, Math.min(100, cpuPercent)),
    memoryMb,
    memoryPercent: Math.max(0, Math.min(100, memoryPercent)),
    cores,
  };
}
