import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function fmtDuration(s?: number | null) {
  if (s == null) return "–";
  return `${s.toFixed(1)} วิ`;
}

export function fmtTime(s?: string | null) {
  if (!s) return "–";
  return s.slice(0, 16).replace("T", " ");
}
