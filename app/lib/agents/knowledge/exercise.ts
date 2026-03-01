/**
 * Compressed exercise knowledge — always included in the Trainer prompt.
 * Per Vercel's AGENTS.md findings, persistent context outperforms on-demand retrieval.
 * Target: ~2KB to keep total prompt under 8KB.
 */

export const EXERCISE_KNOWLEDGE = `## CrossFit Benchmark Workouts

### The Girls
Fran: 21-15-9 Thrusters 95/65 + Pull-ups (FOR_TIME, elite sub-4:00)
Grace: 30 Clean & Jerks 135/95 (FOR_TIME, elite sub-2:00)
Helen: 3rds 400m Run+21 KBS 53/35+12 Pull-ups (FOR_TIME, elite sub-8:00)
Diane: 21-15-9 Deadlifts 225/155+HSPU (FOR_TIME, elite sub-5:00)
Elizabeth: 21-15-9 Cleans 135/95+Ring Dips (FOR_TIME)
Annie: 50-40-30-20-10 DU+Sit-ups (FOR_TIME, elite sub-5:00)
Nancy: 5rds 400m Run+15 OHS 95/65 (FOR_TIME)
Karen: 150 Wall Balls 20/14 (FOR_TIME, elite sub-7:00)
Cindy: AMRAP 20: 5 PU+10 Push-ups+15 Squats (elite 25+rds)
Mary: AMRAP 20: 5 HSPU+10 Pistols+15 PU (elite 15+rds)
Isabel: 30 Snatches 135/95 (FOR_TIME, elite sub-2:00)
Jackie: 1000m Row+50 Thrusters 45/35+30 PU (FOR_TIME)

### Heroes
Murph: 1mi Run+100 PU+200 Push-ups+300 Squats+1mi Run w/vest 20/14 (FOR_TIME, elite sub-35:00)
DT: 5rds 12 DL 155/105+9 HPC+6 PJ (FOR_TIME, elite sub-6:00)
Kalsu: 100 Thrusters 135/95 OTMEM 5 Burpees (FOR_TIME)
JT: 21-15-9 HSPU+Ring Dips+Push-ups (FOR_TIME)

### Other
Fight Gone Bad: 3rds 1min each WB+SDHP+BJ+PP+Row (AMRAP total reps)
Filthy Fifty: 50 reps each of 10 movements (FOR_TIME)
King Kong: 3rds 1 DL 455/315+2 MU+3 SQC 250/175+4 HSPU (FOR_TIME)

## Movement Categories
Gymnastics: Pull-up, Muscle-up, HSPU, Pistol, T2B, Ring Dip, Push-up, Sit-up, L-sit, Rope Climb
Weightlifting: Clean, Snatch, Jerk, Deadlift, Squat (Back/Front/OH), Thruster, Press, Bench
Monostructural: Run, Row, Bike, Swim, Jump Rope (DU/SU), Ski Erg

## Programming Principles
- Conjugate: vary stimulus (heavy/light/fast/slow) across sessions
- Volume: 3-5 sessions/week for recreational, 5-6 for competitive
- Deload: every 4th week reduce volume 40-60%
- Strength cycles: 5/3/1, linear progression, wave loading
- Skill work: before metcon, when fresh

## RPE Guide
5-6: Moderate, conversational pace
7: Challenging but sustainable
8: Hard, limited talking
9: Near max effort, all-out
10: Absolute max, competition effort

## Score Formats
FOR_TIME: "MM:SS" → convert to total seconds (score_value)
AMRAP: "R+reps" → rounds*1000+reps (score_value)
STRENGTH: "Wlb" → weight in lbs (score_value)`
