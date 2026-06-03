import { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Privacy Policy - SociusFit',
  description: 'Privacy policy for SociusFit fitness tracking application'
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto bg-white rounded-lg shadow-sm p-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Privacy Policy</h1>

        <div className="prose prose-blue max-w-none">
          <p className="text-sm text-gray-500 mb-6">
            Last updated: January 25, 2026
          </p>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Introduction</h2>
            <p className="text-gray-700 mb-4">
              SociusFit (&quot;we&quot;, &quot;our&quot;, or &quot;us&quot;) is committed to protecting your privacy. This Privacy Policy explains how we collect, use, and safeguard your personal information when you use our fitness tracking application.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Information We Collect</h2>

            <h3 className="text-lg font-medium text-gray-900 mb-3">Account Information</h3>
            <ul className="list-disc pl-6 text-gray-700 mb-4 space-y-2">
              <li>Email address and password (encrypted)</li>
              <li>Profile information (name, fitness goals, body metrics)</li>
            </ul>

            <h3 className="text-lg font-medium text-gray-900 mb-3">Fitness Data</h3>
            <ul className="list-disc pl-6 text-gray-700 mb-4 space-y-2">
              <li>Workout logs and exercise data</li>
              <li>Nutrition tracking and meal photos</li>
              <li>Progress metrics and personal records</li>
            </ul>

            <h3 className="text-lg font-medium text-gray-900 mb-3">WHOOP Integration Data</h3>
            <p className="text-gray-700 mb-2">
              When you connect your WHOOP account, we collect:
            </p>
            <ul className="list-disc pl-6 text-gray-700 mb-4 space-y-2">
              <li>Recovery scores and heart rate variability (HRV)</li>
              <li>Sleep performance and efficiency metrics</li>
              <li>Strain scores and workout data</li>
              <li>Physiological metrics (resting heart rate, respiratory rate, SpO2, skin temperature)</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">How We Use Your Information</h2>
            <ul className="list-disc pl-6 text-gray-700 space-y-2">
              <li>Provide and improve our fitness tracking services</li>
              <li>Generate AI-powered insights and recommendations</li>
              <li>Analyze correlations between workouts, nutrition, and recovery</li>
              <li>Display your fitness progress and trends</li>
              <li>Sync data from connected services (WHOOP)</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Data Security</h2>
            <p className="text-gray-700 mb-4">
              We implement industry-standard security measures to protect your data:
            </p>
            <ul className="list-disc pl-6 text-gray-700 space-y-2">
              <li>All data is encrypted in transit using HTTPS/TLS</li>
              <li>Passwords are hashed using bcrypt</li>
              <li>WHOOP OAuth tokens are encrypted using AES-256-GCM</li>
              <li>Row-level security (RLS) ensures users can only access their own data</li>
              <li>Regular security audits and updates</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Third-Party Services</h2>

            <h3 className="text-lg font-medium text-gray-900 mb-3">WHOOP</h3>
            <p className="text-gray-700 mb-4">
              When you connect your WHOOP account, we access your WHOOP data through their official API. Your WHOOP credentials are never stored by SociusFit. We only store encrypted OAuth tokens that allow us to fetch your data. You can disconnect your WHOOP account at any time from the settings page.
            </p>

            <h3 className="text-lg font-medium text-gray-900 mb-3">Anthropic (Claude AI)</h3>
            <p className="text-gray-700 mb-4">
              We use Anthropic&apos;s Claude AI to parse workout descriptions, analyze meal photos, and generate fitness insights. Your data is sent to Anthropic&apos;s API for processing but is not used to train their models.
            </p>

            <h3 className="text-lg font-medium text-gray-900 mb-3">Supabase</h3>
            <p className="text-gray-700 mb-4">
              We use Supabase for database hosting and authentication. Supabase is SOC 2 Type II certified and complies with GDPR.
            </p>

            <h3 className="text-lg font-medium text-gray-900 mb-3">Vercel</h3>
            <p className="text-gray-700 mb-4">
              Our application is hosted on Vercel&apos;s serverless platform. Vercel is SOC 2 compliant and follows industry best practices for security.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Data Retention</h2>
            <p className="text-gray-700 mb-4">
              We retain your data for as long as your account is active. When you disconnect a third-party service (like WHOOP), we retain the historical data for insights but stop syncing new data. If you delete your account, all your data is permanently deleted within 30 days.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Your Rights</h2>
            <p className="text-gray-700 mb-4">You have the right to:</p>
            <ul className="list-disc pl-6 text-gray-700 space-y-2">
              <li>Access your personal data</li>
              <li>Correct inaccurate data</li>
              <li>Delete your account and data</li>
              <li>Export your data</li>
              <li>Disconnect third-party integrations</li>
              <li>Opt out of AI-powered insights</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Data Sharing</h2>
            <p className="text-gray-700 mb-4">
              We do not sell, rent, or share your personal data with third parties for marketing purposes. Your data is only shared with the third-party services mentioned above (Anthropic, Supabase, Vercel, WHOOP) to provide our services.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Children&apos;s Privacy</h2>
            <p className="text-gray-700 mb-4">
              SociusFit is not intended for users under 18 years of age. We do not knowingly collect personal information from children.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Changes to This Policy</h2>
            <p className="text-gray-700 mb-4">
              We may update this Privacy Policy from time to time. We will notify you of any changes by updating the &quot;Last updated&quot; date at the top of this policy.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Contact Us</h2>
            <p className="text-gray-700 mb-4">
              If you have any questions about this Privacy Policy or our data practices, please contact us through the app&apos;s support page.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">WHOOP-Specific Terms</h2>
            <p className="text-gray-700 mb-4">
              By connecting your WHOOP account to SociusFit:
            </p>
            <ul className="list-disc pl-6 text-gray-700 space-y-2">
              <li>You authorize SociusFit to access your WHOOP data through WHOOP&apos;s official API</li>
              <li>You understand that SociusFit is not affiliated with or endorsed by WHOOP</li>
              <li>You can revoke access at any time by disconnecting your WHOOP account in settings</li>
              <li>Historical WHOOP data will be retained for insights even after disconnection</li>
              <li>WHOOP&apos;s own privacy policy and terms of service continue to apply to your WHOOP account</li>
            </ul>
          </section>
        </div>

        <div className="mt-8 pt-8 border-t border-gray-200">
          <Link
            href="/"
            className="text-blue-600 hover:text-blue-700 font-medium"
          >
            ← Back to SociusFit
          </Link>
        </div>
      </div>
    </div>
  );
}
