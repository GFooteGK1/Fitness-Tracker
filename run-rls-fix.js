const { Client } = require('pg')
const fs = require('fs')

async function runRLSFix() {
  const client = new Client({
    connectionString: 'postgresql://postgres.auolnfwetmfcwhtvakzy:Fitness2025!@aws-0-us-west-1.pooler.supabase.com:6543/postgres'
  })

  try {
    await client.connect()
    console.log('Connected to database')

    const sql = fs.readFileSync('fix-food-tracking-rls-policies.sql', 'utf8')
    await client.query(sql)
    
    console.log('✅ RLS policies updated successfully')
  } catch (error) {
    console.error('❌ Error:', error.message)
  } finally {
    await client.end()
  }
}

runRLSFix()