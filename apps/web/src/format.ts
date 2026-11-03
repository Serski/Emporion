import { DAY, HOUR, MINUTE } from "@emporion/engine";

const nf = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

export const int = (n: number) => nf.format(Math.floor(n + 1e-9));

export const signed = (n: number) => `${n >= 0 ? "+" : "−"}${nf.format(Math.abs(Math.round(n)))}`;

export function duration(ms: number): string {
  if (!Number.isFinite(ms)) return "—";
  const s = Math.max(0, Math.ceil(ms / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const hms = `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return d > 0 ? `${d}d ${hms}` : hms;
}

// Game clock as "Day 3, 14:05" counted from the world's founding.
export function gameDate(now: number, startedAt: number): string {
  const t = Math.max(0, now - startedAt);
  const day = Math.floor(t / DAY) + 1;
  const h = Math.floor((t % DAY) / HOUR);
  const m = Math.floor((t % HOUR) / MINUTE);
  return `Day ${day}, ${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function at(time: number, startedAt: number): string {
  return gameDate(time, startedAt);
}

export const pct = (n: number) => `${Math.round(n * 100)}%`;

export const coords = (x: number, y: number) => `(${x}|${y})`;
