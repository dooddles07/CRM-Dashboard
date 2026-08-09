"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CircleAlert, Eye, EyeOff, KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("i.domingo@staurora.example");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) {
      setError("Enter the email address your hospital account uses.");
      return;
    }
    if (!password) {
      setError("Enter your password to continue.");
      return;
    }
    setError(null);
    setPending(true);
    setTimeout(() => router.push("/mfa"), 600);
  }

  return (
    <>
      <h1 className="text-h1 text-ink">Sign in</h1>
      <p className="mt-1.5 text-body-sm text-ink-2">
        Use your St. Aurora staff account. Sessions expire after 30 minutes of
        inactivity.
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
            aria-invalid={Boolean(error && !email.trim())}
            className="h-10"
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-3">
            <Label htmlFor="password">Password</Label>
            <Link
              href="/forgot-password"
              className="text-body-sm text-primary underline-offset-2 hover:underline"
            >
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={Boolean(error && !password)}
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

        <div className="flex items-center gap-2 pt-0.5">
          <Checkbox id="remember" defaultChecked />
          <Label htmlFor="remember" className="font-normal text-ink-2">
            Keep me signed in on this device
          </Label>
        </div>

        <Button type="submit" className="h-10 w-full" disabled={pending}>
          {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
          {pending ? "Signing in…" : "Sign in"}
        </Button>

        <div className="flex items-center gap-3 py-1">
          <span className="h-px flex-1 bg-line" />
          <span className="text-caption text-ink-3">or</span>
          <span className="h-px flex-1 bg-line" />
        </div>

        <Button type="button" variant="outline" className="h-10 w-full" asChild>
          <Link href="/mfa">
            <KeyRound className="size-4" strokeWidth={1.9} />
            Continue with hospital SSO
          </Link>
        </Button>
      </form>

      <p className="mt-6 flex gap-2 rounded-md border border-line bg-surface-2 px-3 py-2.5 text-caption text-ink-3">
        <ShieldCheck aria-hidden className="mt-px size-3.5 shrink-0" strokeWidth={1.9} />
        <span>
          Access to patient records is monitored. Sign-ins, record views and
          revealed contact details are written to the audit log.
        </span>
      </p>
    </>
  );
}
