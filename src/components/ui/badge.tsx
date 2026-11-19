import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium [&_svg]:size-3",
  {
    variants: {
      variant: {
        neutral: "border-slate-200 bg-slate-50 text-slate-600",
        teal: "border-teal-200 bg-teal-50 text-teal-800",
        green: "border-emerald-200 bg-emerald-50 text-emerald-700",
        amber: "border-amber-200 bg-amber-50 text-amber-800",
        red: "border-red-200 bg-red-50 text-red-700",
        mock: "border-dashed border-slate-300 bg-white text-slate-500",
      },
    },
    defaultVariants: { variant: "neutral" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
