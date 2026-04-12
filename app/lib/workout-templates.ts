// Workout Templates Data Model and Built-in Library

export type WorkoutType = 'amrap' | 'emom' | 'for_time' | 'strength' | 'custom';

export type TemplateCategory = 'benchmark' | 'hero' | 'strength' | 'conditioning' | 'gymnastics' | 'custom';

export interface Movement {
  name: string;
  reps?: number | string;
  weight?: string;
  distance?: string;
  duration?: string;
  notes?: string;
}

export interface WorkoutTemplate {
  id: string;
  name: string;
  category: TemplateCategory;
  description: string;
  type: WorkoutType;
  movements: Movement[];
  timeCap?: number; // in minutes
  rounds?: number;
  tags: string[];
  isCustom?: boolean;
  userId?: string;
}

// ---------------------
// Benchmark WODs
// ---------------------

const benchmarkWods: WorkoutTemplate[] = [
  {
    id: 'benchmark-fran',
    name: 'Fran',
    category: 'benchmark',
    description: '21-15-9 reps of thrusters and pull-ups. One of the most iconic CrossFit benchmark WODs.',
    type: 'for_time',
    movements: [
      { name: 'Thrusters', reps: '21-15-9', weight: '95/65 lb' },
      { name: 'Pull-Ups', reps: '21-15-9' },
    ],
    tags: ['barbell', 'gymnastics', 'classic', 'fast'],
  },
  {
    id: 'benchmark-grace',
    name: 'Grace',
    category: 'benchmark',
    description: '30 clean and jerks for time. A classic barbell sprint.',
    type: 'for_time',
    movements: [
      { name: 'Clean & Jerk', reps: 30, weight: '135/95 lb' },
    ],
    tags: ['barbell', 'olympic lifting', 'fast'],
  },
  {
    id: 'benchmark-diane',
    name: 'Diane',
    category: 'benchmark',
    description: '21-15-9 reps of deadlifts and handstand push-ups.',
    type: 'for_time',
    movements: [
      { name: 'Deadlift', reps: '21-15-9', weight: '225/155 lb' },
      { name: 'Handstand Push-Ups', reps: '21-15-9' },
    ],
    tags: ['barbell', 'gymnastics', 'fast'],
  },
  {
    id: 'benchmark-helen',
    name: 'Helen',
    category: 'benchmark',
    description: '3 rounds of a 400m run, kettlebell swings, and pull-ups.',
    type: 'for_time',
    rounds: 3,
    movements: [
      { name: 'Run', distance: '400m' },
      { name: 'Kettlebell Swings', reps: 21, weight: '53/35 lb' },
      { name: 'Pull-Ups', reps: 12 },
    ],
    tags: ['kettlebell', 'running', 'gymnastics'],
  },
  {
    id: 'benchmark-dt',
    name: 'DT',
    category: 'benchmark',
    description: '5 rounds of deadlifts, hang cleans, and push jerks.',
    type: 'for_time',
    rounds: 5,
    movements: [
      { name: 'Deadlift', reps: 12, weight: '155/105 lb' },
      { name: 'Hang Power Clean', reps: 9, weight: '155/105 lb' },
      { name: 'Push Jerk', reps: 6, weight: '155/105 lb' },
    ],
    tags: ['barbell', 'olympic lifting'],
  },
  {
    id: 'benchmark-annie',
    name: 'Annie',
    category: 'benchmark',
    description: '50-40-30-20-10 reps of double-unders and sit-ups.',
    type: 'for_time',
    movements: [
      { name: 'Double-Unders', reps: '50-40-30-20-10' },
      { name: 'Sit-Ups', reps: '50-40-30-20-10' },
    ],
    tags: ['jump rope', 'bodyweight', 'core'],
  },
  {
    id: 'benchmark-jackie',
    name: 'Jackie',
    category: 'benchmark',
    description: 'Row, thrusters, and pull-ups for time.',
    type: 'for_time',
    movements: [
      { name: 'Row', distance: '1000m' },
      { name: 'Thrusters', reps: 50, weight: '45/35 lb' },
      { name: 'Pull-Ups', reps: 30 },
    ],
    tags: ['rowing', 'barbell', 'gymnastics'],
  },
  {
    id: 'benchmark-karen',
    name: 'Karen',
    category: 'benchmark',
    description: '150 wall balls for time. A test of mental and physical endurance.',
    type: 'for_time',
    movements: [
      { name: 'Wall Balls', reps: 150, weight: '20/14 lb', notes: '10/9 ft target' },
    ],
    tags: ['wall ball', 'endurance', 'legs'],
  },
  {
    id: 'benchmark-isabel',
    name: 'Isabel',
    category: 'benchmark',
    description: '30 snatches for time. The snatch sprint.',
    type: 'for_time',
    movements: [
      { name: 'Snatch', reps: 30, weight: '135/95 lb' },
    ],
    tags: ['barbell', 'olympic lifting', 'fast'],
  },
  {
    id: 'benchmark-elizabeth',
    name: 'Elizabeth',
    category: 'benchmark',
    description: '21-15-9 reps of cleans and ring dips.',
    type: 'for_time',
    movements: [
      { name: 'Squat Clean', reps: '21-15-9', weight: '135/95 lb' },
      { name: 'Ring Dips', reps: '21-15-9' },
    ],
    tags: ['barbell', 'gymnastics', 'rings'],
  },
  {
    id: 'benchmark-cindy',
    name: 'Cindy',
    category: 'benchmark',
    description: 'As many rounds as possible in 20 minutes of pull-ups, push-ups, and air squats.',
    type: 'amrap',
    timeCap: 20,
    movements: [
      { name: 'Pull-Ups', reps: 5 },
      { name: 'Push-Ups', reps: 10 },
      { name: 'Air Squats', reps: 15 },
    ],
    tags: ['bodyweight', 'gymnastics', 'classic'],
  },
  {
    id: 'benchmark-nancy',
    name: 'Nancy',
    category: 'benchmark',
    description: '5 rounds of a 400m run and overhead squats.',
    type: 'for_time',
    rounds: 5,
    movements: [
      { name: 'Run', distance: '400m' },
      { name: 'Overhead Squat', reps: 15, weight: '95/65 lb' },
    ],
    tags: ['running', 'barbell', 'mobility'],
  },
  {
    id: 'benchmark-angie',
    name: 'Angie',
    category: 'benchmark',
    description: '100 pull-ups, 100 push-ups, 100 sit-ups, 100 air squats for time.',
    type: 'for_time',
    movements: [
      { name: 'Pull-Ups', reps: 100 },
      { name: 'Push-Ups', reps: 100 },
      { name: 'Sit-Ups', reps: 100 },
      { name: 'Air Squats', reps: 100 },
    ],
    tags: ['bodyweight', 'gymnastics', 'endurance'],
  },
  {
    id: 'benchmark-barbara',
    name: 'Barbara',
    category: 'benchmark',
    description: '5 rounds of pull-ups, push-ups, sit-ups, and air squats with 3 min rest between rounds.',
    type: 'for_time',
    rounds: 5,
    movements: [
      { name: 'Pull-Ups', reps: 20 },
      { name: 'Push-Ups', reps: 30 },
      { name: 'Sit-Ups', reps: 40 },
      { name: 'Air Squats', reps: 50 },
    ],
    tags: ['bodyweight', 'gymnastics', 'endurance'],
  },
  {
    id: 'benchmark-chelsea',
    name: 'Chelsea',
    category: 'benchmark',
    description: 'Every minute on the minute for 30 minutes: 5 pull-ups, 10 push-ups, 15 air squats.',
    type: 'emom',
    timeCap: 30,
    movements: [
      { name: 'Pull-Ups', reps: 5 },
      { name: 'Push-Ups', reps: 10 },
      { name: 'Air Squats', reps: 15 },
    ],
    tags: ['bodyweight', 'gymnastics', 'emom'],
  },
  {
    id: 'benchmark-eva',
    name: 'Eva',
    category: 'benchmark',
    description: '5 rounds of an 800m run, kettlebell swings, and pull-ups.',
    type: 'for_time',
    rounds: 5,
    movements: [
      { name: 'Run', distance: '800m' },
      { name: 'Kettlebell Swings', reps: 30, weight: '70/53 lb' },
      { name: 'Pull-Ups', reps: 30 },
    ],
    tags: ['running', 'kettlebell', 'gymnastics', 'long'],
  },
  {
    id: 'benchmark-kelly',
    name: 'Kelly',
    category: 'benchmark',
    description: '5 rounds of a 400m run, box jumps, and wall balls.',
    type: 'for_time',
    rounds: 5,
    movements: [
      { name: 'Run', distance: '400m' },
      { name: 'Box Jumps', reps: 30, notes: '24/20 in' },
      { name: 'Wall Balls', reps: 30, weight: '20/14 lb' },
    ],
    tags: ['running', 'box jumps', 'wall ball'],
  },
  {
    id: 'benchmark-lynne',
    name: 'Lynne',
    category: 'benchmark',
    description: '5 rounds (not for time) of max rep bench press and max rep pull-ups.',
    type: 'strength',
    rounds: 5,
    movements: [
      { name: 'Bench Press', reps: 'Max reps', weight: 'Bodyweight' },
      { name: 'Pull-Ups', reps: 'Max reps' },
    ],
    tags: ['barbell', 'gymnastics', 'upper body'],
  },
  {
    id: 'benchmark-mary',
    name: 'Mary',
    category: 'benchmark',
    description: '20 minute AMRAP of handstand push-ups, pistols, and pull-ups.',
    type: 'amrap',
    timeCap: 20,
    movements: [
      { name: 'Handstand Push-Ups', reps: 5 },
      { name: 'Pistols', reps: 10, notes: 'alternating' },
      { name: 'Pull-Ups', reps: 15 },
    ],
    tags: ['bodyweight', 'gymnastics', 'skill'],
  },
  {
    id: 'benchmark-amanda',
    name: 'Amanda',
    category: 'benchmark',
    description: '9-7-5 reps of muscle-ups and snatches.',
    type: 'for_time',
    movements: [
      { name: 'Muscle-Ups', reps: '9-7-5' },
      { name: 'Squat Snatch', reps: '9-7-5', weight: '135/95 lb' },
    ],
    tags: ['gymnastics', 'olympic lifting', 'skill'],
  },
];

