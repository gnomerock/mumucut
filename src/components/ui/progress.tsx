import * as ProgressPrimitive from "@radix-ui/react-progress";
import { cn } from "@/lib/utils";

export function Progress({ value, className }: { value: number; className?: string }) {
  return (
    <ProgressPrimitive.Root value={value} className={cn("relative h-1.5 w-full overflow-hidden rounded-full bg-[color-mix(in_oklab,var(--foreground)_10%,transparent)]", className)}>
      <ProgressPrimitive.Indicator className="h-full w-full origin-left rounded-full bg-foreground/75 transition-transform duration-500 ease-[var(--ease-soft)]" style={{ transform: `scaleX(${Math.max(0, Math.min(100, value)) / 100})` }} />
    </ProgressPrimitive.Root>
  );
}
