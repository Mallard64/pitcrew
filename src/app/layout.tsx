import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Pit Crew: your hackathon pitch video from a live link",
  description:
    "Paste your project's link. Pit Crew writes the pitch, records a live demo, checks every statistic and hands you a narrated pitch video, submission text and a progress update draft.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="page-glow flex min-h-full flex-col overflow-x-clip font-sans">
        <header className="sticky top-0 z-10 border-b border-white/5 bg-[#06080f]/70 backdrop-blur">
          <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
            <Link
              href="/"
              className="flex items-center gap-2 text-lg font-bold tracking-tight text-white"
            >
              <span className="grid h-7 w-7 place-items-center rounded-md bg-gradient-to-br from-indigo-400 to-fuchsia-500 text-xs font-black text-white">
                PC
              </span>
              Pit Crew
            </Link>
            <div className="flex items-center gap-5 text-sm font-medium text-slate-400">
              <Link href="/#samples" className="hidden hover:text-white sm:block">
                Samples
              </Link>
              <Link href="/#how" className="hidden hover:text-white sm:block">
                How it works
              </Link>
              <Link href="/stats" className="hidden hover:text-white sm:block">
                Stats
              </Link>
              <Link
                href="/#make"
                className="rounded-md bg-indigo-500 px-3 py-1.5 text-white hover:bg-indigo-400"
              >
                Make my pitch
              </Link>
            </div>
          </nav>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:py-14">{children}</main>
        <footer className="border-t border-white/5 py-8 text-center text-sm text-slate-500">
          Built on{" "}
          <a
            className="text-slate-300 underline-offset-2 hover:underline"
            href="https://harnessrouter.ai"
            target="_blank"
            rel="noreferrer"
          >
            HarnessRouter
          </a>{" "}
          for The Big Hack Game · Videos rendered with Remotion · We only visit public pages.
        </footer>
      </body>
    </html>
  );
}
