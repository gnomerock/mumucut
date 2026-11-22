import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badge = cva("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap", {
  variants: {
    tone: {
      neutral: "bg-[color-mix(in_oklab,var(--foreground)_8%,transparent)] text-foreground/80",
      success: "bg-[color-mix(in_oklab,var(--success)_16%,transparent)] text-[color-mix(in_oklab,var(--success)_85%,var(--foreground))]",
      warning: "bg-[color-mix(in_oklab,var(--warning)_20%,transparent)] text-[color-mix(in_oklab,var(--warning)_70%,var(--foreground))]",
      danger: "bg-[color-mix(in_oklab,var(--rose)_14%,transparent)] text-rose",
      info: "bg-[color-mix(in_oklab,var(--info)_16%,transparent)] text-[color-mix(in_oklab,var(--info)_75%,var(--foreground))]",
    },
  },
  defaultVariants: { tone: "neutral" },
});

export function Badge({ className, tone, dot, children, ...props }: React.ComponentProps<"span"> & VariantProps<typeof badge> & { dot?: boolean }) {
  return (
    <span className={cn(badge({ tone }), className)} {...props}>
      {dot && <span className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}
