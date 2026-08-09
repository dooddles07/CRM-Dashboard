"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/**
 * A dialog whose open state is driven by a URL search param (e.g. `?create=1`),
 * matching the `?create=` / `?compose=` links that already exist across the app.
 * Closing clears the param so the URL stays shareable.
 */
export function ParamDialog({
  param = "create",
  title,
  description,
  children,
  submitLabel = "Create",
  onSubmit,
  size = "md",
}: {
  param?: string;
  title: string;
  description?: string;
  children: React.ReactNode;
  submitLabel?: string;
  /** Return false to keep the dialog open (e.g. validation failed). */
  onSubmit: () => void | boolean;
  size?: "md" | "lg";
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const open = params.get(param) !== null;

  function setOpen(next: boolean) {
    if (next) return;
    const q = new URLSearchParams(params.toString());
    q.delete(param);
    const s = q.toString();
    router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className={size === "lg" ? "sm:max-w-2xl" : "sm:max-w-lg"}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <div className="space-y-3.5 py-1">{children}</div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => {
              const ok = onSubmit();
              if (ok !== false) setOpen(false);
            }}
          >
            {submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** A labelled field wrapper for the compact forms inside ParamDialog. */
export function Field({
  label,
  htmlFor,
  children,
  hint,
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="text-label text-ink-3">
        {label}
      </label>
      {children}
      {hint && <p className="text-caption text-ink-3">{hint}</p>}
    </div>
  );
}
