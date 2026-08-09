import type { Metadata } from "next";
import { Inter, Geist_Mono } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "CareFlow CRM",
    template: "%s · CareFlow CRM",
  },
  description:
    "Hospital patient relationship and engagement platform. Demonstration build with fictional data.",
};

const DIRECTION_CONTRACT = `<!--
CareFlow CRM - direction contract [seed: careflow-operate-01]

THESIS: A CRM that earns trust by showing its own discretion. Refuses the category
default of a dense admin grid that dumps every patient's phone number and address
into plain sight for anyone with a login.

OWN-WORLD: Deep navy command rail against a cool near-white canvas. White cards,
hairline borders, 6px radii, shadows barely there. One workhorse sans, mono reserved
for identifiers. Color appears only as status, series, or action.

STORY: Staff arrive mid-task, find the record in one or two actions, see what changed
and what is owed, and act. They understand the system watches what they reveal.

FIRST VIEWPORT: Navy rail left. Greeting and date scope top. Eight-up KPI strip with
inline trends. Two-thirds patient growth chart beside one-third AI insights. Today's
Operations anchors the fold. Create sits in the top bar, always.

FORM: Operate mode. Brief-pinned world, no concept roll.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish
review, the verdict, and DESIGN.md
-->`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} ${geistMono.variable} antialiased`}>
        <div hidden dangerouslySetInnerHTML={{ __html: DIRECTION_CONTRACT }} />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
