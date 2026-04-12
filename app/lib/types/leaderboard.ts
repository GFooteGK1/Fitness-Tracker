// Leaderboard group (a gym/box)
export interface LeaderboardGroup {
  id: string
  name: string
  invite_code: string
  created_by: string
  created_at: string
  member_count?: number
}

// Group membership
export interface GroupMembership {
  id: string
  group_id: string
  user_id: string
  display_name: string
  privacy_level: PrivacyLevel
  joined_at: string
}

// Privacy levels for sharing workout data
export type PrivacyLevel = 'all' | 'benchmarks' | 'manual'

// Ranking entry in a leaderboard
export interface RankingEntry {
  rank: number
  user_id: string
  user_display_name: string
  value: number
  value_display: string
  date_achieved: string
  improvement?: number
  is_current_user: boolean
}

// Supported ranking metrics
export type RankingMetric = 'weight' | 'reps' | 'volume' | 'time'

// Supported time periods
export type RankingPeriod = 'week' | 'month' | 'all'

// Rankings API response
export interface RankingsResponse {
  exercise: string
  period: RankingPeriod
  metric: RankingMetric
  rankings: RankingEntry[]
  total_members: number
  current_user_rank?: number
}

// Available exercises for the group (derived from member workout data)
export interface GroupExercise {
  name: string
  count: number
}

// Group detail with members
export interface GroupDetail extends LeaderboardGroup {
  members: GroupMember[]
}

// Simplified member info for group detail
export interface GroupMember {
  user_id: string
  display_name: string
  joined_at: string
  is_creator: boolean
}

// Dashboard widget data
export interface LeaderboardWidgetData {
  group_id: string
  group_name: string
  exercise: string
  rank: number
  total_members: number
  value_display: string
}
