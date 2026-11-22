import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "soft inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-45 active:scale-[0.985] [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-[0_1px_2px_rgb(0_0_0/0.12)] hover:opacity-90",
        glass: "glass-subtle hover:bg-[var(--glass-bg)] text-foreground",
        ghost: "hover:bg-[var(--glass-bg-subtle)] text-foreground",
        rose: "bg-rose text-white hover:opacity-90",
        destructive: "text-destructive hover:bg-[color-mix(in_oklab,var(--destructive)_12%,transparent)]",
      },
      size: { default: "h-9 px-4", sm: "h-8 px-3 text-[13px]", lg: "h-10 px-5", icon: "size-9", "icon-sm": "size-8" },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps extends React.ComponentProps<"button">, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export function Button({ className, variant, size, asChild, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
