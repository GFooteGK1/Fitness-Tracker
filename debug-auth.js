// Debug authentication and environment setup
const BASE_URL = 'http://localhost:3000';

async function debugAuth() {
  console.log('🔍 Debugging SociusFit Authentication Issues\n');

  try {
    // 1. Check health endpoint
    console.log('1. Checking health endpoint...');
    const healthResponse = await fetch(`${BASE_URL}/api/health`);
    
    if (healthResponse.ok) {
      const healthData = await healthResponse.json();
      console.log('✅ Health check passed');
      console.log('   Database:', healthData.services?.database || 'unknown');
      console.log('   Auth config:', healthData.services?.auth || 'unknown');
      console.log('   Environment:', healthData.environment || 'unknown');
    } else {
      console.log('❌ Health check failed:', healthResponse.status);
      const errorText = await healthResponse.text();
      console.log('   Error:', errorText.substring(0, 200));
    }

    // 2. Test static assets
    console.log('\n2. Checking static assets...');
    const iconResponse = await fetch(`${BASE_URL}/icon-192.png`);
    console.log(`   Icon 192: ${iconResponse.status} ${iconResponse.statusText}`);
    
    const manifestResponse = await fetch(`${BASE_URL}/manifest.json`);
    console.log(`   Manifest: ${manifestResponse.status} ${manifestResponse.statusText}`);

    // 3. Test authentication endpoints
    console.log('\n3. Testing authentication endpoints...');
    
    // Test sign in with invalid credentials (should return 400/401, not 500)
    const signinResponse = await fetch(`${BASE_URL}/api/auth/signin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'test@example.com', password: 'wrongpassword' })
    });
    
    console.log(`   Sign in test: ${signinResponse.status} ${signinResponse.statusText}`);
    
    if (signinResponse.status === 500) {
      const errorData = await signinResponse.json().catch(() => signinResponse.text());
      console.log('   ❌ Server error in auth:', typeof errorData === 'string' ? errorData.substring(0, 200) : JSON.stringify(errorData, null, 2));
    }

    // 4. Test profile endpoint (should return 401 for unauthenticated)
    console.log('\n4. Testing profile endpoint...');
    const profileResponse = await fetch(`${BASE_URL}/api/profile`);
    console.log(`   Profile: ${profileResponse.status} ${profileResponse.statusText}`);
    
    if (profileResponse.status === 500) {
      const errorData = await profileResponse.json().catch(() => profileResponse.text());
      console.log('   ❌ Server error in profile:', typeof errorData === 'string' ? errorData.substring(0, 200) : JSON.stringify(errorData, null, 2));
    }

    // 5. Test dashboard stats (should return 401 for unauthenticated)
    console.log('\n5. Testing dashboard stats...');
    const statsResponse = await fetch(`${BASE_URL}/api/dashboard-stats`);
    console.log(`   Dashboard stats: ${statsResponse.status} ${statsResponse.statusText}`);
    
    if (statsResponse.status === 500) {
      const errorData = await statsResponse.json().catch(() => statsResponse.text());
      console.log('   ❌ Server error in dashboard:', typeof errorData === 'string' ? errorData.substring(0, 200) : JSON.stringify(errorData, null, 2));
    }

    // 6. Test page routes
    console.log('\n6. Testing page routes...');
    const dashboardPageResponse = await fetch(`${BASE_URL}/dashboard`);
    console.log(`   Dashboard page: ${dashboardPageResponse.status} ${dashboardPageResponse.statusText}`);
    
    const profilePageResponse = await fetch(`${BASE_URL}/profile`);
    console.log(`   Profile page: ${profilePageResponse.status} ${profilePageResponse.statusText}`);

  } catch (error) {
    console.error('❌ Debug failed:', error.message);
  }
}

debugAuth();