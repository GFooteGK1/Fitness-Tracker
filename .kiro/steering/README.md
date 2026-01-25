# Steering Files - SociusFit

This directory contains steering files that provide context-aware guidance to Kiro when working on the SociusFit project.

## What are Steering Files?

Steering files are markdown documents that automatically load based on what files you're working with, providing relevant context, patterns, and best practices without cluttering your main conversation.

## File Organization

### Always-Included Files (Core Context)
These files are always loaded and provide foundational project knowledge:

- **`project-overview.md`** - Project description, tech stack, capabilities, cost estimates
- **`development-principles.md`** - Core principles: Holistic Integration, Data-Centric Architecture, Mobile-First, Learning-Oriented Error Management

### Conditional Files (Context-Aware)
These files load automatically when working with specific file types:

- **`api-development.md`** - Loads when working on `**/api/**/*.ts`
  - Authentication patterns, error handling, input validation, AI integration, database operations

- **`database-patterns.md`** - Loads when working on `**/{lib,api}/**/*.{ts,sql}`
  - Schema reference, RLS policies, query patterns, JSONB structures, migration best practices

- **`component-patterns.md`** - Loads when working on `**/components/**/*.tsx`
  - Mobile-first design, touch targets, responsive layouts, common UI patterns, Tailwind patterns

- **`auth-security.md`** - Loads when working on `**/{auth,api/auth}/**/*.{ts,tsx}`
  - Authentication flows, session management, password security, RLS policies, storage security

- **`testing-guidelines.md`** - Loads when working on `test/**/*.test.ts`
  - Test structure, unit/integration/property tests, mobile testing, mocking patterns

- **`food-tracking.md`** - Loads when working on food tracking features
  - Photo capture flow, AI analysis, macro validation, storage patterns, offline support

- **`workout-tracking.md`** - Loads when working on workout features
  - Workout parsing flow, block types, OCR/voice input, benchmark tracking, parsing rules

### Manual Files (On-Demand)
These files are loaded only when you explicitly reference them with `#` in chat:

- **`troubleshooting.md`** - Common issues and solutions
  - Session errors, RLS violations, photo uploads, build errors, AI parsing, mobile issues

- **`deployment.md`** - Deployment procedures and checklists
  - Vercel setup, pre-deployment checklist, post-deployment verification, rollback procedures

- **`quick-reference.md`** - Quick lookup reference
  - Environment variables, common commands, database queries, API testing, import paths

## How to Use

### Automatic Loading
Just work on files and the relevant steering files will load automatically. For example:
- Edit `app/api/meals/upload/route.ts` → Loads `api-development.md`, `database-patterns.md`, `food-tracking.md`
- Edit `app/components/MealCard.tsx` → Loads `component-patterns.md`, `food-tracking.md`
- Edit `test/workout.test.ts` → Loads `testing-guidelines.md`, `workout-tracking.md`

### Manual Loading
Reference steering files in chat when you need them:
- `#troubleshooting` - Load troubleshooting guide
- `#deployment` - Load deployment guide
- `#quick-reference` - Load quick reference

## Benefits

1. **Focused Context** - Only see relevant information for what you're working on
2. **Consistent Patterns** - Ensures consistent code patterns across the project
3. **Best Practices** - Automatic reminders of mobile-first design, security, testing
4. **Reduced Repetition** - No need to repeatedly explain project structure
5. **Knowledge Preservation** - Project knowledge captured in version-controlled files

## Maintenance

### When to Update
- New features added → Update relevant steering files
- Patterns change → Update pattern documentation
- Common issues found → Add to troubleshooting
- Tech stack changes → Update project-overview and relevant files

### How to Update
Simply edit the markdown files in this directory. Changes take effect immediately.

## File Structure Reference

```
.kiro/steering/
├── README.md                      # This file
├── project-overview.md            # [Always] Project basics
├── development-principles.md      # [Always] Core principles
├── api-development.md             # [Conditional] API patterns
├── database-patterns.md           # [Conditional] Database patterns
├── component-patterns.md          # [Conditional] UI patterns
├── auth-security.md               # [Conditional] Auth & security
├── testing-guidelines.md          # [Conditional] Testing patterns
├── food-tracking.md               # [Conditional] Food features
├── workout-tracking.md            # [Conditional] Workout features
├── troubleshooting.md             # [Manual] Common issues
├── deployment.md                  # [Manual] Deployment guide
└── quick-reference.md             # [Manual] Quick lookup
```

## Related Documentation

- **CLAUDE.MD** - Comprehensive reference guide (source for steering files)
- **docs/architecture/** - System architecture documentation
- **docs/guides/** - Setup and deployment guides
- **docs/errors/** - Historical error reports
- **docs/sessions/** - Development session notes

## Migration from CLAUDE.MD

These steering files were created by breaking down the comprehensive CLAUDE.MD into focused, context-aware documents. CLAUDE.MD remains as the complete reference, while steering files provide just-in-time guidance.
