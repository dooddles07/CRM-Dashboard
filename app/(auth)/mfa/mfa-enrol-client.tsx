"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, Eye, EyeOff, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TotpEnrolment } from "@/components/auth/totp-enrolment";
import { startEnrolmentAction, verifyEnrolmentAction, type EnrolmentStart } from "@/lib/server/auth/actions";

/**
 * task-4-brief.md §6's abandoned-enrolment case, resumed here: a sign-in
 * succeeded (real session, `twoFactorEnabled: false`) but the account
 * never finished TOTP setup after accepting its invitation. Asks for the
 * password again — `startEnrolmentAction`'s comment explains why
 * `auth.api.enableTwoFactor` needs one and this request doesn't already
 * have it — then hands off to the same `<TotpEnrolment>` wizard
 * `/accept-invite` uses.
 */
export function MfaEnrolClient({ keepSignedIn }: { keepSignedIn: boolean }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [enrolment, setEnrolment] = useState<EnrolmentStart | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!password) {
      setError("Enter your password to continue.");
      return;
    }
    setError(null);
    setPending(true);
    const result = await startEnrolmentAction({ password });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setEnrolment(result.enrolment);
  }

  if (enrolment) {
    return (
      <TotpEnrolment
        enrolment={enrolment}
        onVerify={(code) => verifyEnrolmentAction({ code, keepSignedIn })}
        onDone={() => router.push("/")}
      />
    );
  }

  return (
    <>
      <span className="inline-flex size-9 items-center justify-center rounded-md border border-line bg-surface-2 text-ink-2">
        <ShieldCheck aria-hidden className="size-4.5" strokeWidth={1.75} />
      </span>
      <h1 className="mt-4 text-h1 text-ink">Finish setting up your account</h1>
      <p className="mt-1.5 text-body-sm text-ink-2">
        Two-factor authentication is required for every CareFlow account and wasn&apos;t finished
        the last time you signed in. Confirm your password to continue setup.
      </p>

      <form onSubmit={onSubmit} noValidate className="mt-7 space-y-4">
        {error && (
          <div role="alert" className="flex gap-2.5 rounded-md border border-danger-line bg-danger-soft px-3 py-2.5">
            <CircleAlert aria-hidden className="mt-px size-4 shrink-0 text-danger" strokeWidth={2} />
            <p className="text-body-sm text-danger">{error}</p>
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={Boolean(error)}
              className="h-10 pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-1 top-1 inline-flex size-8 items-center justify-center rounded-sm text-ink-3 transition-colors duration-150 hover:text-ink cursor-pointer"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? (
                <EyeOff aria-hidden className="size-4" strokeWidth={1.9} />
              ) : (
                <Eye aria-hidden className="size-4" strokeWidth={1.9} />
              )}
            </button>
          </div>
        </div>

        <Button type="submit" className="h-10 w-full" disabled={pending}>
          {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
          {pending ? "Confirming…" : "Continue"}
        </Button>
      </form>
    </>
  );
}
