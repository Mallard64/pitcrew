import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Pit Crew: demo videos from a live link",
  description: "Paste your project's link and get a narrated demo video and a Build Log draft in minutes.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <header className="border-b border-slate-200 bg-white/80 backdrop-blur">
          <nav className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
            <Link href="/" className="flex items-center gap-2 text-lg font-bold tracking-tight">
              <span className="grid h-7 w-7 place-items-center rounded-md bg-slate-900 text-sm text-white">PC</span>
              Pit Crew
            </Link>
            <div className="flex items-center gap-4 text-sm font-medium text-slate-600">
              <Link href="/stats" className="hover:text-slate-900">Stats</Link>
              <Link href="/#make" className="rounded-md bg-slate-900 px-3 py-1.5 text-white hover:bg-slate-700">Make a video</Link>
            </div>
          </nav>
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:py-12">{children}</main>
        <footer className="border-t border-slate-200 py-6 text-center text-sm text-slate-500">
          Built on <a className="underline hover:text-slate-800" href="https://harnessrouter.ai" target="_blank" rel="noreferrer">HarnessRouter</a> for The Big Hack Game.
        </footer>
      </body>
    </html>
  );
}
