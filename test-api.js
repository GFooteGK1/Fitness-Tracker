// Simple API test script
const testAPI = async () => {
  try {
    console.log('Testing Fitness Insights API...');
    
    const response = await fetch('http://localhost:3000/api/fitness-insights?days=7');
    const data = await response.json();
    
    console.log('Status:', response.status);
    console.log('Response:', JSON.stringify(data, null, 2));
    
    if (response.ok) {
      console.log('✅ API test successful!');
      console.log('Insights found:', data.insights?.length || 0);
      console.log('Recommendations:', data.recommendations ? 'Yes' : 'No');
    } else {
      console.log('❌ API test failed');
    }
  } catch (error) {
    console.error('❌ Error testing API:', error.message);
  }
};

testAPI();