// ---------------------
// Hero WODs
// ---------------------

const heroWods: WorkoutTemplate[] = [
  {
    id: 'hero-murph',
    name: 'Murph',
    category: 'hero',
    description: 'In honor of Navy Lieutenant Michael Murphy, 29. Run, pull-ups, push-ups, air squats, run — with a 20/14 lb vest.',
    type: 'for_time',
    movements: [
      { name: 'Run', distance: '1 mile' },
      { name: 'Pull-Ups', reps: 100 },
      { name: 'Push-Ups', reps: 200 },
      { name: 'Air Squats', reps: 300 },
      { name: 'Run', distance: '1 mile' },
    ],
    tags: ['bodyweight', 'running', 'vest', 'long', 'memorial day'],
  },
  {
    id: 'hero-michael',
    name: 'Michael',
    category: 'hero',
    description: 'In honor of US Navy Lieutenant Michael McGreevy, 30. 3 rounds of run, back extensions, and sit-ups.',
    type: 'for_time',
    rounds: 3,
    movements: [
      { name: 'Run', distance: '800m' },
      { name: 'Back Extensions', reps: 50 },
      { name: 'Sit-Ups', reps: 50 },
    ],
    tags: ['running', 'bodyweight', 'core'],
  },
  {
    id: 'hero-ryan',
    name: 'Ryan',
    category: 'hero',
    description: 'In honor of US Navy Senior Chief Cryptologic Technician David Blake McLendon, 30. 5 rounds of muscle-ups, deadlifts, bench press, and rope climbs.',
    type: 'for_time',
    rounds: 5,
    movements: [
      { name: 'Muscle-Ups', reps: 7 },
      { name: 'Thruster', reps: 21, weight: '95/65 lb' },
    ],
    tags: ['gymnastics', 'barbell'],
  },
  {
    id: 'hero-badger',
    name: 'Badger',
    category: 'hero',
    description: 'In honor of US Navy Chief Petty Officer Mark Carter, 27. 3 rounds of squat cleans, muscle-ups, and a run.',
    type: 'for_time',
    rounds: 3,
    movements: [
      { name: 'Squat Clean', reps: 30, weight: '95/65 lb' },
      { name: 'Pull-Ups', reps: 30 },
      { name: 'Run', distance: '800m' },
    ],
    tags: ['barbell', 'gymnastics', 'running'],
  },
  {
    id: 'hero-jt',
    name: 'JT',
    category: 'hero',
    description: 'In honor of Petty Officer 1st Class Jeff Taylor, 30. 21-15-9 reps of handstand push-ups, ring dips, and push-ups.',
    type: 'for_time',
    movements: [
      { name: 'Handstand Push-Ups', reps: '21-15-9' },
      { name: 'Ring Dips', reps: '21-15-9' },
      { name: 'Push-Ups', reps: '21-15-9' },
    ],
    tags: ['gymnastics', 'pushing', 'upper body'],
  },
  {
    id: 'hero-daniel',
    name: 'Daniel',
    category: 'hero',
    description: 'In honor of US Army Sergeant First Class Daniel Crabtree, 31. 50 pull-ups, 400m run with 45 lb plate, 21 thrusters, 800m run, 21 thrusters, 400m run with 45 lb plate, 50 pull-ups.',
    type: 'for_time',
    movements: [
      { name: 'Pull-Ups', reps: 50 },
      { name: 'Run', distance: '400m', notes: 'carrying 45/25 lb plate' },
      { name: 'Thrusters', reps: 21, weight: '95/65 lb' },
      { name: 'Run', distance: '800m' },
      { name: 'Thrusters', reps: 21, weight: '95/65 lb' },
      { name: 'Run', distance: '400m', notes: 'carrying 45/25 lb plate' },
      { name: 'Pull-Ups', reps: 50 },
    ],
    tags: ['running', 'barbell', 'gymnastics', 'long'],
  },
  {
    id: 'hero-loredo',
    name: 'Loredo',
    category: 'hero',
    description: 'In honor of Staff Sergeant Edwardo Loredo, 34. 6 rounds of run, push-ups, and sit-ups, plus 24 squats to finish.',
    type: 'for_time',
    rounds: 6,
    movements: [
      { name: 'Run', distance: '200m' },
      { name: 'Push-Ups', reps: 24 },
      { name: 'Lunges', reps: 24 },
      { name: 'Sit-Ups', reps: 24 },
    ],
    tags: ['running', 'bodyweight', 'endurance'],
  },
];

