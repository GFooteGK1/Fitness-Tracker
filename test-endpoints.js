// Test script for SociusFit API endpoints
const BASE_URL = 'http://localhost:3001';

async function testEndpoint(endpoint, method = 'GET', body = null, headers = {}) {
  try {
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };
    
    if (body) {
      options.body = JSON.stringify(body);
    }
    
    console.log(`\n🔍 Testing ${method} ${endpoint}`);
    const response = await fetch(`${BASE_URL}${endpoint}`, options);
    
    console.log(`Status: ${response.status} ${response.statusText}`);
    
    if (response.status >= 400) {
      const errorText = await response.text();
      console.log(`❌ Error Response: ${errorText}`);
      return { success: false, status: response.status, error: errorText };
    }
    
    const data = await response.json();
    console.log(`✅ Success:`, data);
    return { success: true, status: response.status, data };
    
  } catch (error) {
    console.log(`❌ Network Error:`, error.message);
    return { success: false, error: error.message };
  }
}

async function runTests() {
  console.log('🚀 Starting SociusFit API Endpoint Tests\n');
  
  // Test basic endpoints that don't require auth
  await testEndpoint('/api/auth/signin', 'POST', {
    email: 'test@example.com',
    password: 'wrongpassword'
  });
  
  // Test dashboard stats (should require auth)
  await testEndpoint('/api/dashboard-stats');
  
  // Test profile endpoint (should require auth)
  await testEndpoint('/api/profile');
  
  // Test targets endpoint (should require auth)
  await testEndpoint('/api/targets');
  
  // Test meals daily endpoint (should require auth)
  await testEndpoint('/api/meals/daily');
  
  console.log('\n✅ API endpoint tests completed');
}

runTests().catch(console.error);