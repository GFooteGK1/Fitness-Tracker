# SociusFit - Development Principles

## Core Principles

### 0. Holistic Fitness Integration

**Principle**: SociusFit integrates workout tracking, nutrition monitoring, and AI-driven insights into a unified experience.

**Guidelines:**
- Unified user experience across domains
- Cross-domain insights enabled
- Seamless data flow between features
- Contextual intelligence (workout ↔ nutrition)
- Progressive disclosure of information

### 1. Data-Centric Architecture

**Principle**: Backend data tables must integrate efficiently to enable comprehensive fitness insights through LLM analysis.

**Guidelines:**
- Efficient database relationships
- Semantic clarity in data structures
- Comprehensive logging for insights
- API consistency across domains
- Cross-domain analytics enabled

**Implementation:**
- TypeScript interfaces mirror database schemas
- Comprehensive data validation at API boundaries
- Database indexes support LLM query patterns
- Referential integrity maintained
- Data structured for cross-domain insights

### 2. Mobile-First Fitness Experience

**Principle**: Optimized for gym-floor and kitchen use on modern smartphones.

**Guidelines:**
- Gym-floor optimized (quick logging, works with sweaty hands)
- Kitchen-friendly (seamless during meal prep)
- Touch-first design
- Responsive layout across all screen sizes
- Fast performance for quick logging
- Offline capability
- Camera integration optimized

**Implementation:**
- CSS Grid and Flexbox for responsive layouts
- Touch targets minimum 44px × 44px
- Mobile-appropriate font sizes (min 16px for inputs)
- Test on actual devices in real environments
- Service workers for offline functionality
- One-handed operation design

### 3. Learning-Oriented Error Management

**Principle**: Document errors and solutions to build institutional knowledge.

**Guidelines:**
- Comprehensive error documentation
- Solution tracking (process, not just fix)
- Pattern recognition
- Knowledge sharing
- Continuous improvement

**Implementation:**
- Detailed error reports in `/docs/errors/`
- Include stack traces and environment details
- Document debugging process
- Tag by category
- Include prevention strategies
- Regular error log review

## Code Review Checklist

When reviewing code changes, verify:
- [ ] Does this support cross-domain LLM analysis?
- [ ] Tested on actual mobile devices?
- [ ] Error scenarios documented?
- [ ] Follows mobile-first principles?
- [ ] Data relationships optimized?
- [ ] Maintains UX consistency?
- [ ] AI parsing properly integrated?
- [ ] Works offline for core features?
