import type { Metadata } from "next";
import MotionProvider from "@/components/ui/motion-provider";
import "./globals.css";
import "./home-board.css";
import "./fitted-pages.css";
import "./delight.css";

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
    <html lang="en">
      <body>
        <MotionProvider>{children}</MotionProvider>
      </body>
    </html>
  );
}
