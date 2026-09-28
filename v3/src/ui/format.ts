import type { Resources, Yields } from "../sim/types";

export const RES_ICON: Record<string, string> = {
  credits: "₵",
  metals: "⛭",
  energy: "⚡",
  exotics: "✦",
  research: "⚗",
};

export const RES_NAME: Record<string, string> = {
  credits: "Credits",
  metals: "Metals",
  energy: "Energy",
  exotics: "Exotic Matter",
  research: "Research",
};

export function fmt(n: number, digits = 0): string {
  if (!isFinite(n)) return "∞";
  const a = Math.abs(n);
  if (a >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (a >= 1e4) return (n / 1e3).toFixed(1) + "k";
  return n.toFixed(digits);
}

export function signed(n: number, digits = 1): string {
  return (n >= 0 ? "+" : "") + fmt(n, digits);
}

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export function costHtml(cost: Partial<Resources>, have?: Resources): string {
  return Object.entries(cost)
    .filter(([, v]) => v)
    .map(([k, v]) => {
      const short = have && have[k as keyof Resources] < (v as number);
      return `<span style="color:${short ? "var(--bad)" : `var(--${k})`}">${RES_ICON[k]}${fmt(v as number)}</span>`;
    })
    .join(" ");
}

export function yieldsHtml(y: Yields, mult = 1): string {
  return Object.entries(y)
    .filter(([, v]) => v)
    .map(([k, v]) => `<span style="color:var(--${k})">${signed((v as number) * mult, 1)}${RES_ICON[k]}</span>`)
    .join(" ");
}

export function dateString(day: number): string {
  const year = 2400 + Math.floor(day / 360);
  const d = Math.floor(day % 360);
  const month = Math.floor(d / 30) + 1;
  return `${year}.${String(month).padStart(2, "0")}.${String((d % 30) + 1).padStart(2, "0")}`;
}

export function pct(v: number): string {
  return `${Math.round(v * 100)}%`;
}
