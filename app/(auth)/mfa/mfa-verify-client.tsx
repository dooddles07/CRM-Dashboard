"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CircleAlert, KeyRound, Loader2, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { verifyMfaAction } from "@/lib/server/auth/actions";

const LENGTH = 6;

/**
 * task-4-brief.md §2, the verification variant of `/mfa` — reached after a
 * correct password when the account already has TOTP enrolled. Same
 * markup as before, wired for real, with three judgment calls the brief
 * asked to be made explicit (task-4-report.md has the full reasoning):
 *
 *  - The countdown "Resend code in Ns" timer is REMOVED. TOTP has no
 *    server-initiated "resend" — the code comes from the user's own
 *    authenticator app on its own 30-second clock, so a resend affordance
 *    would promise something that was never sent, the same category of
 *    problem task-4-brief.md §1.2 flags for the removed SSO button.
 *  - "Trust this device for 30 days" is WIRED — it maps directly onto the
 *    `twoFactor` plugin's own `trustDevice` option
 *    (node_modules/better-auth/dist/plugins/two-factor/index.mjs's
 *    `trustDeviceMaxAge`, default 2,592,000s = exactly 30 days), so unlike
 *    the SSO button this is a real, already-built mechanism the copy
 *    accurately describes.
 *  - "Use a recovery code" is WIRED, toggling the digit grid for a single
 *    text field — plan §3's own decision table lists recovery codes as
 *    part of this screen, not a placeholder.
 */
export function MfaVerifyClient({ keepSignedIn }: { keepSignedIn: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<"totp" | "recovery">("totp");
  const [digits, setDigits] = useState<string[]>(Array(LENGTH).fill(""));
  const [recoveryCode, setRecoveryCode] = useState("");
  const [trustDevice, setTrustDevice] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const inputs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    if (mode === "totp") inputs.current[0]?.focus();
  }, [mode]);

  function setDigit(index: number, value: string) {
    const next = [...digits];
    next[index] = value;
    setDigits(next);
    if (value && index < LENGTH - 1) inputs.current[index + 1]?.focus();
  }

  function onKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !digits[index] && index > 0) inputs.current[index - 1]?.focus();
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

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const code = mode === "totp" ? digits.join("") : recoveryCode.trim();
    if (mode === "totp" && digits.some((d) => !d)) {
      setError("Enter all six digits from your authenticator app.");
      return;
    }
    if (mode === "recovery" && !code) {
      setError("Enter one of your recovery codes.");
      return;
    }
    setError(null);
    setPending(true);
    const result = await verifyMfaAction({ code, isRecoveryCode: mode === "recovery", trustDevice, keepSignedIn });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      setDigits(Array(LENGTH).fill(""));
      return;
    }
    router.push("/");
  }

  return (
    <>
      <span className="inline-flex size-9 items-center justify-center rounded-md border border-line bg-surface-2 text-ink-2">
        <Smartphone aria-hidden className="size-4.5" strokeWidth={1.75} />
      </span>
      <h1 className="mt-4 text-h1 text-ink">Two-factor verification</h1>
      <p className="mt-1.5 text-body-sm text-ink-2">
        {mode === "totp"
          ? "Enter the six-digit code from your authenticator app. It changes every 30 seconds."
          : "Enter one of your single-use recovery codes."}
      </p>

      <form onSubmit={onSubmit} noValidate className="mt-7 space-y-5">
        {error && (
          <div role="alert" className="flex gap-2.5 rounded-md border border-danger-line bg-danger-soft px-3 py-2.5">
            <CircleAlert aria-hidden className="mt-px size-4 shrink-0 text-danger" strokeWidth={2} />
            <p className="text-body-sm text-danger">{error}</p>
          </div>
        )}

        {mode === "totp" ? (
          <fieldset>
            <legend className="mb-2 text-body-sm font-medium text-ink">Verification code</legend>
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
        ) : (
          <div className="space-y-1.5">
            <Label htmlFor="recovery-code">Recovery code</Label>
            <Input
              id="recovery-code"
              value={recoveryCode}
              onChange={(e) => setRecoveryCode(e.target.value)}
              placeholder="XXXXX-XXXXX"
              autoComplete="one-time-code"
              aria-invalid={Boolean(error)}
              className="h-10 font-mono"
            />
          </div>
        )}

        <div className="flex items-center gap-2">
          <Checkbox id="trust" checked={trustDevice} onCheckedChange={(v) => setTrustDevice(v === true)} />
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
            onClick={() => {
              setMode((m) => (m === "totp" ? "recovery" : "totp"));
              setError(null);
            }}
            className="inline-flex items-center gap-1.5 text-primary underline-offset-2 hover:underline cursor-pointer"
          >
            <KeyRound aria-hidden className="size-3.5" strokeWidth={1.9} />
            {mode === "totp" ? "Use a recovery code" : "Use an authenticator code"}
          </button>
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