// ---------------------
// Strength Templates
// ---------------------

const strengthTemplates: WorkoutTemplate[] = [
  {
    id: 'strength-back-squat-5x5',
    name: '5x5 Back Squat',
    category: 'strength',
    description: 'Classic 5 sets of 5 reps back squat progression. Build raw strength with heavy compound lifts.',
    type: 'strength',
    rounds: 5,
    movements: [
      { name: 'Back Squat', reps: 5, notes: 'Work to heavy set, same weight across all 5 sets' },
    ],
    tags: ['barbell', 'squat', 'legs', 'linear progression'],
  },
  {
    id: 'strength-deadlift-531',
    name: '5-3-1 Deadlift',
    category: 'strength',
    description: 'Wendler 5-3-1 style deadlift session. Progressive overload with percentage-based work.',
    type: 'strength',
    movements: [
      { name: 'Deadlift', reps: '5-3-1', notes: 'Set 1: 5 reps @ 65%, Set 2: 3 reps @ 75%, Set 3: 1+ reps @ 85%' },
    ],
    tags: ['barbell', 'deadlift', 'posterior chain', '531'],
  },
  {
    id: 'strength-clean-and-jerk-3x3',
    name: '3x3 Clean & Jerk',
    category: 'strength',
    description: 'Heavy clean and jerk triples. Build Olympic lifting strength and technique.',
    type: 'strength',
    rounds: 3,
    movements: [
      { name: 'Clean & Jerk', reps: 3, notes: 'Build to a heavy triple' },
    ],
    tags: ['barbell', 'olympic lifting', 'clean', 'jerk'],
  },
  {
    id: 'strength-snatch-complex',
    name: 'Snatch Complex',
    category: 'strength',
    description: 'Snatch technique and strength complex. Every 2 minutes for 10 minutes.',
    type: 'emom',
    timeCap: 10,
    movements: [
      { name: 'Snatch Pull', reps: 1 },
      { name: 'Hang Snatch', reps: 1 },
      { name: 'Squat Snatch', reps: 1, notes: 'Build weight each set, E2MOM for 5 sets' },
    ],
    tags: ['barbell', 'olympic lifting', 'snatch', 'complex'],
  },
  {
    id: 'strength-front-squat-emom',
    name: 'Front Squat EMOM',
    category: 'strength',
    description: 'Every minute on the minute for 10 minutes: 2 front squats. Build to heavy.',
    type: 'emom',
    timeCap: 10,
    movements: [
      { name: 'Front Squat', reps: 2, notes: 'EMOM 10, build weight each set' },
    ],
    tags: ['barbell', 'squat', 'legs', 'emom'],
  },
  {
    id: 'strength-bench-press-5x5',
    name: '5x5 Bench Press',
    category: 'strength',
    description: 'Classic 5x5 bench press with accessory work.',
    type: 'strength',
    rounds: 5,
    movements: [
      { name: 'Bench Press', reps: 5, notes: 'Same weight across all 5 sets' },
      { name: 'Strict Press', reps: 8, notes: '3 sets, moderate weight' },
    ],
    tags: ['barbell', 'pressing', 'upper body'],
  },
  {
    id: 'strength-overhead-squat',
    name: 'Overhead Squat 5x3',
    category: 'strength',
    description: '5 sets of 3 overhead squats. Build mobility and overhead strength.',
    type: 'strength',
    rounds: 5,
    movements: [
      { name: 'Overhead Squat', reps: 3, notes: 'Build to heavy triple over 5 sets' },
    ],
    tags: ['barbell', 'squat', 'mobility', 'overhead'],
  },
];

