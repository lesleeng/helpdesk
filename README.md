# Internal IT Help Desk

A help desk module (React + FastAPI + PostgreSQL) that plugs into a larger system. Users submit and track
requests; tech staff work assigned tickets; admins triage, report and configure. See `project_spec.md` for
the full plan and `CLAUDE.md` for developer notes.

## See it without installing anything

The frontend has a **demo mode** that runs the whole app in the browser with sample data and no backend
(AI suggestions are simulated):

```bash
cd frontend
npm install
npm run preview:demo      # builds and serves on http://localhost:4173
```

Sign in from the dropdown as a user, the manager, tech staff or an admin. Each role lands on its own page.

## Run the real thing locally

```bash
# 1. Database (PostgreSQL 14+), then:
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp ../.env.example .env          # set DATABASE_URL; AUTH_MODE=mock uses demo users
make upgrade                     # create tables
make seed                        # categories, subcategories, approval flags
make run                         # API on http://localhost:8000 (docs at /docs)

# 2. Frontend (new terminal)
cd frontend
npm install
npm run dev                      # http://localhost:5173, proxies /api to :8000
```

With `AUTH_MODE=mock` the sign-in screen offers the demo users. Real authentication needs the main system's
auth details (`AUTH_MODE=production`, see `.env.example`).

## Checks

```bash
cd backend && make test lint      # pytest, flake8
cd frontend && npm test && npm run lint && npm run type-check
cd e2e && npm install && npm run smoke   # browser test, needs the app running
```

`docker-compose.yml` runs db + backend + frontend together (not yet exercised).

## Optional features

- Email notifications: `ENABLE_EMAIL_NOTIFICATIONS=true` plus SMTP settings.
- Claude assistance (suggest a category, draft a reply): `ENABLE_AI_FEATURES=true` and `ANTHROPIC_API_KEY`.
  Ticket text is sent to the Claude API when enabled.
