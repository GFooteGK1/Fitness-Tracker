// Test the targets API after RLS fix
const testUserId = '550e8400-e29b-41d4-a716-446655440000'

async function testTargetsAPI() {
  try {
    console.log('🧪 Testing POST /api/targets after RLS fix...')
    
    const response = await fetch('http://localhost:3000/api/targets', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId: testUserId,
        targetProtein: 150,
        targetCarbs: 200,
        targetFat: 80,
        targetCalories: 2000,
        tolerancePct: 5.0
      }),
    })

    console.log('📊 Response status:', response.status)
    
    if (!response.ok) {
      const errorText = await response.text()
      console.log('❌ Error response:', errorText)
    } else {
      const data = await response.json()
      console.log('✅ Success! Target saved:', data)
      
      // Test GET to verify it was saved
      console.log('\n🔍 Testing GET /api/targets...')
      const getResponse = await fetch(`http://localhost:3000/api/targets?userId=${testUserId}`)
      if (getResponse.ok) {
        const getData = await getResponse.json()
        console.log('✅ Retrieved targets:', getData)
      } else {
        console.log('❌ Failed to retrieve targets')
      }
    }
  } catch (error) {
    console.error('❌ Request failed:', error.message)
  }
}

testTargetsAPI()