// ---------------------
// Conditioning Templates
// ---------------------

const conditioningTemplates: WorkoutTemplate[] = [
  {
    id: 'conditioning-assault-bike',
    name: 'Assault Bike Intervals',
    category: 'conditioning',
    description: '10 rounds of 20 seconds max effort, 40 seconds rest on the assault bike.',
    type: 'custom',
    rounds: 10,
    movements: [
      { name: 'Assault Bike', duration: '20 sec on / 40 sec off', notes: 'Max calories each round' },
    ],
    tags: ['bike', 'intervals', 'cardio', 'conditioning'],
  },
  {
    id: 'conditioning-row-sprint',
    name: '500m Row Repeats',
    category: 'conditioning',
    description: '5 rounds of 500m row with 2 minutes rest between intervals.',
    type: 'custom',
    rounds: 5,
    movements: [
      { name: 'Row', distance: '500m', notes: '2 min rest between intervals' },
    ],
    tags: ['rowing', 'intervals', 'cardio'],
  },
  {
    id: 'conditioning-chipper',
    name: 'The Chipper',
    category: 'conditioning',
    description: 'A long chipper-style workout hitting every modality.',
    type: 'for_time',
    movements: [
      { name: 'Calorie Row', reps: 50 },
      { name: 'Box Jumps', reps: 40, notes: '24/20 in' },
      { name: 'Kettlebell Swings', reps: 30, weight: '53/35 lb' },
      { name: 'Toes-to-Bar', reps: 20 },
      { name: 'Thrusters', reps: 10, weight: '135/95 lb' },
    ],
    tags: ['chipper', 'mixed modal', 'long'],
  },
  {
    id: 'conditioning-burpee-ladder',
    name: 'Burpee Box Jump Ladder',
    category: 'conditioning',
    description: 'Ascending ladder of burpee box jump overs. 1-2-3-4...until you can\'t complete a round in 1 minute.',
    type: 'emom',
    movements: [
      { name: 'Burpee Box Jump Over', reps: '1-2-3-4-5...', notes: 'Add 1 rep per minute until failure, 24/20 in box' },
    ],
    tags: ['burpees', 'box jumps', 'emom', 'ladder'],
  },
  {
    id: 'conditioning-double-under-death',
    name: 'Double-Under Death By',
    category: 'conditioning',
    description: 'EMOM: 10 double-unders first minute, add 5 each minute until failure.',
    type: 'emom',
    movements: [
      { name: 'Double-Unders', reps: '10+5 each min', notes: 'Start at 10, add 5 each minute until you can\'t complete the reps in the minute' },
    ],
    tags: ['jump rope', 'emom', 'conditioning'],
  },
];

