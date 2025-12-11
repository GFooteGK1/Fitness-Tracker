const fs = require('fs');
const csv = require('csv-parser');
const { createClient } = require('@supabase/supabase-js');

// Load environment variables
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function migrateData() {
  console.log('🚀 Starting data migration...');
  
  const workouts = [];
  const movements = new Set();
  const blockScores = [];
  const benchmarkPRs = [];
  
  // Read and parse CSV
  return new Promise((resolve, reject) => {
    fs.createReadStream('../BetterBoard - Parsed_Workouts.csv')
      .pipe(csv())
      .on('data', (row) => {
        try {
          // Parse the workout data
          const workout = {
            id: row.session_id,
            user_id: null, // Single user mode
            workout_date: new Date(row.workout_date).toISOString().split('T')[0],
            input_text: row.input_text,
            blocks: row.blocks_json ? JSON.parse(row.blocks_json) : [],
            primary_score: row.primary_score,
            total_duration_min: parseInt(row.total_duration_min) || null,
            tags: row.tags ? row.tags.split(',').map(t => t.trim()) : [],
            notes: row.notes || null,
            rpe: parseInt(row.rpe) || null,
            parse_confidence: parseFloat(row.parse_confidence) || null,
            created_at: new Date(row.created_at).toISOString()
          };
          
          workouts.push(workout);
          
          // Parse blocks JSON
          if (row.blocks_json) {
            const blocks = JSON.parse(row.blocks_json);
            
            blocks.forEach((block, blockIndex) => {
              // Extract movements
              if (block.segments) {
                block.segments.forEach(segment => {
                  if (segment.events) {
                    segment.events.forEach(event => {
                      if (event.movement_name) {
                        movements.add(event.movement_name);
                      }
                    });
                  }
                });
              }
              
              // Create block score entry
              if (block.block_score) {
                const blockScore = {
                  workout_id: row.session_id,
                  block_type: block.block_type,
                  block_title: block.title,
                  rounds_completed: block.block_score.rounds_completed,
                  extra_reps: block.block_score.extra_reps,
                  time_s: block.block_score.time_s,
                  total_reps: block.block_score.total_reps,
                  tonnage_lb: block.block_score.tonnage_lb,
                  rx_status: block.block_score.rx_status || 'UNKNOWN',
                  is_pr: block.block_score.is_pr || false,
                  created_at: new Date(row.created_at).toISOString()
                };
                
                blockScores.push(blockScore);
                
                // Check for benchmark PRs
                if (block.title && isKnownBenchmark(block.title) && block.block_score.is_pr) {
                  const pr = {
                    user_id: null,
                    benchmark_name: block.title,
                    date: new Date(row.workout_date).toISOString().split('T')[0],
                    score_value: getScoreValue(block.block_score),
                    score_display: getScoreDisplay(block.block_score, block.score_model?.scoring),
                    rx_status: block.block_score.rx_status || 'UNKNOWN',
                    workout_id: row.session_id,
                    created_at: new Date(row.created_at).toISOString()
                  };
                  
                  benchmarkPRs.push(pr);
                }
              }
            });
          }
          
        } catch (error) {
          console.error('Error parsing row:', error);
          console.error('Row data:', row);
        }
      })
      .on('end', async () => {
        try {
          console.log(`📊 Parsed ${workouts.length} workouts`);
          console.log(`💪 Found ${movements.size} unique movements`);
          console.log(`🎯 Found ${blockScores.length} block scores`);
          console.log(`🏆 Found ${benchmarkPRs.length} benchmark PRs`);
          
          // Insert movements first
          console.log('\n🏋️ Inserting movements...');
          const movementData = Array.from(movements).map(name => ({
            canonical_name: name,
            category: categorizeMovement(name).toUpperCase(),
            movement_pattern: getMovementPattern(name),
            aliases: JSON.stringify([name.toLowerCase()]),
            equipment: JSON.stringify([]),
            rx_standards: JSON.stringify({}),
            parameter_schema: JSON.stringify({ reps: true }),
            created_at: new Date().toISOString()
          }));
          
          const { error: movementError } = await supabase
            .from('movements')
            .upsert(movementData, { onConflict: 'canonical_name' });
          
          if (movementError) {
            console.error('Movement insert error:', movementError);
          } else {
            console.log(`✅ Inserted ${movementData.length} movements`);
          }
          
          // Insert workouts
          console.log('\n📝 Inserting workouts...');
          const { error: workoutError } = await supabase
            .from('workouts')
            .upsert(workouts, { onConflict: 'id' });
          
          if (workoutError) {
            console.error('Workout insert error:', workoutError);
          } else {
            console.log(`✅ Inserted ${workouts.length} workouts`);
          }
          
          // Insert block scores
          console.log('\n🎯 Inserting block scores...');
          const { error: blockError } = await supabase
            .from('block_scores')
            .insert(blockScores);
          
          if (blockError) {
            console.error('Block score insert error:', blockError);
          } else {
            console.log(`✅ Inserted ${blockScores.length} block scores`);
          }
          
          // Insert benchmark PRs
          if (benchmarkPRs.length > 0) {
            console.log('\n🏆 Inserting benchmark PRs...');
            const { error: prError } = await supabase
              .from('benchmark_prs')
              .insert(benchmarkPRs);
            
            if (prError) {
              console.error('PR insert error:', prError);
            } else {
              console.log(`✅ Inserted ${benchmarkPRs.length} benchmark PRs`);
            }
          }
          
          console.log('\n🎉 Migration completed successfully!');
          resolve();
          
        } catch (error) {
          console.error('Migration error:', error);
          reject(error);
        }
      })
      .on('error', reject);
  });
}

