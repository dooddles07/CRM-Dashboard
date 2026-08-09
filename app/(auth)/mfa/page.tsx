"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CircleAlert, Loader2, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const LENGTH = 6;

export default function MfaPage() {
  const router = useRouter();
  const [digits, setDigits] = useState<string[]>(Array(LENGTH).fill(""));
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [seconds, setSeconds] = useState(28);
  const inputs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    inputs.current[0]?.focus();
  }, []);

  useEffect(() => {
    if (seconds <= 0) return;
    const t = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [seconds]);

  function setDigit(index: number, value: string) {
    const next = [...digits];
    next[index] = value;
    setDigits(next);
    if (value && index < LENGTH - 1) inputs.current[index + 1]?.focus();
  }

  function onKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      inputs.current[index - 1]?.focus();
    }
    if (e.key === "ArrowLeft" && index > 0) inputs.current[index - 1]?.focus();
    if (e.key === "ArrowRight" && index < LENGTH - 1) inputs.current[index + 1]?.focus();
  }

  function onPaste(e: React.ClipboardEvent) {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, LENGTH);
    if (!pasted) return;
    e.preventDefault();
    const next = Array(LENGTH).fill("");
    pasted.split("").forEach((c, i) => (next[i] = c));
    setDigits(next);
    inputs.current[Math.min(pasted.length, LENGTH - 1)]?.focus();
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (digits.some((d) => !d)) {
      setError("Enter all six digits from your authenticator app.");
      return;
    }
    setError(null);
    setPending(true);
    setTimeout(() => router.push("/"), 700);
  }

  return (
    <>
      <span className="inline-flex size-9 items-center justify-center rounded-md border border-line bg-surface-2 text-ink-2">
        <Smartphone aria-hidden className="size-4.5" strokeWidth={1.75} />
      </span>
      <h1 className="mt-4 text-h1 text-ink">Two-factor verification</h1>
      <p className="mt-1.5 text-body-sm text-ink-2">
        Enter the six-digit code from your authenticator app. It changes every 30
        seconds.
      </p>

      <form onSubmit={onSubmit} noValidate className="mt-7 space-y-5">
        {error && (
          <div
            role="alert"
            className="flex gap-2.5 rounded-md border border-danger-line bg-danger-soft px-3 py-2.5"
          >
            <CircleAlert
              aria-hidden
              className="mt-px size-4 shrink-0 text-danger"
              strokeWidth={2}
            />
            <p className="text-body-sm text-danger">{error}</p>
          </div>
        )}

        <fieldset>
          <legend className="mb-2 text-body-sm font-medium text-ink">
            Verification code
          </legend>
          <div className="flex gap-2" onPaste={onPaste}>
            {digits.map((digit, i) => (
              <input
                key={i}
                ref={(el) => {
                  inputs.current[i] = el;
                }}
                value={digit}
                onChange={(e) => setDigit(i, e.target.value.replace(/\D/g, "").slice(-1))}
                onKeyDown={(e) => onKeyDown(i, e)}
                inputMode="numeric"
                autoComplete={i === 0 ? "one-time-code" : "off"}
                maxLength={1}
                aria-label={`Digit ${i + 1} of ${LENGTH}`}
                aria-invalid={Boolean(error && !digit)}
                className={cn(
                  "h-12 w-full min-w-0 rounded-md border bg-surface text-center text-h2 text-ink tabular-nums",
                  "transition-colors duration-150 focus-visible:border-primary",
                  error && !digit ? "border-danger" : "border-line-strong",
                )}
              />
            ))}
          </div>
        </fieldset>

        <div className="flex items-center gap-2">
          <Checkbox id="trust" />
          <Label htmlFor="trust" className="font-normal text-ink-2">
            Trust this device for 30 days
          </Label>
        </div>

        <Button type="submit" className="h-10 w-full" disabled={pending}>
          {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
          {pending ? "Verifying…" : "Verify and continue"}
        </Button>

        <div className="flex items-center justify-between gap-3 text-body-sm">
          <button
            type="button"
            disabled={seconds > 0}
            onClick={() => setSeconds(30)}
            className="text-primary underline-offset-2 hover:underline disabled:text-ink-3 disabled:no-underline cursor-pointer disabled:cursor-not-allowed"
          >
            {seconds > 0 ? `Resend code in ${seconds}s` : "Resend code"}
          </button>
          <Link
            href="/login"
            className="text-ink-3 underline-offset-2 hover:text-ink hover:underline"
          >
            Use a recovery code
          </Link>
        </div>

        <Button variant="ghost" className="h-10 w-full" asChild>
          <Link href="/login">
            <ArrowLeft className="size-4" strokeWidth={1.9} />
            Back to sign in
          </Link>
        </Button>
      </form>
    </>
  );
}
