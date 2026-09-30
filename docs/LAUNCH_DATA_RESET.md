# Production launch data reset

All current player, parent, coach, accountant, receptionist and subscription records are **test/demo data**.

The production launch reset is a one-time operator task immediately before go-live. It must clear test business rows while preserving the platform design and security model.

## Must remain unchanged

- Database tables and columns
- Primary/foreign-key relationships
- Constraints and indexes
- Triggers
- RLS policies and grants
- RPC/business functions
- Edge Functions
- Storage policies
- Role permissions
- Registration, payment, attendance and evaluation workflows
- Academy settings/branding
- At least one verified active manager account, so real applications can be reviewed

## Test data to clear at launch

Clear test operational data for players, parents, non-manager staff, teams, subscriptions, transactions, attendance, evaluations, registrations/drafts, notifications/audit activity, and demo-only content.

Authentication test accounts are cleaned separately from database business rows. Preserve the bootstrap manager account until another real manager has been verified and approved.

## Required launch onboarding model

After cleanup, do not reseed operational users.

1. A real user creates their own authentication account.
2. They enter their own application/profile data.
3. Their application stays non-operational while awaiting review.
4. A manager can approve, reject, or request changes.
5. A request-for-changes returns the application to the user for editing and resubmission.
6. Only manager approval creates/activates the operational record and its role access.

Parent/player registration already follows this reviewed application pattern. Staff onboarding must follow the same principle instead of directly creating active staff records.

## Safe launch procedure

Before cleanup:
- create a database backup
- capture row counts
- verify the bootstrap manager is linked and active
- verify CI on main is green
- verify Security Advisor is clean

During cleanup:
- remove only rows from the documented test-data allowlist
- do not run schema migrations for cleanup
- do not drop/recreate tables
- do not alter constraints, RLS, grants, triggers, functions or relationships

After cleanup:
- verify academy settings still exist
- verify at least one manager can sign in
- verify expected operational tables are empty
- run Security Advisor again
- test one real parent/player application end-to-end
- test one real staff application end-to-end
- test subscription/payment creation only after approved real users exist

The actual destructive cleanup must be executed manually at launch after a fresh backup and explicit operator confirmation; it is intentionally not committed as an automatically runnable migration.
