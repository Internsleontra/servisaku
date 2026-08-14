import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva } from "class-variance-authority"
import { LoaderCircle } from "lucide-react"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  // Behaviour is aligned with ds/Button and the kit's core/Button so the same
  // primary CTA cannot look different depending on which import a page used:
  //   radius   rounded-field (--radius-field 14px)
  //   focus    --focus-ring token, matching the kit's button:focus-visible rule
  //   disabled 0.42
  //   press    0.97 (--press-scale)
  // `transition` (not `transition-colors`) because primary hovers via
  // `filter: brightness()` — a gradient has no background-color to tween.
  "inline-flex items-center justify-center whitespace-nowrap rounded-field text-sm font-semibold transition focus-visible:outline-none focus-visible:shadow-[shadow:var(--focus-ring)] disabled:pointer-events-none disabled:opacity-[0.42] active:scale-[0.97]",
  {
    variants: {
      variant: {
        default: "bg-ink text-ink-inverse hover:bg-ink-secondary", // Standard primary
        // Brand CTA. Matches ds/Button `primary` exactly: the shared --grad-brand
        // token plus the brand glow, deepened 6% on hover (brightness < 1) so the
        // gradient darkens without shifting hue. Was `bg-brand text-brand-ink`,
        // which painted #000675 text on a #0000EE fill — about 1.8:1 contrast.
        primary: "bg-grad-brand text-white shadow-brand hover:brightness-[0.94]",
        accent: "bg-brand-tint text-white hover:brightness-110", // High conversion orange
        tonal: "bg-brand-tint text-brand hover:bg-brand/10", // Soft background
        outline: "border border-hairline bg-surface text-ink hover:bg-raised",
        ghost: "hover:bg-raised text-ink-secondary hover:text-ink",
        'ghost-ink': "hover:bg-raised text-ink hover:text-ink-primary",
        destructive: "bg-danger text-white hover:brightness-110",
        link: "text-brand underline-offset-4 hover:underline",
      },
      size: {
        // Kit sizes are 36 / 44 / 52 and radius is uniform — sm/lg no longer
        // carry their own rounded-* override.
        default: "h-11 px-4 py-2",
        sm: "h-9 px-3 text-xs",
        lg: "h-13 px-8 text-base",
        icon: "h-11 w-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

const Button = React.forwardRef(({ className, variant, size, asChild = false, loading = false, children, ...props }, ref) => {
  const Comp = asChild ? Slot : "button"
  return (
    <Comp
      className={cn(buttonVariants({ variant, size, className }))}
      ref={ref}
      disabled={loading || props.disabled}
      {...props}
    >
      {/* The kit's Button swaps the leading icon for a spinner and KEEPS the
          label. Replacing children with a hardcoded "Loading..." dropped the
          caller's text mid-submit and was untranslatable.
          Still exactly one child, so `asChild`/Slot keeps working. */}
      {loading ? (
        <span className="inline-flex items-center gap-2">
          <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          {children}
        </span>
      ) : (
        children
      )}
    </Comp>
  )
})
Button.displayName = "Button"

export { Button, buttonVariants }
