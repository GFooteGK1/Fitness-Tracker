// Comprehensive testing script for SociusFit
const BASE_URL = 'http://localhost:3000'; // Updated to standard Next.js port

// Test configuration
const TEST_CONFIG = {
  timeout: 10000,
  retries: 3,
  verbose: true
};

// Test user credentials (for testing purposes)
const TEST_USER = {
  email: 'test@sociusfit.com',
  password: 'TestPassword123!'
};

// Utility functions
function log(message, type = 'info') {
  const timestamp = new Date().toISOString();
  const prefix = {
    info: '📋',
    success: '✅',
    error: '❌',
    warning: '⚠️',
    debug: '🔍'
  }[type] || '📋';
  
  console.log(`${prefix} [${timestamp}] ${message}`);
}

async function makeRequest(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`;
  const defaultOptions = {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    timeout: TEST_CONFIG.timeout
  };

  const requestOptions = { ...defaultOptions, ...options };
  
  if (requestOptions.body && typeof requestOptions.body === 'object') {
    requestOptions.body = JSON.stringify(requestOptions.body);
  }

  log(`Making ${requestOptions.method} request to ${endpoint}`, 'debug');
  
  try {
    const response = await fetch(url, requestOptions);
    const contentType = response.headers.get('content-type');
    
    let data;
    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    return {
      success: response.ok,
      status: response.status,
      statusText: response.statusText,
      data,
      headers: Object.fromEntries(response.headers.entries())
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      status: 0
    };
  }
}

// Test suites
class TestSuite {
  constructor(name) {
    this.name = name;
    this.tests = [];
    this.results = [];
  }

  addTest(name, testFn) {
    this.tests.push({ name, testFn });
  }

  async run() {
    log(`Starting test suite: ${this.name}`, 'info');
    
    for (const test of this.tests) {
      try {
        log(`Running test: ${test.name}`, 'debug');
        const result = await test.testFn();
        this.results.push({ name: test.name, success: true, result });
        log(`Test passed: ${test.name}`, 'success');
      } catch (error) {
        this.results.push({ name: test.name, success: false, error: error.message });
        log(`Test failed: ${test.name} - ${error.message}`, 'error');
      }
    }

    const passed = this.results.filter(r => r.success).length;
    const total = this.results.length;
    log(`Test suite completed: ${this.name} (${passed}/${total} passed)`, 
         passed === total ? 'success' : 'warning');
    
    return this.results;
  }
}

// Health check tests
const healthCheckSuite = new TestSuite('Health Check');

healthCheckSuite.addTest('Server is running', async () => {
  const response = await makeRequest('/');
  if (!response.success && response.status === 0) {
    throw new Error('Server is not running or not accessible');
  }
  return response;
});

healthCheckSuite.addTest('API routes are accessible', async () => {
  const response = await makeRequest('/api/health');
  // Even if this endpoint doesn't exist, we should get a 404, not a connection error
  if (response.status === 0) {
    throw new Error('API routes are not accessible');
  }
  return response;
});

// Authentication tests
const authSuite = new TestSuite('Authentication');

authSuite.addTest('Sign up endpoint exists', async () => {
  const response = await makeRequest('/api/auth/signup', {
    method: 'POST',
    body: { email: 'test@example.com', password: 'test' }
  });
  
  // Should not be a connection error
  if (response.status === 0) {
    throw new Error('Sign up endpoint not accessible');
  }
  return response;
});

authSuite.addTest('Sign in endpoint exists', async () => {
  const response = await makeRequest('/api/auth/signin', {
    method: 'POST',
    body: { email: 'test@example.com', password: 'test' }
  });
  
  if (response.status === 0) {
    throw new Error('Sign in endpoint not accessible');
  }
  return response;
});

// Profile tests
const profileSuite = new TestSuite('Profile Management');

profileSuite.addTest('Profile endpoint exists', async () => {
  const response = await makeRequest('/api/profile');
  
  if (response.status === 0) {
    throw new Error('Profile endpoint not accessible');
  }
  
  // Should return 401 (unauthorized) since we're not authenticated
  if (response.status !== 401) {
    log(`Expected 401, got ${response.status}`, 'warning');
  }
  
  return response;
});

profileSuite.addTest('Profile page loads', async () => {
  const response = await makeRequest('/profile');
  
  if (response.status === 0) {
    throw new Error('Profile page not accessible');
  }
  
  return response;
});

// Dashboard tests
const dashboardSuite = new TestSuite('Dashboard');

dashboardSuite.addTest('Dashboard page loads', async () => {
  const response = await makeRequest('/dashboard');
  
  if (response.status === 0) {
    throw new Error('Dashboard page not accessible');
  }
  
  return response;
});

dashboardSuite.addTest('Dashboard stats endpoint exists', async () => {
  const response = await makeRequest('/api/dashboard-stats');
  
  if (response.status === 0) {
    throw new Error('Dashboard stats endpoint not accessible');
  }
  
  // Should return 401 (unauthorized) since we're not authenticated
  if (response.status !== 401) {
    log(`Expected 401, got ${response.status}`, 'warning');
  }
  
  return response;
});

// Food tracking tests
const foodTrackingSuite = new TestSuite('Food Tracking');

foodTrackingSuite.addTest('Meals API endpoint exists', async () => {
  const response = await makeRequest('/api/meals/daily');
  
  if (response.status === 0) {
    throw new Error('Meals API endpoint not accessible');
  }
  
  return response;
});

foodTrackingSuite.addTest('Targets API endpoint exists', async () => {
  const response = await makeRequest('/api/targets');
  
  if (response.status === 0) {
    throw new Error('Targets API endpoint not accessible');
  }
  
  return response;
});

// Database connectivity tests
const databaseSuite = new TestSuite('Database Connectivity');

databaseSuite.addTest('Database connection via API', async () => {
  // Try to make a request that would require database access
  const response = await makeRequest('/api/profile');
  
  if (response.status === 500) {
    // Check if it's a database connection error
    if (response.data && typeof response.data === 'string' && 
        response.data.includes('database')) {
      throw new Error('Database connection failed');
    }
  }
  
  return response;
});

// Environment tests
const environmentSuite = new TestSuite('Environment Configuration');

environmentSuite.addTest('Environment variables loaded', async () => {
  // This is indirect - we'll check if Supabase endpoints work
  const response = await makeRequest('/api/auth/signin', {
    method: 'POST',
    body: { email: 'test@example.com', password: 'test' }
  });
  
  if (response.status === 500 && response.data && 
      typeof response.data === 'string' && 
      response.data.includes('SUPABASE')) {
    throw new Error('Supabase environment variables not configured');
  }
  
  return response;
});

// Main test runner
async function runAllTests() {
  log('🚀 Starting comprehensive SociusFit testing', 'info');
  log(`Testing against: ${BASE_URL}`, 'info');
  
  const suites = [
    healthCheckSuite,
    environmentSuite,
    authSuite,
    profileSuite,
    dashboardSuite,
    foodTrackingSuite,
    databaseSuite
  ];

  const allResults = {};
  let totalPassed = 0;
  let totalTests = 0;

  for (const suite of suites) {
    const results = await suite.run();
    allResults[suite.name] = results;
    
    const passed = results.filter(r => r.success).length;
    totalPassed += passed;
    totalTests += results.length;
    
    // Add some spacing between suites
    console.log('');
  }

  // Summary
  log('📊 TEST SUMMARY', 'info');
  log(`Total tests: ${totalTests}`, 'info');
  log(`Passed: ${totalPassed}`, totalPassed === totalTests ? 'success' : 'info');
  log(`Failed: ${totalTests - totalPassed}`, totalTests - totalPassed === 0 ? 'success' : 'error');
  
  if (totalPassed < totalTests) {
    log('❌ Some tests failed. Check the logs above for details.', 'error');
    
    // Show failed tests summary
    log('Failed tests:', 'error');
    for (const [suiteName, results] of Object.entries(allResults)) {
      const failed = results.filter(r => !r.success);
      if (failed.length > 0) {
        log(`  ${suiteName}:`, 'error');
        failed.forEach(test => {
          log(`    - ${test.name}: ${test.error}`, 'error');
        });
      }
    }
  } else {
    log('🎉 All tests passed!', 'success');
  }

  return allResults;
}

// Error handling for the script
process.on('unhandledRejection', (reason, promise) => {
  log(`Unhandled Rejection at: ${promise}, reason: ${reason}`, 'error');
});

process.on('uncaughtException', (error) => {
  log(`Uncaught Exception: ${error.message}`, 'error');
  process.exit(1);
});

// Run the tests
if (require.main === module) {
  runAllTests()
    .then(() => {
      log('Testing completed', 'success');
      process.exit(0);
    })
    .catch((error) => {
      log(`Testing failed: ${error.message}`, 'error');
      process.exit(1);
    });
}

module.exports = {
  runAllTests,
  makeRequest,
  TestSuite,
  TEST_CONFIG
};