// Helper functions
function getScoreValue(blockScore) {
  if (blockScore.time_s) return blockScore.time_s;
  if (blockScore.rounds_completed !== null) {
    return blockScore.rounds_completed + (blockScore.extra_reps || 0) / 100;
  }
  if (blockScore.total_reps) return blockScore.total_reps;
  if (blockScore.tonnage_lb) return blockScore.tonnage_lb;
  return null;
}

function getScoreDisplay(blockScore, scoringType) {
  if (blockScore.time_s) {
    const minutes = Math.floor(blockScore.time_s / 60);
    const seconds = blockScore.time_s % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }
  if (scoringType === 'ROUNDS_PLUS_REPS') {
    return `${blockScore.rounds_completed}+${blockScore.extra_reps || 0}`;
  }
  if (blockScore.total_reps) return `${blockScore.total_reps} reps`;
  if (blockScore.tonnage_lb) return `${blockScore.tonnage_lb} lb`;
  return 'completed';
}

function getMovementPattern(movementName) {
  const name = movementName.toLowerCase();
  
  if (name.includes('squat')) return 'squat';
  if (name.includes('deadlift')) return 'hinge';
  if (name.includes('press') || name.includes('jerk')) return 'push';
  if (name.includes('pull') || name.includes('chin')) return 'pull';
  if (name.includes('row') || name.includes('bike') || name.includes('run')) return 'monostructural';
  if (name.includes('clean') || name.includes('snatch')) return 'mixed';
  if (name.includes('burpee') || name.includes('thruster')) return 'mixed';
  
  return 'gymnastics';
}

function categorizeMovement(movementName) {
  const name = movementName.toLowerCase();
  
  if (name.includes('row') || name.includes('bike') || name.includes('run')) return 'monostructural';
  if (name.includes('clean') || name.includes('snatch') || name.includes('jerk')) return 'weightlifting';
  if (name.includes('squat') || name.includes('deadlift') || name.includes('press')) return 'weightlifting';
  if (name.includes('pull') || name.includes('push') || name.includes('burpee')) return 'gymnastics';
  
  return 'gymnastics';
}

function isKnownBenchmark(title) {
  const benchmarks = [
    'fran', 'grace', 'helen', 'diane', 'elizabeth', 'annie', 'eva', 'kelly',
    'cindy', 'mary', 'barbara', 'jackie', 'karen', 'lynne', 'nancy', 'amanda'
  ];
  
  return benchmarks.includes(title.toLowerCase());
}

// Run migration
if (require.main === module) {
  migrateData()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}

module.exports = { migrateData };