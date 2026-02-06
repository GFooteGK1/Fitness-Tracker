# Design Document: Production Testing Strategy

## Overview

This design provides a comprehensive strategy for safely deploying and validating the partially-complete authentication fixes in SociusFit's production environment. The authentication fixes address three critical issues (session caching, sign-out failure, WHOOP token persistence) but are only 3 of 13 tasks complete, with foundational services built but not yet integrated into the application.

The strategy focuses on:
1. **Risk-based decision making** - Understanding what can and cannot be safely tested in production
2. **Incremental deployment** - Using feature flags to enable components progressively
3. **Comprehensive monitoring** - Real-time detection of authentication failures
4. **Quick rollback** - Ability to revert changes within minutes if issues occur
5. **Data protection** - Ensuring no user data loss during authentication failures

## Architecture

### Current State

```
Production Environment (Stable)
├─ Authentication: Basic Supabase auth (working)
├─ Sign-out: Partial cleanup (Issue #2)
├─ Session: Inconsistent caching (Issue #1)
└─ WHOOP: No token persistence (Issue #3)

Development Branch (Partially Complete)
├─ CookieManager ✅ (tested, not integrated)
├─ SessionCleanupService ✅ (tested, not integrated)
├─ WhoopTokenService ✅ (tested, not integrated)
└─ AuthContext ❌ (not updated - critical blocker)
```

### Deployment Architecture

```
Feature Flag System
├─ Flag: auth_enhanced_cleanup (SessionCleanupService)
├─ Flag: auth_whoop_persistence (WHOOP token initialization)
├─ Flag: auth_cookie_manager (Enhanced cookie handling)
└─ Flag: auth_session_sync (Cross-tab synchronization)

Monitoring Layer
├─ Authentication metrics (success/failure rates)
├─ WHOOP connection metrics (token refresh, persistence)
├─ Sign-out metrics (cleanup completion)
└─ Error tracking (detailed failure logs)

Rollback Mechanism
├─ Feature flag disable (instant)
├─ Vercel deployment rollback (2-3 minutes)
└─ Database state verification
```

### Risk Levels

**Critical Risk (Do Not Deploy Without Full Testing)**:
- Database schema changes
- RLS policy modifications
- Token encryption key changes

**High Risk (Deploy with Feature Flags)**:
- AuthContext integration (affects all authentication)
- SessionCleanupService integration (affects sign-out)
- WHOOP token initialization (affects WHOOP users)

**Medium Risk (Deploy with Monitoring)**:
- Cookie configuration changes
- Error logging enhancements
- UI component updates

**Low Risk (Safe to Deploy)**:
- Utility functions (CookieManager, if not integrated)
- Test files
- Documentation updates

## Components and Interfaces

### 1. Feature Flag Service

**Purpose**: Enable/disable authentication components without redeployment

```typescript
interface FeatureFlagConfig {
  auth_enhanced_cleanup: boolean;
  auth_whoop_persistence: boolean;
  auth_cookie_manager: boolean;
  auth_session_sync: boolean;
}

interface FeatureFlagService {
  // Check if feature is enabled for current user
  isEnabled(flagName: keyof FeatureFlagConfig): boolean;
  
  // Check if feature is enabled for specific user (for testing)
  isEnabledForUser(flagName: keyof FeatureFlagConfig, userId: string): boolean;
  
  // Get all flag states
  getAllFlags(): FeatureFlagConfig;
  
  // Enable feature for specific test users
  enableForUsers(flagName: keyof FeatureFlagConfig, userIds: string[]): void;
}
```

**Implementation Options**:
1. **Simple Environment Variables** (recommended for MVP):
   - `NEXT_PUBLIC_FEATURE_AUTH_ENHANCED_CLEANUP=false`
   - Quick to implement, requires redeployment to change
   
2. **Vercel Edge Config** (recommended for production):
   - Real-time flag updates without redeployment
   - Free tier available
   - Simple API integration

3. **LaunchDarkly / Split.io** (enterprise option):
   - Advanced targeting and rollout controls
   - Additional cost

