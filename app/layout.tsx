import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AuthProvider } from "./lib/auth/AuthContext";
import { ToastProvider } from "./components/Toast";
import ConditionalNavigation from "./components/ConditionalNavigation";
import { ErrorBoundary } from "./components/ErrorBoundary";
import ConnectivityIndicator from "./components/ConnectivityIndicator";
import InstallPrompt from "./components/InstallPrompt";

export const metadata: Metadata = {
  title: "SociusFit - Holistic Fitness Companion",
  description: "AI-powered workout tracking and nutrition monitoring for comprehensive fitness insights",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "SociusFit",
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#2563eb",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/icon-192.png" type="image/png" sizes="192x192" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
      </head>
      <body className="antialiased bg-gray-50 dark:bg-gray-900 min-h-screen text-gray-900 dark:text-gray-100">
        <ErrorBoundary>
          <AuthProvider>
            <ToastProvider>
              <ConnectivityIndicator />
              <ConditionalNavigation>
                {children}
              </ConditionalNavigation>
              <InstallPrompt />
            </ToastProvider>
          </AuthProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
