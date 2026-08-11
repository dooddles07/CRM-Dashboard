"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, CircleAlert, Loader2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestPasswordResetAction } from "@/lib/server/auth/actions";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.includes("@")) {
      setError("Enter a full email address, including the part after the @.");
      return;
    }
    setError(null);
    setPending(true);
    // The action's response can't distinguish "sent" from "no such
    // account" (task-4-brief.md §4) — this branch only ever runs for a
    // request-shape error (an empty/malformed email slipping past the
    // check above), never for "account not found".
    const result = await requestPasswordResetAction({ email });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <>
        <span className="inline-flex size-9 items-center justify-center rounded-md border border-line bg-surface-2 text-ink-2">
          <Mail aria-hidden className="size-4.5" strokeWidth={1.75} />
        </span>
        <h1 className="mt-4 text-h1 text-ink">Check your inbox</h1>
        <p className="mt-1.5 text-body-sm text-ink-2">
          If <span className="font-medium text-ink">{email}</span> belongs to a
          staff account, a reset link is on its way. The link works once and
          expires in 1 hour.
        </p>
        <p className="mt-4 text-body-sm text-ink-3">
          Nothing arrived? Check spam, then ask your hospital administrator to
          confirm the address on your account.
        </p>
        <Button variant="outline" className="mt-6 h-10 w-full" asChild>
          <Link href="/login">
            <ArrowLeft className="size-4" strokeWidth={1.9} />
            Back to sign in
          </Link>
        </Button>
      </>
    );
  }

  return (
    <>
      <h1 className="text-h1 text-ink">Reset your password</h1>
      <p className="mt-1.5 text-body-sm text-ink-2">
        Enter your work email and we will send a single-use reset link.
      </p>

      <form onSubmit={onSubmit} noValidate className="mt-7 space-y-4">
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

        <div className="space-y-1.5">
          <Label htmlFor="email">Work email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={Boolean(error)}
            aria-describedby="email-help"
            className="h-10"
          />
          <p id="email-help" className="text-caption text-ink-3">
            The address your hospital account was created with.
          </p>
        </div>

        <Button type="submit" className="h-10 w-full" disabled={pending}>
          {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
          {pending ? "Sending…" : "Send reset link"}
        </Button>

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