**Recommended Approach**: Start with environment variables for initial testing, migrate to Vercel Edge Config for phased rollout.

### 2. Authentication Monitoring Service

**Purpose**: Track authentication metrics and detect failures

```typescript
interface AuthMetrics {
  signInAttempts: number;
  signInSuccesses: number;
  signInFailures: number;
  signOutAttempts: number;
  signOutSuccesses: number;
  signOutFailures: number;
  sessionRestorations: number;
  sessionRestorationFailures: number;
  whoopConnectionAttempts: number;
  whoopConnectionSuccesses: number;
  whoopTokenRefreshes: number;
  whoopTokenRefreshFailures: number;
}

interface AuthMonitoringService {
  // Track authentication event
  trackEvent(event: AuthEvent): void;
  
  // Get current metrics
  getMetrics(timeWindow: TimeWindow): AuthMetrics;
  
  // Check if failure rate exceeds threshold
  isFailureRateHigh(metric: keyof AuthMetrics, threshold: number): boolean;
  
  // Log detailed error for investigation
  logAuthError(error: AuthError): void;
}

interface AuthEvent {
  type: 'sign_in' | 'sign_out' | 'session_restore' | 'whoop_connect' | 'whoop_refresh';
  success: boolean;
  userId?: string;
  error?: Error;
  metadata?: Record<string, any>;
  timestamp: Date;
}

interface AuthError {
  type: string;
  message: string;
  userId?: string;
  sessionId?: string;
  browser: string;
  component: string;
  stack?: string;
  context: Record<string, any>;
}
```

**Implementation**:
- Use Vercel Analytics for basic metrics
- Use Sentry or LogRocket for detailed error tracking
- Store metrics in Supabase for historical analysis
- Create real-time dashboard using Vercel Analytics API

### 3. Risk Assessment Matrix

**Purpose**: Categorize changes by risk level and testing requirements

```typescript
interface RiskAssessment {
  component: string;
  riskLevel: 'critical' | 'high' | 'medium' | 'low';
  userImpact: 'all_users' | 'whoop_users' | 'active_sessions' | 'none';
  dataIntegrityRisk: boolean;
  reversible: boolean;
  requiresProductionTesting: boolean;
  dependencies: string[];
  testingStrategy: string;
}

const authenticationFixesRiskAssessment: RiskAssessment[] = [
  {
    component: 'SessionCleanupService',
    riskLevel: 'high',
    userImpact: 'active_sessions',
    dataIntegrityRisk: false,
    reversible: true,
    requiresProductionTesting: true,
    dependencies: ['CookieManager', 'AuthContext'],
    testingStrategy: 'Feature flag with test users, monitor sign-out completion'
  },
  {
    component: 'WHOOP Token Initialization',
    riskLevel: 'high',
    userImpact: 'whoop_users',
    dataIntegrityRisk: false,
    reversible: true,
    requiresProductionTesting: true,
    dependencies: ['WhoopTokenService', 'AuthContext'],
    testingStrategy: 'Feature flag with WHOOP users, monitor token persistence'
  },
  {
    component: 'CookieManager',
    riskLevel: 'medium',
    userImpact: 'all_users',
    dataIntegrityRisk: false,
    reversible: true,
    requiresProductionTesting: true,
    dependencies: [],
    testingStrategy: 'Deploy with monitoring, verify cookie attributes'
  },
  {
    component: 'Session Synchronization',
    riskLevel: 'medium',
    userImpact: 'all_users',
    dataIntegrityRisk: false,
    reversible: true,
    requiresProductionTesting: true,
    dependencies: ['AuthContext'],
    testingStrategy: 'Feature flag, test cross-tab behavior manually'
  },
  {
    component: 'Error Logging',
    riskLevel: 'low',
    userImpact: 'none',
    dataIntegrityRisk: false,
    reversible: true,
    requiresProductionTesting: false,
    dependencies: [],
    testingStrategy: 'Deploy directly, verify logs appear'
  }
];
```

### 4. Phased Rollout Plan

**Purpose**: Gradually expose changes to users with defined stages

