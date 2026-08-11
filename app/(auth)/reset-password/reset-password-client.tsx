"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, CircleAlert, Eye, EyeOff, KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resetPasswordAction } from "@/lib/server/auth/actions";

const MIN_PASSWORD_LENGTH = 12;

/**
 * task-4-brief.md §5. On success this does not sign the user in — "reset
 * does not bypass MFA" — and the backend has already invalidated every
 * other active session for this account (password-reset.ts's
 * `consumePasswordReset`), which the success copy below says outright
 * rather than leaving that as a silent side effect.
 */
export function ResetPasswordClient({ token }: { token: string | null }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  if (!token) {
    return <InvalidLink />;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setError(null);
    setPending(true);
    const result = await resetPasswordAction({ token: token as string, password });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <>
        <span className="inline-flex size-9 items-center justify-center rounded-md border border-line bg-surface-2 text-ink-2">
          <ShieldCheck aria-hidden className="size-4.5" strokeWidth={1.75} />
        </span>
        <h1 className="mt-4 text-h1 text-ink">Password updated</h1>
        <p className="mt-1.5 text-body-sm text-ink-2">
          Your password has been changed and you&apos;ve been signed out everywhere else this
          account was signed in. Sign in again with your new password.
        </p>
        <Button className="mt-6 h-10 w-full" asChild>
          <Link href="/login">Back to sign in</Link>
        </Button>
      </>
    );
  }

  return (
    <>
      <h1 className="text-h1 text-ink">Set a new password</h1>
      <p className="mt-1.5 text-body-sm text-ink-2">
        Choose a new password for your account. You&apos;ll still need your authenticator app to
        sign in afterward.
      </p>

      <form onSubmit={onSubmit} noValidate className="mt-7 space-y-4">
        {error && (
          <div role="alert" className="flex gap-2.5 rounded-md border border-danger-line bg-danger-soft px-3 py-2.5">
            <CircleAlert aria-hidden className="mt-px size-4 shrink-0 text-danger" strokeWidth={2} />
            <p className="text-body-sm text-danger">{error}</p>
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="password">New password</Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={Boolean(error)}
              aria-describedby="password-help"
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
          <p id="password-help" className="text-caption text-ink-3">
            At least {MIN_PASSWORD_LENGTH} characters.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="confirm">Confirm new password</Label>
          <Input
            id="confirm"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            aria-invalid={Boolean(error)}
            className="h-10"
          />
        </div>

        <Button type="submit" className="h-10 w-full" disabled={pending}>
          {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
          {pending ? "Updating…" : "Update password"}
        </Button>
      </form>
    </>
  );
}

function InvalidLink() {
  return (
    <>
      <span className="inline-flex size-9 items-center justify-center rounded-md border border-line bg-surface-2 text-ink-2">
        <KeyRound aria-hidden className="size-4.5" strokeWidth={1.75} />
      </span>
      <h1 className="mt-4 text-h1 text-ink">This link isn&apos;t valid</h1>
      <p className="mt-1.5 text-body-sm text-ink-2">
        This reset link is invalid, expired, or has already been used. Request a new one to
        continue.
      </p>
      <Button className="mt-6 h-10 w-full" asChild>
        <Link href="/forgot-password">Request a new link</Link>
      </Button>
      <Button variant="ghost" className="mt-2 h-10 w-full" asChild>
        <Link href="/login">
          <ArrowLeft className="size-4" strokeWidth={1.9} />
          Back to sign in
        </Link>
      </Button>
    </>
  );
}
