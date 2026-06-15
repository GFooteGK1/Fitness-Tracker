import { User, Session } from '@supabase/auth-helpers-nextjs'

// User profile types
export interface BodyMetrics {
  height_cm?: number
  weight_kg?: number
  age?: number
  gender?: 'male' | 'female' | 'other'
  body_fat_pct?: number
}

export interface UserPreferences {
  units: 'metric' | 'imperial'
  notifications: boolean
  privacy_level: 'private' | 'friends' | 'public'
  theme?: 'light' | 'dark' | 'system'
}

export interface UserProfile {
  userId: string
  fitnessGoals: string[]
  activityLevel: 'sedentary' | 'lightly_active' | 'moderately_active' | 'very_active' | 'extremely_active'
  bodyMetrics: BodyMetrics
  preferences: UserPreferences
  medicalConditions: string[]
  createdAt: Date
  updatedAt: Date
}

// Authentication context types
export interface AuthContextType {
  user: User | null
  profile: UserProfile | null
  session: Session | null
  loading: boolean
  whoopConnected: boolean
  whoopTokensValid: boolean
  signUp: (email: string, password: string) => Promise<any>
  signIn: (email: string, password: string) => Promise<any>
  signOut: () => Promise<void>
  updateProfile: (updates: Partial<UserProfile>) => Promise<UserProfile>
  refreshProfile: () => Promise<UserProfile | null>
  hasCompletedOnboarding: boolean
  initializeWhoopConnection: () => Promise<void>
  refreshWhoopTokens: () => Promise<void>
  disconnectWhoop: () => Promise<void>
}

// API request/response types
export interface SignUpRequest {
  email: string
  password: string
  confirmPassword: string
}

export interface SignInRequest {
  email: string
  password: string
}

export interface OnboardingRequest {
  body_metrics: BodyMetrics
  fitness_goals: string[]
  activity_level: string
  preferences: UserPreferences
  initial_targets?: {
    protein: number
    carbs: number
    fat: number
    calories: number
  }
}

// Fitness goals and activity levels
export const FITNESS_GOALS = [
  { id: 'weight_loss', label: 'Weight Loss', icon: '📉', description: 'Lose weight and improve body composition' },
  { id: 'muscle_gain', label: 'Muscle Gain', icon: '💪', description: 'Build muscle mass and strength' },
  { id: 'performance', label: 'Athletic Performance', icon: '🏃', description: 'Improve athletic performance and endurance' },
  { id: 'general_health', label: 'General Health', icon: '❤️', description: 'Maintain overall health and wellness' }
] as const

export const ACTIVITY_LEVELS = [
  { 
    id: 'sedentary', 
    label: 'Sedentary', 
    description: 'Little to no exercise',
    multiplier: 1.2 
  },
  { 
    id: 'lightly_active', 
    label: 'Lightly Active', 
    description: '1-3 days per week',
    multiplier: 1.375 
  },
  { 
    id: 'moderately_active', 
    label: 'Moderately Active', 
    description: '3-5 days per week',
    multiplier: 1.55 
  },
  { 
    id: 'very_active', 
    label: 'Very Active', 
    description: '6-7 days per week',
    multiplier: 1.725 
  },
  { 
    id: 'extremely_active', 
    label: 'Extremely Active', 
    description: '2x per day or intense training',
    multiplier: 1.9 
  }
] as const

// Form validation types
export interface FormErrors {
  email?: string
  password?: string
  confirmPassword?: string
  general?: string
}

export interface ProfileFormErrors {
  height?: string
  weight?: string
  age?: string
  gender?: string
  goals?: string
  activityLevel?: string
}

// Utility types for database operations
export interface DatabaseUserProfile {
  user_id: string
  fitness_goals: string[]
  activity_level: string
  body_metrics: Record<string, any>
  preferences: Record<string, any>
  medical_conditions: string[]
  created_at: string
  updated_at: string
}