```typescript
interface RolloutStage {
  stage: number;
  name: string;
  userPercentage: number;
  duration: string;
  successCriteria: string[];
  monitoringMetrics: string[];
  rollbackTriggers: string[];
}

const rolloutPlan: RolloutStage[] = [
  {
    stage: 0,
    name: 'Developer Testing',
    userPercentage: 0,
    duration: '1-2 hours',
    successCriteria: [
      'All manual tests pass',
      'No console errors',
      'Sign-out clears all storage',
      'WHOOP persists across sessions'
    ],
    monitoringMetrics: ['error_logs', 'console_warnings'],
    rollbackTriggers: ['Any critical error', 'Data loss detected']
  },
  {
    stage: 1,
    name: 'Internal Testing (Test Accounts)',
    userPercentage: 0,
    duration: '4-8 hours',
    successCriteria: [
      'Test accounts can sign in/out successfully',
      'WHOOP connection works for test accounts',
      'No authentication errors in logs',
      'Session persistence works correctly'
    ],
    monitoringMetrics: [
      'sign_in_success_rate',
      'sign_out_success_rate',
      'whoop_connection_success_rate',
      'error_count'
    ],
    rollbackTriggers: [
      'Sign-in failure rate > 5%',
      'Sign-out failure rate > 10%',
      'Any data integrity issues'
    ]
  },
  {
    stage: 2,
    name: 'Limited Rollout (10% of users)',
    userPercentage: 10,
    duration: '24 hours',
    successCriteria: [
      'Authentication success rate >= 95%',
      'Sign-out success rate >= 90%',
      'WHOOP persistence rate >= 90%',
      'No user-reported critical issues'
    ],
    monitoringMetrics: [
      'sign_in_success_rate',
      'sign_out_success_rate',
      'session_restoration_rate',
      'whoop_token_refresh_rate',
      'user_reported_issues'
    ],
    rollbackTriggers: [
      'Authentication failure rate > 10%',
      'Multiple user reports of data loss',
      'WHOOP disconnection rate > 20%'
    ]
  },
  {
    stage: 3,
    name: 'Expanded Rollout (50% of users)',
    userPercentage: 50,
    duration: '48 hours',
    successCriteria: [
      'Authentication success rate >= 98%',
      'Sign-out success rate >= 95%',
      'WHOOP persistence rate >= 95%',
      'User satisfaction maintained'
    ],
    monitoringMetrics: [
      'all_auth_metrics',
      'user_feedback',
      'support_ticket_volume'
    ],
    rollbackTriggers: [
      'Authentication failure rate > 5%',
      'Significant increase in support tickets',
      'User satisfaction decline'
    ]
  },
  {
    stage: 4,
    name: 'Full Rollout (100% of users)',
    userPercentage: 100,
    duration: 'Ongoing',
    successCriteria: [
      'All metrics stable',
      'No increase in error rates',
      'User feedback positive'
    ],
    monitoringMetrics: ['all_auth_metrics', 'long_term_trends'],
    rollbackTriggers: ['Unexpected critical issues']
  }
];
```

### 5. Production Testing Checklist

**Purpose**: Structured manual testing in production environment

