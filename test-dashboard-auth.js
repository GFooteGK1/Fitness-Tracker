// Test dashboard authentication flow
const BASE_URL = 'http://localhost:3000';

async function testDashboardAuth() {
  console.log('Testing dashboard authentication flow...\n');

  try {
    // 1. Test dashboard page without authentication
    console.log('1. Testing dashboard page access (unauthenticated)...');
    const dashboardResponse = await fetch(`${BASE_URL}/dashboard`);
    console.log(`Dashboard status: ${dashboardResponse.status}`);
    
    if (dashboardResponse.status === 500) {
      const errorText = await dashboardResponse.text();
      console.log('Dashboard error:', errorText.substring(0, 500));
    }

    // 2. Test dashboard stats API without authentication
    console.log('\n2. Testing dashboard stats API (unauthenticated)...');
    const statsResponse = await fetch(`${BASE_URL}/api/dashboard-stats`);
    console.log(`Stats API status: ${statsResponse.status}`);
    
    if (statsResponse.status === 500) {
      const errorData = await statsResponse.json().catch(() => statsResponse.text());
      console.log('Stats API error:', errorData);
    } else if (statsResponse.status === 401) {
      console.log('✅ Correctly returns 401 (unauthorized)');
    }

    // 3. Test profile API without authentication
    console.log('\n3. Testing profile API (unauthenticated)...');
    const profileResponse = await fetch(`${BASE_URL}/api/profile`);
    console.log(`Profile API status: ${profileResponse.status}`);
    
    if (profileResponse.status === 500) {
      const errorData = await profileResponse.json().catch(() => profileResponse.text());
      console.log('Profile API error:', errorData);
    } else if (profileResponse.status === 401) {
      console.log('✅ Correctly returns 401 (unauthorized)');
    }

    // 4. Test health endpoint
    console.log('\n4. Testing health endpoint...');
    const healthResponse = await fetch(`${BASE_URL}/api/health`);
    console.log(`Health status: ${healthResponse.status}`);
    
    if (healthResponse.ok) {
      const healthData = await healthResponse.json();
      console.log('Health data:', JSON.stringify(healthData, null, 2));
    }

    // 5. Test auth endpoints
    console.log('\n5. Testing auth endpoints...');
    const signinResponse = await fetch(`${BASE_URL}/api/auth/signin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'test@example.com', password: 'test' })
    });
    console.log(`Signin API status: ${signinResponse.status}`);

  } catch (error) {
    console.error('Test failed:', error.message);
  }
}

testDashboardAuth();