// Diagnostic script to check development environment
const fs = require('fs');
const path = require('path');

console.log('🔍 SociusFit Development Environment Diagnostics\n');

// Check basic files
const checks = [
  { file: 'package.json', required: true },
  { file: 'next.config.ts', required: true },
  { file: '.env.local', required: true },
  { file: 'node_modules', required: true, isDir: true },
  { file: 'app', required: true, isDir: true },
  { file: 'app/layout.tsx', required: true },
  { file: 'app/page.tsx', required: true },
  { file: 'tsconfig.json', required: true }
];

console.log('📁 File System Checks:');
checks.forEach(check => {
  const exists = fs.existsSync(check.file);
  const status = exists ? '✅' : '❌';
  const type = check.isDir ? '(directory)' : '(file)';
  console.log(`   ${status} ${check.file} ${type}`);
  
  if (!exists && check.required) {
    console.log(`      ⚠️  Required ${check.isDir ? 'directory' : 'file'} missing!`);
  }
});

// Check package.json
console.log('\n📦 Package.json Check:');
try {
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  console.log(`   ✅ Name: ${pkg.name}`);
  console.log(`   ✅ Version: ${pkg.version}`);
  console.log(`   ✅ Scripts: ${Object.keys(pkg.scripts || {}).join(', ')}`);
  
  // Check if dev script exists
  if (pkg.scripts && pkg.scripts.dev) {
    console.log(`   ✅ Dev script: ${pkg.scripts.dev}`);
  } else {
    console.log('   ❌ Dev script missing!');
  }
} catch (error) {
  console.log(`   ❌ Error reading package.json: ${error.message}`);
}

// Check environment variables
console.log('\n🌍 Environment Variables:');
const envVars = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'ANTHROPIC_API_KEY',
  'NODE_ENV'
];

envVars.forEach(varName => {
  const value = process.env[varName];
  const status = value ? '✅' : '❌';
  const preview = value ? (value.length > 20 ? value.substring(0, 20) + '...' : value) : 'Not set';
  console.log(`   ${status} ${varName}: ${preview}`);
});

// Check .env.local file
console.log('\n📄 .env.local File Check:');
try {
  const envContent = fs.readFileSync('.env.local', 'utf8');
  const lines = envContent.split('\n').filter(line => line.trim() && !line.startsWith('#'));
  console.log(`   ✅ File exists with ${lines.length} environment variables`);
  
  lines.forEach(line => {
    const [key] = line.split('=');
    if (key) {
      console.log(`   📝 ${key.trim()}`);
    }
  });
} catch (error) {
  console.log(`   ❌ Error reading .env.local: ${error.message}`);
}

// Check Next.js config
console.log('\n⚙️  Next.js Config Check:');
try {
  const configExists = fs.existsSync('next.config.ts') || fs.existsSync('next.config.js');
  if (configExists) {
    console.log('   ✅ Next.js config file found');
  } else {
    console.log('   ❌ Next.js config file missing');
  }
} catch (error) {
  console.log(`   ❌ Error checking Next.js config: ${error.message}`);
}

// Check TypeScript config
console.log('\n📘 TypeScript Config Check:');
try {
  const tsConfig = JSON.parse(fs.readFileSync('tsconfig.json', 'utf8'));
  console.log('   ✅ tsconfig.json is valid JSON');
  console.log(`   📝 Compiler options: ${Object.keys(tsConfig.compilerOptions || {}).length} options`);
} catch (error) {
  console.log(`   ❌ Error reading tsconfig.json: ${error.message}`);
}

console.log('\n🎯 Recommendations:');
console.log('1. Try running: npm install (to ensure all dependencies are installed)');
console.log('2. Try running: npm run dev (to start the development server)');
console.log('3. If issues persist, try: rm -rf node_modules && npm install');
console.log('4. Check that no other process is using port 3000');

console.log('\n✨ Diagnostic complete!');