import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AuthProvider } from "./lib/auth/AuthContext";
import { ToastProvider } from "./components/Toast";
import ConditionalNavigation from "./components/ConditionalNavigation";
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
              <ConditionalNavigation>
                {children}
              </ConditionalNavigation>
            </ToastProvider>
          </AuthProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
