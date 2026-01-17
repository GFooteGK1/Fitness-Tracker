import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AuthProvider } from "./lib/auth/AuthContext";
import { ToastProvider } from "./components/Toast";
import Navigation from "./components/Navigation";
import { ErrorBoundary } from "./components/ErrorBoundary";

export const metadata: Metadata = {
  title: "SociusFit - Holistic Fitness Companion",
  description: "AI-powered workout tracking and nutrition monitoring for comprehensive fitness insights",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased bg-gray-50 dark:bg-gray-900 min-h-screen text-gray-900 dark:text-gray-100">
        <ErrorBoundary>
          <AuthProvider>
            <ToastProvider>
              <div className="min-h-screen flex flex-col">
                <Navigation />
                <main className="flex-1 p-4 pb-20 md:pb-4">
                  <div className="max-w-4xl mx-auto">
                    {children}
                  </div>
                </main>
              </div>
            </ToastProvider>
          </AuthProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
