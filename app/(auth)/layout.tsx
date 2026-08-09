import Link from "next/link";
import { Eye, Lock, ScrollText } from "lucide-react";
import { Logo } from "@/components/shell/logo";
import { HOSPITAL } from "@/lib/data/constants";

const proof = [
  {
    icon: Eye,
    title: "Contact details stay masked",
    body: "Staff reveal a number only when they need it, one field at a time.",
  },
  {
    icon: ScrollText,
    title: "Every reveal is recorded",
    body: "Who looked, at which record, from which device, and when.",
  },
  {
    icon: Lock,
    title: "Access follows the role",
    body: "Reception, nursing, and billing each see a different patient record.",
  },
];

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="grid min-h-svh lg:grid-cols-[minmax(0,1fr)_minmax(0,30rem)] xl:grid-cols-[minmax(0,1fr)_minmax(0,34rem)]">
      {/* Value panel. Shows the product's discretion rather than describing it. */}
      <section className="relative hidden flex-col justify-between bg-rail px-10 py-10 lg:flex xl:px-14">
        <div className="flex items-center gap-2.5">
          <Logo />
          <span className="text-body font-semibold tracking-[-0.012em] text-rail-fg">
            CareFlow
          </span>
        </div>

        <div className="max-w-xl">
          <h2 className="text-balance text-[2rem] font-bold leading-[2.5rem] tracking-[-0.022em] text-rail-fg">
            The patient record your team can act on without seeing more than it
            should.
          </h2>
          <p className="mt-4 max-w-lg text-body-lg leading-relaxed text-rail-fg-muted">
            Appointments, leads, referrals, follow-ups and conversations in one
            place — with contact details held back until someone needs them.
          </p>

          {/* An authored specimen of the real thing, not a stock illustration. */}
          <div className="mt-9 max-w-sm rounded-lg border border-rail-line bg-[color-mix(in_srgb,var(--rail-active)_45%,transparent)] p-3.5">
            <div className="flex items-center gap-2.5">
              <span className="inline-flex size-8 items-center justify-center rounded-full border border-rail-line bg-rail text-caption font-semibold text-rail-fg">
                MS
              </span>
              <span className="min-w-0">
                <span className="block truncate text-body-sm font-medium text-rail-fg">
                  Maria Santos
                </span>
                <span className="block text-[0.6875rem] font-mono tracking-[-0.012em] text-rail-fg-muted">
                  PT-102938
                </span>
              </span>
            </div>
            <dl className="mt-3 space-y-1.5 border-t border-rail-line pt-3">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-caption text-rail-fg-muted">Mobile</dt>
                <dd className="flex items-center gap-1.5 text-body-sm tracking-[0.06em] text-rail-fg-muted">
                  +63 ••• ••• ••90
                  <Eye aria-hidden className="size-3.5 text-rail-fg-muted" strokeWidth={2} />
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-caption text-rail-fg-muted">Next appointment</dt>
                <dd className="text-body-sm text-rail-fg">31 Aug · Cardiology</dd>
              </div>
            </dl>
          </div>

          <ul className="mt-9 space-y-4">
            {proof.map((p) => (
              <li key={p.title} className="flex gap-3">
                <span className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-md border border-rail-line text-rail-fg-muted">
                  <p.icon aria-hidden className="size-3.5" strokeWidth={1.9} />
                </span>
                <span>
                  <span className="block text-body-sm font-medium text-rail-fg">
                    {p.title}
                  </span>
                  <span className="mt-0.5 block text-body-sm text-rail-fg-muted">
                    {p.body}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-caption text-rail-fg-muted">
          {HOSPITAL.name} · {HOSPITAL.beds} beds · {HOSPITAL.city}
        </p>
      </section>

      <section className="flex flex-col justify-center bg-surface px-5 py-10 sm:px-10 lg:border-l lg:border-line">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <Logo />
            <span className="text-body font-semibold tracking-[-0.012em] text-ink">
              CareFlow
            </span>
          </div>
          {children}
        </div>

        <p className="mx-auto mt-10 w-full max-w-sm text-caption text-ink-3">
          Demonstration build with fictional records.{" "}
          <Link href="/design-system" className="text-primary underline-offset-2 hover:underline">
            View the design system
          </Link>
        </p>
      </section>
    </div>
  );
}
