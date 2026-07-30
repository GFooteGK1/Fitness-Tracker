export default function Home() {
  return (
    <div className="space-y-6">
      {/* Hero Section */}
      <div className="bg-gradient-to-br from-blue-600 to-purple-700 rounded-xl p-8 text-white">
        <h1 className="text-3xl font-bold mb-2">Welcome to SociusFit</h1>
        <p className="text-blue-100 text-lg mb-6">
          Your AI-powered fitness companion for comprehensive workout and nutrition tracking
        </p>
        <div className="flex flex-col sm:flex-row gap-4">
          <a 
            href="/auth/signup" 
            className="bg-white text-blue-600 px-6 py-3 rounded-lg font-semibold hover:bg-blue-50 transition-colors text-center"
          >
            Get Started
          </a>
          <a 
            href="/auth/signin" 
            className="border border-white text-white px-6 py-3 rounded-lg font-semibold hover:bg-white/10 transition-colors text-center"
          >
            Sign In
          </a>
        </div>
      </div>

      {/* Features Grid */}
      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="text-2xl mb-3">🏋️</div>
          <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            Smart Workout Tracking
          </h3>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            Log workouts with AI-powered parsing. Support for photo OCR, voice input, and manual entry.
          </p>
          <a href="/log" className="text-blue-600 dark:text-blue-400 hover:underline font-medium">
            Start Logging →
          </a>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="text-2xl mb-3">🍽️</div>
          <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            Nutrition Tracking
          </h3>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            Track meals with photo analysis and AI-powered nutrition insights for optimal performance.
          </p>
          <a href="/food-progress" className="text-blue-600 dark:text-blue-400 hover:underline font-medium">
            Track Nutrition →
          </a>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="text-2xl mb-3">📊</div>
          <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            Performance Analytics
          </h3>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            Comprehensive dashboard with workout stats, nutrition adherence, and progress tracking.
          </p>
          <a href="/dashboard" className="text-blue-600 dark:text-blue-400 hover:underline font-medium">
            View Dashboard →
          </a>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="text-2xl mb-3">🔍</div>
          <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            AI Coach
          </h3>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            Ask questions, discuss your program, and get feedback grounded in your training data.
          </p>
          <a href="/coach" className="text-blue-600 dark:text-blue-400 hover:underline font-medium">
            Talk to Coach →
          </a>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-6">
        <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4">
          Why Choose SociusFit?
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
          <div>
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">3x</div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Faster Parsing</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">AI</div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Powered Analysis</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">📱</div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Mobile First</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">🔄</div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Real-time Sync</div>
          </div>
        </div>
      </div>
    </div>
  );
}
