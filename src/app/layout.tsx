import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Price Tracker",
  description: "Personal price monitoring across shops",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <header className="border-b border-black/10 dark:border-white/10">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
            <Link href="/" className="font-semibold tracking-tight">
              Price Tracker
            </Link>
            <nav className="flex items-center gap-2 text-sm">
              <Link href="/" className="rounded-md px-3 py-1.5 hover:bg-black/5 dark:hover:bg-white/10">
                Products
              </Link>
              <span
                title="Coming in a later build step"
                className="cursor-not-allowed rounded-md bg-foreground/80 px-3 py-1.5 text-background opacity-50"
              >
                + Add link
              </span>
            </nav>
          </div>
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
