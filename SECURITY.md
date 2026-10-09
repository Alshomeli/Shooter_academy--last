# Security policy — Shooter Academy

The current `main` branch is the supported source for security fixes. Older deployment bundles and branches are not independently maintained. A deployment is supported only after its commit and Supabase migrations are reconciled with `main`.

## Vulnerability reporting

A verified private reporting channel has not yet been configured. The repository owner must configure GitHub private vulnerability reporting before inviting external security reports. Do not publish child or parent data, credentials, exploit details, or database exports in public issues or pull requests.

Security review results must distinguish source checks, isolated tests, deployed database policy checks, and browser verification. Client-reported login entries are telemetry; trusted authentication evidence comes from Auth server logs.

## Change safeguards

Use reviewed migrations and PRs, preserve historical financial evidence, and use isolated synthetic data for payment tests. No security test should delete real records or create financial transactions in the deployed academy. The operations gateway's audit failure behavior and hosting response headers require separate verification; a successful build is not evidence that production headers are applied.