// ---------------------
// Gymnastics Templates
// ---------------------

const gymnasticsTemplates: WorkoutTemplate[] = [
  {
    id: 'gymnastics-muscle-up-practice',
    name: 'Muscle-Up Practice',
    category: 'gymnastics',
    description: 'EMOM 12: alternating strict and kipping muscle-up drills.',
    type: 'emom',
    timeCap: 12,
    movements: [
      { name: 'Strict Muscle-Up', reps: '1-3', notes: 'Odd minutes' },
      { name: 'Kipping Muscle-Up', reps: '2-4', notes: 'Even minutes' },
    ],
    tags: ['gymnastics', 'rings', 'skill', 'muscle-up'],
  },
  {
    id: 'gymnastics-handstand-work',
    name: 'Handstand Skill Session',
    category: 'gymnastics',
    description: 'Handstand walk, handstand push-ups, and holds for skill development.',
    type: 'custom',
    movements: [
      { name: 'Handstand Walk', distance: '25 ft', notes: '5 sets' },
      { name: 'Strict Handstand Push-Ups', reps: '5-8', notes: '4 sets' },
      { name: 'Handstand Hold', duration: '30-60 sec', notes: '3 sets, freestanding or wall' },
    ],
    tags: ['gymnastics', 'handstand', 'skill', 'upper body'],
  },
  {
    id: 'gymnastics-pull-up-party',
    name: 'Pull-Up Party',
    category: 'gymnastics',
    description: 'Mixed pull-up work to build pulling strength and kip efficiency.',
    type: 'custom',
    movements: [
      { name: 'Strict Pull-Ups', reps: 5, notes: '5 sets, add weight if possible' },
      { name: 'Kipping Pull-Ups', reps: 10, notes: '3 sets' },
      { name: 'Chest-to-Bar Pull-Ups', reps: 8, notes: '3 sets' },
      { name: 'Butterfly Pull-Ups', reps: 10, notes: '3 sets, technique focus' },
    ],
    tags: ['gymnastics', 'pull-ups', 'skill'],
  },
  {
    id: 'gymnastics-toes-to-bar-emom',
    name: 'Toes-to-Bar EMOM',
    category: 'gymnastics',
    description: 'EMOM 10: toes-to-bar with increasing difficulty.',
    type: 'emom',
    timeCap: 10,
    movements: [
      { name: 'Toes-to-Bar', reps: '5-10', notes: 'Start at 5, add reps as you go. Focus on kip efficiency.' },
    ],
    tags: ['gymnastics', 'core', 'toes-to-bar', 'emom'],
  },
];

