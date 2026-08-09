import { cn } from "@/lib/utils";
import { initialsOf } from "@/lib/format";

const tints = [
  "bg-info-soft text-info border-info-line",
  "bg-success-soft text-success border-success-line",
  "bg-ai-soft text-ai border-ai-line",
  "bg-warning-soft text-warning border-warning-line",
  "bg-neutral-soft text-neutral border-neutral-line",
  "bg-danger-soft text-danger border-danger-line",
];

const sizes = {
  xs: "size-6 text-[0.625rem]",
  sm: "size-7 text-caption",
  md: "size-9 text-body-sm",
  lg: "size-12 text-h3",
  xl: "size-16 text-h1",
};

interface PersonAvatarProps {
  name: string;
  /** Stable seed so the same person always gets the same tint. */
  id: string;
  size?: keyof typeof sizes;
  className?: string;
  initials?: string;
}

/**
 * Initials, not photographs. Stock portraits standing in for patients would be
 * fake medical imagery, and real ones would be the exact data this product
 * exists to protect.
 */
export function PersonAvatar({
  name,
  id,
  size = "md",
  className,
  initials,
}: PersonAvatarProps) {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  const tint = tints[hash % tints.length];

  return (
    <span
      aria-hidden
      title={name}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full border font-semibold select-none",
        tint,
        sizes[size],
        className,
      )}
    >
      {initials ?? initialsOf(name)}
    </span>
  );
}
