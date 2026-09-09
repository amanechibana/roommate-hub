import type { Metadata } from "next";
import { Atkinson_Hyperlegible_Next, Fraunces } from "next/font/google";
import MotionProvider from "@/components/ui/motion-provider";
import "./globals.css";
import "./home-board.css";
import "./fitted-pages.css";
import "./delight.css";
import "./everyday.css";

// The house reads this from across a kitchen as often as from a phone, so
// the body face is the one built for legibility at a distance; the display
// face is a soft, slightly wonky serif that suits paper on a fridge.
const body = Atkinson_Hyperlegible_Next({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});
const displayFace = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  axes: ["SOFT", "WONK", "opsz"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Common Ground · A little more together",
  description:
    "A shared home for your household’s plans, chores, and little necessities.",
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${body.variable} ${displayFace.variable}`}>
      <body>
        <MotionProvider>{children}</MotionProvider>
      </body>
    </html>
  );
}
