// Simple health check script
const fetch = require('node:fetch');

async function checkHealth() {
  try {
    console.log('Checking health endpoint...');
    const response = await fetch('http://localhost:3000/api/health');
    const data = await response.json();
    
    console.log('Health check response:');
    console.log(JSON.stringify(data, null, 2));
    
    if (data.services) {
      console.log('\nService Status:');
      console.log(`- Database: ${data.services.database}`);
      console.log(`- Auth: ${data.services.auth}`);
    }
    
  } catch (error) {
    console.error('Health check failed:', error.message);
  }
}

checkHealth();