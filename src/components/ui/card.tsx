import * as React from "react";
import { cn } from "@/lib/utils";

export function GlassCard({ className, strong, ...props }: React.ComponentProps<"div"> & { strong?: boolean }) {
  return <div className={cn("rounded-lg", strong ? "glass-strong" : "glass", className)} {...props} />;
}
export function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex items-start justify-between gap-3 px-5 pt-4", className)} {...props} />;
}
export function CardTitle({ className, ...props }: React.ComponentProps<"h3">) {
  return <h3 className={cn("text-[15px] font-semibold tracking-tight", className)} {...props} />;
}
export function CardDesc({ className, ...props }: React.ComponentProps<"p">) {
  return <p className={cn("text-[13px] text-muted-foreground", className)} {...props} />;
}
export function CardBody({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("px-5 pb-5 pt-3", className)} {...props} />;
}