```typescript
interface TestCase {
  id: string;
  category: 'sign_in' | 'sign_out' | 'session' | 'whoop' | 'cross_browser';
  description: string;
  steps: string[];
  expectedResult: string;
  actualResult?: string;
  status?: 'pass' | 'fail' | 'skip';
  browser?: string;
  notes?: string;
}

const productionTestCases: TestCase[] = [
  {
    id: 'AUTH-001',
    category: 'sign_in',
    description: 'Sign in with valid credentials',
    steps: [
      'Navigate to /auth/signin',
      'Enter valid email and password',
      'Click "Sign In"',
      'Verify redirect to dashboard'
    ],
    expectedResult: 'User successfully signed in and redirected to dashboard'
  },
  {
    id: 'AUTH-002',
    category: 'sign_out',
    description: 'Sign out clears all session data (Chrome)',
    steps: [
      'Sign in to application',
      'Open DevTools → Application → Cookies',
      'Note all auth-related cookies',
      'Click "Sign Out"',
      'Check DevTools → Cookies (should be empty)',
      'Check DevTools → Local Storage (should be empty)',
      'Check DevTools → Session Storage (should be empty)',
      'Try browser back button'
    ],
    expectedResult: 'All cookies cleared, all storage cleared, back button redirects to login',
    browser: 'Chrome'
  },
  {
    id: 'AUTH-003',
    category: 'sign_out',
    description: 'Sign out clears all session data (Firefox)',
    steps: ['Same as AUTH-002'],
    expectedResult: 'Same as AUTH-002',
    browser: 'Firefox'
  },
  {
    id: 'AUTH-004',
    category: 'sign_out',
    description: 'Sign out clears all session data (Safari)',
    steps: ['Same as AUTH-002'],
    expectedResult: 'Same as AUTH-002',
    browser: 'Safari'
  },
  {
    id: 'AUTH-005',
    category: 'session',
    description: 'Session persists across browser restart',
    steps: [
      'Sign in to application',
      'Close all browser windows',
      'Reopen browser',
      'Navigate to application',
      'Verify still signed in'
    ],
    expectedResult: 'User remains signed in without re-authentication'
  },
  {
    id: 'AUTH-006',
    category: 'session',
    description: 'Session works in incognito mode',
    steps: [
      'Open incognito/private window',
      'Sign in to application',
      'Navigate to different pages',
      'Verify authentication persists'
    ],
    expectedResult: 'Authentication works identically to regular mode'
  },
  {
    id: 'AUTH-007',
    category: 'whoop',
    description: 'WHOOP connection persists across sessions',
    steps: [
      'Sign in to application',
      'Connect WHOOP account',
      'Verify WHOOP data appears',
      'Sign out',
      'Sign back in',
      'Verify WHOOP still connected (no re-auth prompt)'
    ],
    expectedResult: 'WHOOP connection persists, data loads without re-authentication'
  },
  {
    id: 'AUTH-008',
    category: 'whoop',
    description: 'WHOOP token refresh works automatically',
    steps: [
      'Sign in with connected WHOOP account',
      'Wait for token to expire (or manually expire in DB)',
      'Trigger WHOOP data fetch',
      'Verify data loads successfully'
    ],
    expectedResult: 'Token automatically refreshed, data loads without user intervention'
  },
  {
    id: 'AUTH-009',
    category: 'cross_browser',
    description: 'Cross-tab session synchronization',
    steps: [
      'Sign in to application in Tab 1',
      'Open Tab 2 to same application',
      'Verify Tab 2 shows signed-in state',
      'Sign out in Tab 1',
      'Check Tab 2 (should also sign out)'
    ],
    expectedResult: 'Session state synchronized across tabs'
  },
  {
    id: 'AUTH-010',
    category: 'session',
    description: 'Stale session detection',
    steps: [
      'Sign in to application',
      'Manually invalidate session in Supabase dashboard',
      'Try to access protected route',
      'Verify redirect to login'
    ],
    expectedResult: 'Stale session detected, user redirected to login'
  }
];
```

### 6. Rollback Procedure

**Purpose**: Quick reversion to stable state if issues occur

