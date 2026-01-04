# Authentication and Onboarding Design

## Architecture Overview

The authentication system follows SociusFit's mobile-first principles with Supabase as the authentication provider. The design integrates seamlessly with existing workout and nutrition features while providing a smooth onboarding experience for new users.

## Component Architecture

### Authentication Flow
```
User Registration → Supabase Auth → Profile Creation → Onboarding → Dashboard
User Sign In → Supabase Auth → Session Establishment → Dashboard
```

### Component Hierarchy
```
AuthProvider (Context)
├── SignUpPage
│   ├── SignUpForm
│   └── AuthLayout
├── SignInPage
│   ├── SignInForm
│   └── AuthLayout
├── OnboardingPage
│   ├── ProfileSetupForm
│   ├── GoalsSelection
│   └── TargetSetup
└── ProfilePage
    ├── ProfileManager
    └── BodyMetricsForm
```

## Database Design

### User Profiles Table (Already Exists)
The existing `user_profiles` table from the cross-domain migration supports the authentication system:

```sql
CREATE TABLE user_profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id),
  fitness_goals JSONB DEFAULT '[]'::jsonb,
  activity_level TEXT DEFAULT 'moderately_active',
  body_metrics JSONB DEFAULT '{}'::jsonb,
  preferences JSONB DEFAULT '{}'::jsonb,
  medical_conditions JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Body Metrics Schema
```typescript
interface BodyMetrics {
  height_cm?: number;
  weight_kg?: number;
  age?: number;
  gender?: 'male' | 'female' | 'other';
  body_fat_pct?: number;
}
```

### Preferences Schema
```typescript
interface UserPreferences {
  units: 'metric' | 'imperial';
  notifications: boolean;
  privacy_level: 'private' | 'friends' | 'public';
  theme?: 'light' | 'dark' | 'system';
}
```

## API Design

### Authentication Endpoints

#### POST /api/auth/signup
```typescript
interface SignUpRequest {
  email: string;
  password: string;
  confirmPassword: string;
}

interface SignUpResponse {
  user: User;
  session: Session;
  profile: UserProfile;
}
```

#### POST /api/auth/signin
```typescript
interface SignInRequest {
  email: string;
  password: string;
}

interface SignInResponse {
  user: User;
  session: Session;
  profile?: UserProfile;
}
```

#### POST /api/auth/signout
```typescript
interface SignOutResponse {
  success: boolean;
}
```

### Profile Management Endpoints

#### GET /api/profile
```typescript
interface ProfileResponse {
  profile: UserProfile;
  hasCompletedOnboarding: boolean;
}
```

#### PUT /api/profile
```typescript
interface UpdateProfileRequest {
  fitness_goals?: string[];
  activity_level?: string;
  body_metrics?: BodyMetrics;
  preferences?: UserPreferences;
}

interface UpdateProfileResponse {
  profile: UserProfile;
}
```

#### POST /api/profile/onboarding
```typescript
interface OnboardingRequest {
  body_metrics: BodyMetrics;
  fitness_goals: string[];
  activity_level: string;
  preferences: UserPreferences;
  initial_targets?: {
    protein: number;
    carbs: number;
    fat: number;
    calories: number;
  };
}

interface OnboardingResponse {
  profile: UserProfile;
  targets?: DailyTargets;
}
```

## UI/UX Design

### Mobile-First Form Design

All authentication forms follow these principles:
- Minimum 44px touch targets
- Vertical stacking for mobile screens
- Clear visual hierarchy with proper spacing
- Support for both light and dark modes
- Accessible form labels and error messages

### Form Layout Pattern
```tsx
<div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
  <div className="w-full max-w-md space-y-6">
    <div className="text-center">
      <h1 className="text-2xl font-bold">Welcome to SociusFit</h1>
      <p className="text-gray-600 dark:text-gray-400">Your holistic fitness companion</p>
    </div>
    
    <form className="space-y-4">
      {/* Form fields with proper spacing and touch targets */}
    </form>
    
    <div className="text-center">
      {/* Alternative actions (sign up/sign in links) */}
    </div>
  </div>
</div>
```

### Input Field Design
```tsx
<div className="space-y-1">
  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
    Email Address
  </label>
  <input
    type="email"
    className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg 
               focus:ring-2 focus:ring-blue-500 focus:border-blue-500 
               bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 
               text-base touch-target"
    placeholder="your@email.com"
  />
  {error && (
    <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
  )}
