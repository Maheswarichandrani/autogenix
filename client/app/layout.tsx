import type { Metadata } from "next";
import { Urbanist, JetBrains_Mono } from "next/font/google";
import { SessionProvider } from "@/providers/session-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "next-themes";
import "./globals.css";
import { ProjectDialogProvider } from "@/providers/project-dialog-provider";
import TanstackClientProvider from "@/providers/query-client-provider";

const urbanist = Urbanist({
  variable: "--font-urbanist",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Autogenix",
  description: "Your AI-powered shipbuilding assistant",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${urbanist.variable} ${jetbrainsMono.variable} antialiased`}
      >
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
          <SessionProvider>
            <TooltipProvider>
              <TanstackClientProvider>
              <ProjectDialogProvider>
                {children}
              </ProjectDialogProvider>
            </TanstackClientProvider>
            </TooltipProvider>
          </SessionProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}