```typescript
interface RollbackProcedure {
  trigger: string;
  steps: RollbackStep[];
  maxDuration: string;
  verificationSteps: string[];
  dataPreservation: string[];
}

interface RollbackStep {
  order: number;
  action: string;
  command?: string;
  expectedDuration: string;
  verification: string;
}

const rollbackProcedure: RollbackProcedure = {
  trigger: 'Authentication failure rate > 10% OR critical data loss detected',
  maxDuration: '5 minutes',
  steps: [
    {
      order: 1,
      action: 'Disable feature flags immediately',
      command: 'Set all auth_* flags to false in Vercel Edge Config',
      expectedDuration: '30 seconds',
      verification: 'Verify flags disabled in Edge Config dashboard'
    },
    {
      order: 2,
      action: 'Rollback Vercel deployment',
      command: 'vercel rollback --yes',
      expectedDuration: '2-3 minutes',
      verification: 'Verify previous deployment is active'
    },
    {
      order: 3,
      action: 'Clear CDN cache',
      command: 'Vercel automatically clears cache on rollback',
      expectedDuration: '1 minute',
      verification: 'Test authentication flow works'
    },
    {
      order: 4,
      action: 'Verify database state',
      command: 'Check whoop_tokens table for data integrity',
      expectedDuration: '1 minute',
      verification: 'No missing or corrupted token records'
    },
    {
      order: 5,
      action: 'Monitor authentication metrics',
      command: 'Watch dashboard for 10 minutes',
      expectedDuration: '10 minutes',
      verification: 'Authentication success rate returns to baseline'
    }
  ],
  verificationSteps: [
    'Test sign-in with test account',
    'Test sign-out with test account',
    'Verify WHOOP connections still work',
    'Check error logs for new issues',
    'Verify no user data loss'
  ],
  dataPreservation: [
    'Database backups taken before deployment',
    'WHOOP tokens remain encrypted in database',
    'User workout and nutrition data unaffected',
    'Session data can be restored from cookies'
  ]
};
```

### 7. Monitoring Dashboard Configuration

**Purpose**: Real-time visibility into authentication health

```typescript
interface MonitoringDashboard {
  metrics: DashboardMetric[];
  alerts: AlertConfig[];
  refreshInterval: string;
}

interface DashboardMetric {
  name: string;
  query: string;
  visualization: 'line' | 'bar' | 'number' | 'gauge';
  threshold?: {
    warning: number;
    critical: number;
  };
}

interface AlertConfig {
  name: string;
  condition: string;
  severity: 'info' | 'warning' | 'critical';
  notification: string[];
}

const monitoringDashboard: MonitoringDashboard = {
  refreshInterval: '1 minute',
  metrics: [
    {
      name: 'Authentication Success Rate',
      query: 'SELECT (sign_in_successes / sign_in_attempts) * 100 FROM auth_metrics WHERE timestamp > NOW() - INTERVAL \'1 hour\'',
      visualization: 'gauge',
      threshold: {
        warning: 95,
        critical: 90
      }
    },
    {
      name: 'Sign-Out Completion Rate',
      query: 'SELECT (sign_out_successes / sign_out_attempts) * 100 FROM auth_metrics WHERE timestamp > NOW() - INTERVAL \'1 hour\'',
      visualization: 'gauge',
      threshold: {
        warning: 90,
        critical: 85
      }
    },
    {
      name: 'WHOOP Token Refresh Success Rate',
      query: 'SELECT (whoop_token_refreshes / (whoop_token_refreshes + whoop_token_refresh_failures)) * 100 FROM auth_metrics WHERE timestamp > NOW() - INTERVAL \'1 hour\'',
      visualization: 'gauge',
      threshold: {
        warning: 95,
        critical: 90
      }
    },
    {
      name: 'Session Restoration Success Rate',
      query: 'SELECT (session_restorations / (session_restorations + session_restoration_failures)) * 100 FROM auth_metrics WHERE timestamp > NOW() - INTERVAL \'1 hour\'',
      visualization: 'gauge',
      threshold: {
        warning: 95,
        critical: 90
      }
    },
    {
      name: 'Authentication Errors (Last Hour)',
      query: 'SELECT COUNT(*) FROM auth_errors WHERE timestamp > NOW() - INTERVAL \'1 hour\'',
      visualization: 'number',
      threshold: {
        warning: 10,
        critical: 50
      }
    }
  ],
  alerts: [
    {
      name: 'High Authentication Failure Rate',
      condition: 'authentication_success_rate < 90',
      severity: 'critical',
      notification: ['email', 'slack']
    },
    {
      name: 'WHOOP Token Refresh Failures',
      condition: 'whoop_token_refresh_failures > 10 in 1 hour',
      severity: 'warning',
      notification: ['slack']
    },
    {
      name: 'Sign-Out Failures',
      condition: 'sign_out_failures > 5 in 1 hour',
      severity: 'warning',
      notification: ['slack']
    }
  ]
};
```

