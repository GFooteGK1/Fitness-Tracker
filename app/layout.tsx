import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { ToastProvider } from "./components/Toast";
import { AuthProvider } from "./lib/auth/AuthContext";
import UserMenu from "./components/UserMenu";
import ErrorBoundary from "./components/ErrorBoundary";
import "./globals.css";

export const metadata: Metadata = {
  title: "SociusFit - Holistic Fitness Companion",
  description: "AI-powered workout tracking and nutrition monitoring for comprehensive fitness insights",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "SociusFit",
  },
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
              {/* Mobile-optimized navigation */}
              <nav className="bg-white dark:bg-gray-950 border-b border-gray-200 dark:border-gray-800 sticky top-0 z-50 shadow-sm">
                <div className="px-4 py-3">
                  <div className="flex items-center justify-between">
                    <Link href="/" className="flex items-center gap-2">
                      <span className="text-2xl">🏋️</span>
                      <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">SociusFit</h1>
                    </Link>
                    <UserMenu />
                  </div>
                </div>
                {/* Mobile bottom nav */}
                <div className="flex border-t border-gray-200 dark:border-gray-800">
                  <Link 
                    href="/dashboard" 
                    className="flex-1 flex flex-col items-center py-3 text-xs font-medium text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-50 dark:hover:bg-gray-800 active:bg-gray-100 dark:active:bg-gray-700 transition-colors"
                  >
                    <span className="text-xl mb-1">📊</span>
                    <span>Dashboard</span>
                  </Link>
                  <Link 
                    href="/" 
                    className="flex-1 flex flex-col items-center py-3 text-xs font-medium text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-50 dark:hover:bg-gray-800 active:bg-gray-100 dark:active:bg-gray-700 transition-colors"
                  >
                    <span className="text-xl mb-1">💪</span>
                    <span>Program</span>
                  </Link>
                  <Link 
                    href="/food-progress" 
                    className="flex-1 flex flex-col items-center py-3 text-xs font-medium text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-50 dark:hover:bg-gray-800 active:bg-gray-100 dark:active:bg-gray-700 transition-colors"
                  >
                    <span className="text-xl mb-1">🍽️</span>
                    <span>Nutrition</span>
                  </Link>
                  <Link 
                    href="/log" 
                    className="flex-1 flex flex-col items-center py-3 text-xs font-medium text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-50 dark:hover:bg-gray-800 active:bg-gray-100 dark:active:bg-gray-700 transition-colors"
                  >
                    <span className="text-xl mb-1">📝</span>
                    <span>Log</span>
                  </Link>
                  <Link 
                    href="/query" 
                    className="flex-1 flex flex-col items-center py-3 text-xs font-medium text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-50 dark:hover:bg-gray-800 active:bg-gray-100 dark:active:bg-gray-700 transition-colors"
                  >
                    <span className="text-xl mb-1">🔍</span>
                    <span>Query</span>
                  </Link>
                </div>
              </nav>
              <main className="pb-32 sm:pb-6 pt-3 sm:pt-4 px-3 sm:px-4 max-w-2xl mx-auto">
                {children}
              </main>
            </ToastProvider>
          </AuthProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
