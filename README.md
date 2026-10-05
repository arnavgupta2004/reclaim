# Reclaim

Reclaim is an autonomous financial-recovery agent built on Pine Labs AgenticOrg for The Ken Case Competition 2026
(Round 3, "The Great Rewiring"). It takes a legitimate recovery case, such as a refund owed, from the first request
to a verified resolution. It reconciles evidence after every action, and it never treats "refund initiated" or
"pickup completed" as proof that the customer got their money back.

## Contents

| Folder | What it is |
|---|---|
| [`delhivery-mock/`](delhivery-mock/) | Source-backed mock of Delhivery's B2C logistics APIs (reverse pickup, tracking, pincode serviceability, cancellation) plus Delhivery Maps address validation. It returns deterministic success and failure scenarios: no rider, low balance, timeout, malformed response, unserviceable pincode. Deployed on Vercel and registered in AgenticOrg as a custom connector. |

The agent itself (prompt, configuration, connectors) lives inside AgenticOrg.