## Data Models

### Authentication Metrics Table

```sql
CREATE TABLE auth_metrics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Sign-in metrics
  sign_in_attempts INTEGER DEFAULT 0,
  sign_in_successes INTEGER DEFAULT 0,
  sign_in_failures INTEGER DEFAULT 0,
  
  -- Sign-out metrics
  sign_out_attempts INTEGER DEFAULT 0,
  sign_out_successes INTEGER DEFAULT 0,
  sign_out_failures INTEGER DEFAULT 0,
  
  -- Session metrics
  session_restorations INTEGER DEFAULT 0,
  session_restoration_failures INTEGER DEFAULT 0,
  
  -- WHOOP metrics
  whoop_connection_attempts INTEGER DEFAULT 0,
  whoop_connection_successes INTEGER DEFAULT 0,
  whoop_token_refreshes INTEGER DEFAULT 0,
  whoop_token_refresh_failures INTEGER DEFAULT 0,
  
  -- Aggregation period
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  
  CONSTRAINT valid_period CHECK (period_end > period_start)
);

CREATE INDEX idx_auth_metrics_timestamp ON auth_metrics(timestamp DESC);
CREATE INDEX idx_auth_metrics_period ON auth_metrics(period_start, period_end);
```

### Authentication Errors Table

```sql
CREATE TABLE auth_errors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Error details
  error_type TEXT NOT NULL,
  error_message TEXT NOT NULL,
  error_stack TEXT,
  
  -- Context
  user_id UUID REFERENCES auth.users(id),
  session_id TEXT,
  component TEXT NOT NULL,
  browser TEXT,
  
  -- Additional context
  metadata JSONB,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_auth_errors_timestamp ON auth_errors(timestamp DESC);
CREATE INDEX idx_auth_errors_type ON auth_errors(error_type);
CREATE INDEX idx_auth_errors_user ON auth_errors(user_id);
```

### Feature Flags Table (Optional)

```sql
CREATE TABLE feature_flags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  flag_name TEXT UNIQUE NOT NULL,
  enabled BOOLEAN DEFAULT false,
  enabled_for_users UUID[] DEFAULT '{}',
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS policies
ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Feature flags are readable by all authenticated users"
  ON feature_flags FOR SELECT
  USING (auth.role() = 'authenticated');
```


## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property Reflection

After analyzing all acceptance criteria, I identified several areas of redundancy:

1. **Risk Assessment Properties (1.1-1.6)**: These can be combined into a single comprehensive property that validates the completeness of risk assessments
2. **Phased Rollout Properties (2.1, 2.2, 2.4, 2.5)**: These all validate stage definition completeness and can be combined
3. **Monitoring Properties (3.1, 3.4, 3.5, 3.6)**: These all validate event tracking and can be combined into a single property
4. **Checklist Completeness (4.1-4.6, 8.1-8.7)**: Multiple properties checking for presence of checklist items can be combined
5. **Feature Flag Properties (9.1-9.3, 9.5)**: These all validate independent component control and can be combined

### Property 1: Risk Assessment Completeness

*For any* authentication change being deployed, the risk assessment should include: severity categorization (critical/high/medium/low), production testing classification, data integrity impact evaluation, reversibility assessment, dependency identification, and browser-specific testing requirements.

**Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6**

### Property 2: Rollout Stage Definition Completeness

*For any* deployment stage in the phased rollout plan, the stage should define: user population percentage, stage duration, success criteria, monitoring metrics, and rollback triggers.

**Validates: Requirements 2.1, 2.2, 2.4, 2.5, 2.7**

### Property 3: Rollout Pause Mechanism

*For any* monitored metric during rollout, when the metric exceeds its defined threshold, the rollout should automatically pause and prevent progression to the next stage.

**Validates: Requirements 2.6**

### Property 4: Authentication Event Tracking

*For any* authentication event (sign-in, sign-out, session restoration, WHOOP connection, WHOOP token refresh), the monitoring system should record both success and failure counts with timestamps.

**Validates: Requirements 