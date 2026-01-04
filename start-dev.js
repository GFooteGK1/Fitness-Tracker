// Simple development server startup script
const { spawn } = require('child_process');
const path = require('path');

console.log('🚀 Starting SociusFit Development Server...\n');

// Check if we're in the right directory
console.log('Current directory:', process.cwd());
console.log('Package.json exists:', require('fs').existsSync('package.json'));
console.log('Node modules exists:', require('fs').existsSync('node_modules'));

// Check environment variables
console.log('\n📋 Environment Variables:');
console.log('NEXT_PUBLIC_SUPABASE_URL:', process.env.NEXT_PUBLIC_SUPABASE_URL ? '✅ Set' : '❌ Missing');
console.log('NEXT_PUBLIC_SUPABASE_ANON_KEY:', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? '✅ Set' : '❌ Missing');

// Try to start Next.js
console.log('\n🔄 Starting Next.js development server...');

const nextProcess = spawn('npx', ['next', 'dev'], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env }
});

nextProcess.on('error', (error) => {
  console.error('❌ Failed to start development server:', error.message);
});

nextProcess.on('exit', (code) => {
  console.log(`\n📊 Development server exited with code: ${code}`);
});

// Handle process termination
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down development server...');
  nextProcess.kill('SIGINT');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Shutting down development server...');
  nextProcess.kill('SIGTERM');
  process.exit(0);
});