# Project Passport — Marketing & Content System

This directory contains the automated content marketing system for Project Passport's build-in-public journey.

## Directory Structure

```
marketing/
├── README.md                    # This file
├── brand-guidelines.md          # Visual identity, tone, audience, content rules
├── content-history/             # Index of all published content for dedup/tracking
│   └── content-index.json       # Machine-readable content log
├── daily-posts/                 # Daily content organized by date
│   └── YYYY-MM-DD/
│       ├── linkedin.md          # LinkedIn post (final version)
│       ├── x.md                 # X post or thread (final version)
│       ├── visual/              # Generated images and alt text
│       ├── sources.md           # Research references and fact-check notes
│       ├── development-summary.md  # Raw development observations
│       └── publishing-status.json  # Platform-level pub status
├── assets/                      # Reusable brand assets (logos, templates)
├── automation/                  # Automation scripts and config
│   └── daily-content.prompt.md  # The self-contained prompt for scheduled runs
└── publishing-log/              # Aggregate publishing history
    └── log.jsonl                # Append-only publishing event log
```

## How It Works

1. **Scheduled trigger** fires daily at 8:00 PM IST via Antigravity sidecar.
2. The automation agent inspects git history, file changes, task completion, and project docs.
3. It generates a development summary, selects a content angle, and writes platform-specific posts.
4. It generates a companion visual asset.
5. It publishes to LinkedIn and X (when API credentials are configured).
6. It logs the result and updates content history.

## Configuration

- **Schedule:** Daily at 8:00 PM IST (`CRON_TZ=Asia/Kolkata 0 20 * * *`)
- **Platforms:** LinkedIn + X (Twitter)
- **Auto-publish:** Disabled until first post is approved and API credentials are configured
- **Content approval:** First post requires manual approval; subsequent posts auto-publish

## API Credentials (Required for Auto-Publishing)

Set these as environment variables or in a `.env` file (gitignored):

```
LINKEDIN_ACCESS_TOKEN=       # LinkedIn OAuth 2.0 access token
X_API_KEY=                   # X API v2 OAuth credentials
X_API_SECRET=
X_ACCESS_TOKEN=
X_ACCESS_TOKEN_SECRET=
```

> **Security:** Never commit credentials. The `.env` file is in `.gitignore`.
