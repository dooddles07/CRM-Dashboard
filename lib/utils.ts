import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * The type scale is exposed as `text-*` utilities, which tailwind-merge would
 * otherwise mistake for text colours and drop when both appear in one cn().
 * Registering them as font sizes keeps `cn("text-h1", "text-ink")` intact.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        "text-display",
        "text-h1",
        "text-h2",
        "text-h3",
        "text-body-lg",
        "text-body",
        "text-body-sm",
        "text-caption",
        "text-label",
        "text-ident",
      ],
      shadow: ["shadow-card", "shadow-raised", "shadow-overlay"],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