// ---------------------
// All Built-in Templates
// ---------------------

export const BUILT_IN_TEMPLATES: WorkoutTemplate[] = [
  ...benchmarkWods,
  ...heroWods,
  ...strengthTemplates,
  ...conditioningTemplates,
  ...gymnasticsTemplates,
];

// ---------------------
// Utility Functions
// ---------------------

export function getTemplatesByCategory(category: TemplateCategory): WorkoutTemplate[] {
  return BUILT_IN_TEMPLATES.filter(t => t.category === category);
}

export function searchTemplates(
  templates: WorkoutTemplate[],
  query: string
): WorkoutTemplate[] {
  const q = query.toLowerCase().trim();
  if (!q) return templates;

  return templates.filter(t => {
    const nameMatch = t.name.toLowerCase().includes(q);
    const descMatch = t.description.toLowerCase().includes(q);
    const movementMatch = t.movements.some(m => m.name.toLowerCase().includes(q));
    const tagMatch = t.tags.some(tag => tag.toLowerCase().includes(q));
    return nameMatch || descMatch || movementMatch || tagMatch;
  });
}

export function filterTemplatesByCategory(
  templates: WorkoutTemplate[],
  category: TemplateCategory | 'all'
): WorkoutTemplate[] {
  if (category === 'all') return templates;
  return templates.filter(t => t.category === category);
}

