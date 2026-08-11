"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CircleAlert, Eye, EyeOff, KeyRound, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TotpEnrolment } from "@/components/auth/totp-enrolment";
import { acceptInviteAction, verifyEnrolmentAction, type EnrolmentStart } from "@/lib/server/auth/actions";

const MIN_PASSWORD_LENGTH = 12;

/**
 * task-4-brief.md §6. "Password plus TOTP enrolment, one submit" per plan
 * §8's description of this screen: the first form submit does both steps
 * of `acceptInvitation` a caller normally has to think about separately —
 * setting the password and starting TOTP enrolment — in one Server Action
 * call (`acceptInviteAction`), because at that moment this is the only
 * place in the app that has the just-chosen password in scope to hand to
 * `auth.api.enableTwoFactor`. What follows (scan the QR, enter a code) is
 * necessarily a second round trip — no way to avoid that and still let the
 * user's own authenticator app generate the confirming code — so "one
 * submit" describes the credential-setting step, not the whole flow.
 */
export function AcceptInviteClient({ token }: { token: string | null }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [enrolment, setEnrolment] = useState<EnrolmentStart | null>(null);

  if (!token) {
    return <InvalidLink />;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Enter your full name.");
      return;
    }
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
    const result = await acceptInviteAction({ token: token as string, name, password });
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
        onVerify={(code) => verifyEnrolmentAction({ code, keepSignedIn: false })}
        onDone={() => router.push("/")}
      />
    );
  }

  return (
    <>
      <h1 className="text-h1 text-ink">Set up your account</h1>
      <p className="mt-1.5 text-body-sm text-ink-2">
        You&apos;ve been invited to CareFlow · St. Aurora. Set your name and password to continue
        — you&apos;ll set up two-factor authentication next.
      </p>

      <form onSubmit={onSubmit} noValidate className="mt-7 space-y-4">
        {error && (
          <div role="alert" className="flex gap-2.5 rounded-md border border-danger-line bg-danger-soft px-3 py-2.5">
            <CircleAlert aria-hidden className="mt-px size-4 shrink-0 text-danger" strokeWidth={2} />
            <p className="text-body-sm text-danger">{error}</p>
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="name">Full name</Label>
          <Input
            id="name"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={Boolean(error && !name.trim())}
            className="h-10"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
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
          <Label htmlFor="confirm">Confirm password</Label>
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
          {pending ? "Setting up…" : "Continue"}
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
      <h1 className="mt-4 text-h1 text-ink">This invitation isn&apos;t valid</h1>
      <p className="mt-1.5 text-body-sm text-ink-2">
        This invitation link is invalid, expired, or has already been used. Ask your hospital
        administrator to send a new one.
      </p>
      <Button variant="ghost" className="mt-6 h-10 w-full" asChild>
        <Link href="/login">
          <ArrowLeft className="size-4" strokeWidth={1.9} />
          Back to sign in
        </Link>
      </Button>
    </>
  );
}
