import type { Metadata } from "next";
import { Google_Sans } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PRODUCT_NAME } from "@/lib/product";
import "./globals.css";

const googleSans = Google_Sans({
  variable: "--font-google-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

// A constant title on every view: one screen behind no search engine, so the tab says which app
export const metadata: Metadata = {
  title: PRODUCT_NAME,
  description: "A coding copilot running on Ollama Cloud.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${googleSans.variable} h-full antialiased`}>
      <body className="h-full">
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  );
}