export function getWorkoutTypeLabel(type: WorkoutType): string {
  switch (type) {
    case 'amrap': return 'AMRAP';
    case 'emom': return 'EMOM';
    case 'for_time': return 'For Time';
    case 'strength': return 'Strength';
    case 'custom': return 'Custom';
  }
}

export function getWorkoutTypeBadgeColor(type: WorkoutType): string {
  switch (type) {
    case 'amrap': return 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300';
    case 'emom': return 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300';
    case 'for_time': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
    case 'strength': return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300';
    case 'custom': return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
  }
}

export function getCategoryLabel(category: TemplateCategory): string {
  switch (category) {
    case 'benchmark': return 'Benchmark WODs';
    case 'hero': return 'Hero WODs';
    case 'strength': return 'Strength';
    case 'conditioning': return 'Conditioning';
    case 'gymnastics': return 'Gymnastics';
    case 'custom': return 'Custom';
  }
}

export function formatMovementSummary(template: WorkoutTemplate): string {
  return template.movements.map(m => {
    const parts = [m.name];
    if (m.reps) parts.push(`(${m.reps})`);
    return parts.join(' ');
  }).join(', ');
}

export function formatTemplateAsWorkoutText(template: WorkoutTemplate, scale?: Record<string, string>): string {
  const lines: string[] = [];

  // Header
  lines.push(template.name);

  // Type and time cap info
  if (template.type === 'amrap' && template.timeCap) {
    lines.push(`${template.timeCap} min AMRAP:`);
  } else if (template.type === 'emom' && template.timeCap) {
    lines.push(`EMOM ${template.timeCap} min:`);
  } else if (template.type === 'for_time') {
    if (template.rounds && template.rounds > 1) {
      lines.push(`${template.rounds} rounds for time:`);
    } else {
      lines.push('For time:');
    }
  } else if (template.type === 'strength') {
    if (template.rounds) {
      lines.push(`${template.rounds} sets:`);
    }
  }

  // Movements
  for (const m of template.movements) {
    const parts: string[] = [];
    const reps = m.reps ? String(m.reps) : '';
    const weight = scale?.[m.name] || m.weight;

    if (reps) parts.push(reps);
    parts.push(m.name);
    if (weight) parts.push(`@ ${weight}`);
    if (m.distance) parts.push(`(${m.distance})`);
    if (m.duration) parts.push(`(${m.duration})`);
    if (m.notes) parts.push(`— ${m.notes}`);

    lines.push(parts.join(' '));
  }

  return lines.join('\n');
}

export function estimateDuration(template: WorkoutTemplate): string {
  if (template.timeCap) return `${template.timeCap} min`;

  switch (template.type) {
    case 'for_time': {
      const movCount = template.movements.reduce((sum, m) => {
        const reps = typeof m.reps === 'number' ? m.reps : 30;
        return sum + reps;
      }, 0);
      const rounds = template.rounds || 1;
      const totalWork = movCount * rounds;
      if (totalWork > 500) return '30-45 min';
      if (totalWork > 200) return '15-25 min';
      if (totalWork > 80) return '8-15 min';
      return '3-8 min';
    }
    case 'strength':
      return '20-30 min';
    default:
      return '10-20 min';
  }
}

export function validateTemplate(template: Partial<WorkoutTemplate>): string[] {
  const errors: string[] = [];

  if (!template.name?.trim()) {
    errors.push('Template name is required');
  }
  if (!template.type) {
    errors.push('Workout type is required');
  }
  if (!template.movements || template.movements.length === 0) {
    errors.push('At least one movement is required');
  }
  if (template.movements) {
    template.movements.forEach((m, i) => {
      if (!m.name?.trim()) {
        errors.push(`Movement ${i + 1} needs a name`);
      }
    });
  }
  if (template.timeCap !== undefined && template.timeCap !== null) {
    if (template.timeCap <= 0 || template.timeCap > 120) {
      errors.push('Time cap must be between 1 and 120 minutes');
    }
  }
  if (template.rounds !== undefined && template.rounds !== null) {
    if (template.rounds <= 0 || template.rounds > 100) {
      errors.push('Rounds must be between 1 and 100');
    }
  }

  return errors;
}