</div>
```

## Authentication Context

### AuthProvider Implementation
```typescript
interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  signUp: (email: string, password: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  updateProfile: (updates: Partial<UserProfile>) => Promise<void>;
  hasCompletedOnboarding: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
```

### Session Management
- Use Supabase's built-in session management
- Persist sessions across app restarts
- Handle session expiration gracefully
- Provide loading states during auth checks

## Onboarding Flow

### Step 1: Welcome Screen
- Explain SociusFit's holistic approach
- Highlight workout + nutrition integration
- Set expectations for setup process

### Step 2: Body Metrics Collection
```typescript
interface BodyMetricsForm {
  height: number; // cm or inches based on preference
  weight: number; // kg or lbs based on preference
  age: number;
  gender: 'male' | 'female' | 'other';
  units: 'metric' | 'imperial';
}
```

### Step 3: Fitness Goals Selection
```typescript
const FITNESS_GOALS = [
  { id: 'weight_loss', label: 'Weight Loss', icon: '📉' },
  { id: 'muscle_gain', label: 'Muscle Gain', icon: '💪' },
  { id: 'performance', label: 'Athletic Performance', icon: '🏃' },
  { id: 'general_health', label: 'General Health', icon: '❤️' }
];
```

### Step 4: Activity Level Selection
```typescript
const ACTIVITY_LEVELS = [
  { id: 'sedentary', label: 'Sedentary', description: 'Little to no exercise' },
  { id: 'lightly_active', label: 'Lightly Active', description: '1-3 days per week' },
  { id: 'moderately_active', label: 'Moderately Active', description: '3-5 days per week' },
  { id: 'very_active', label: 'Very Active', description: '6-7 days per week' },
  { id: 'extremely_active', label: 'Extremely Active', description: '2x per day or intense training' }
];
```

### Step 5: Initial Target Setup (Optional)
- Calculate suggested targets based on profile
- Allow users to customize or skip
- Explain how targets work with tolerance

## Integration with Existing Features

### Workout Tracking Integration
- Replace hardcoded `userId` with authenticated user ID
- Update workout API calls to use `auth.uid()`
- Maintain existing workout data structure

### Food Tracking Integration
- Update meal logging to use authenticated user
- Associate targets with authenticated user
- Preserve existing meal data structure

### Dashboard Integration
- Personalize dashboard based on user profile
- Show progress relative to user's fitness goals
- Display recommendations based on activity level

## Error Handling

### Authentication Errors
```typescript
const AUTH_ERRORS = {
  'invalid-email': 'Please enter a valid email address',
  'weak-password': 'Password must be at least 8 characters long',
  'email-already-in-use': 'An account with this email already exists',
  'user-not-found': 'No account found with this email',
  'wrong-password': 'Incorrect password',
  'too-many-requests': 'Too many failed attempts. Please try again later'
};
```

### Form Validation
- Real-time validation for email format
- Password strength indicators
- Required field validation
- Numeric input validation for body metrics

### Network Error Handling
- Retry mechanisms for failed requests
- Offline state detection
- Clear error messages with suggested actions

## Security Considerations

### Authentication Security
- Use Supabase's secure authentication
- Implement proper session management
- Handle password reset flows
- Protect against common attacks (CSRF, XSS)

### Data Privacy
- Apply RLS policies to user_profiles table
- Ensure users can only access their own data
- Implement proper data validation
- Follow GDPR compliance principles

### API Security
- Validate all inputs server-side
- Use proper HTTP status codes
- Implement rate limiting
- Log security events for monitoring

## Testing Strategy

### Unit Tests
- Form validation logic
- Authentication context functions
- Profile data transformations
- Error handling scenarios

### Integration Tests
- Complete authentication flows
- Profile creation and updates
- Onboarding process completion
- Data integration with existing features

### Mobile Testing
- Touch target accessibility
- Form usability on various screen sizes
- Keyboard navigation support
- Screen reader compatibility

## Performance Considerations

### Loading States
- Show loading indicators during auth operations
- Implement skeleton screens for profile data
- Optimize image loading for profile pictures
- Cache user profile data appropriately

### Bundle Size
- Code split authentication components
- Lazy load onboarding screens
- Optimize form validation libraries
- Minimize authentication bundle impact

## Deployment Considerations

### Environment Variables
```
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
```

### Database Migrations
- User profiles table already exists
- RLS policies already configured
- No additional migrations required

### Feature Flags
- Gradual rollout of authentication
- A/B testing for onboarding flow
- Fallback to existing test user mode
- Progressive enhancement approach