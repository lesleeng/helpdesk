# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Quick Start

**Project:** Internal IT Help Desk Module  
**Status:** MVP planning phase (no code yet)  
**Stack:** React (frontend) + Python FastAPI (backend) + PostgreSQL (database)  
**Documentation:** See `project_spec.md` for full requirements and architecture

### Key Files
- `project_spec.md` — Complete project plan, MVP scope, database schema, API endpoints
- `architecture.md` — High-level technical architecture (updated after major revisions)
- `changelog.md` — Version history and release notes (updated per milestone)
- `project_status.md` — Current phase status and blockers (updated per milestone)
- `.env.example` — Environment variables template

## Directory Structure (When Built)

```
helpdesk/
├── backend/              # Python FastAPI application
│   ├── app/
│   │   ├── main.py       # FastAPI app entry point
│   │   ├── config.py     # Configuration from .env
│   │   ├── database.py   # PostgreSQL connection & ORM models
│   │   ├── models/       # SQLAlchemy models (tickets, comments, history, etc.)
│   │   ├── schemas/      # Pydantic request/response schemas
│   │   ├── routes/       # API endpoint handlers
│   │   ├── services/     # Business logic (ticket management, notifications, etc.)
│   │   ├── middleware/   # Auth, logging, error handling
│   │   └── utils/        # Helpers (file upload, email, etc.)
│   ├── migrations/       # Alembic database migrations
│   ├── tests/            # Pytest test suite
│   ├── requirements.txt  # Python dependencies
│   ├── .env              # Local environment (DO NOT COMMIT)
│   └── Makefile          # Common commands
│
├── frontend/             # React + TypeScript application
│   ├── src/
│   │   ├── components/   # React components (reusable)
│   │   │   ├── TicketForm/
│   │   │   ├── TicketList/
│   │   │   ├── TicketDetail/
│   │   │   ├── CommentThread/
│   │   │   ├── StatusBadge/
│   │   │   └── ...
│   │   ├── pages/        # Full page components
│   │   │   ├── Dashboard.tsx
│   │   │   ├── MyTickets.tsx
│   │   │   ├── AllTickets.tsx (admin)
│   │   │   ├── TicketDetail.tsx
│   │   │   └── ...
│   │   ├── hooks/        # Custom React hooks
│   │   ├── services/     # API client functions
│   │   ├── types/        # TypeScript interfaces
│   │   ├── styles/       # Tailwind or CSS
│   │   ├── App.tsx       # Main app component
│   │   └── main.tsx      # Vite entry point
│   ├── tests/            # Jest test suite
│   ├── package.json      # Node dependencies
│   ├── vite.config.ts    # Vite configuration
│   ├── .env.local        # Local environment (DO NOT COMMIT)
│   └── tsconfig.json
│
├── docs/                 # Additional documentation
│   └── api.md            # API documentation (when built)
│
├── project_spec.md       # MVP spec & requirements
├── architecture.md       # Technical architecture (auto-updated)
├── changelog.md          # Version history (auto-updated)
├── project_status.md     # Current status & blockers (auto-updated)
├── .env.example          # Environment template
├── .gitignore            # Git ignore rules
└── README.md             # Quick overview
```

## Development Workflow

### Phase 1: MVP (Weeks 1-10)

**Milestone 1: Database & Backend Setup (Week 1-2)**
- [ ] Set up Python project structure with FastAPI
- [ ] Configure PostgreSQL connection and Alembic migrations
- [ ] Create initial database schema (tickets, comments, categories, etc.)
- [ ] Implement auth integration with workmate's system

**Milestone 2: Backend API (Week 3-5)**
- [ ] Build ticket CRUD endpoints (`/api/helpdesk/tickets`)
- [ ] Implement status flow and validation
- [ ] Add comments & attachment endpoints
- [ ] Create admin dashboard API
- [ ] Write unit tests for all endpoints

**Milestone 3: Frontend Setup & User Pages (Week 6-8)**
- [ ] Initialize React + TypeScript project with Vite
- [ ] Build ticket submission form with dynamic fields
- [ ] Create "My Tickets" list and detail pages
- [ ] Implement comment thread UI
- [ ] Add basic authentication integration

**Milestone 4: Admin Pages & Integration (Week 9-10)**
- [ ] Build "All Tickets" admin page with filters
- [ ] Implement status/priority changes
- [ ] Create admin dashboard with basic stats
- [ ] End-to-end testing
- [ ] Deployment setup

### Common Commands

All commands should be run from the appropriate directory (`backend/` or `frontend/`).

**Backend (Python/FastAPI)**
```bash
# Setup
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt

# Run development server
make run  # or: uvicorn app.main:app --reload

# Database migrations
make migrate  # Create migration
make upgrade  # Apply migrations
make downgrade  # Rollback migrations

# Tests
make test       # Run all tests
make test-one tests/test_tickets.py::test_create_ticket  # Single test
make coverage   # Test coverage report

# Code quality
make lint       # Run flake8
make format     # Run black
make type-check # Run mypy
```

**Frontend (React/TypeScript)**
```bash
# Setup
npm install

# Development
npm run dev     # Start dev server (http://localhost:5173)

# Build
npm run build   # Production build
npm run preview # Preview production build locally

# Tests
npm test        # Run tests
npm test -- --coverage  # Coverage report

# Code quality
npm run lint    # Run ESLint
npm run type-check  # Run TypeScript check
npm run format  # Format with Prettier (if configured)
```

## Architecture Principles

1. **Modular Integration:** Helpdesk is a separate module that plugs into the workmate's centralized system.
2. **Shared User Database:** No duplicate auth—reuse workmate's users table and session/JWT.
3. **Separate Data:** Helpdesk tables in their own schema to avoid conflicts.
4. **API-First:** Clean REST API between frontend and backend; easy to swap frontend later.
5. **Audit Trail:** Every ticket change logged in `ticket_history` for compliance and debugging.
6. **Category-Specific Fields:** Dynamic `ticket_extra_fields` to support 4 request types without schema bloat.

See `architecture.md` for detailed technical design.

## Database

**Connection:** Configured in `.env` via `DATABASE_URL` (PostgreSQL)

**Migration Tool:** Alembic

**Key Tables:**
- `tickets` — Main ticket records
- `ticket_comments` — Conversation thread
- `ticket_history` — Audit log (who changed what, when)
- `ticket_attachments` — File references
- `ticket_categories` & `ticket_subcategories` — Request type definitions
- `ticket_extra_fields` — Dynamic fields per category

See `project_spec.md` for full schema.

## Authentication & Authorization

**How it works:**
1. Frontend passes auth token (JWT/session) from workmate's system.
2. Backend validates token against workmate's auth service.
3. Backend queries workmate's `users` table to populate user info on tickets.
4. Role check: User vs Admin (Tech Staff added Phase 2).

**Environment variables:**
- `WORKMATE_AUTH_URL` — Where to validate tokens
- `WORKMATE_DB_URL` — Connection to workmate's user table
- `JWT_SECRET` — For signing/validating tokens

## API Design

All endpoints prefixed with `/api/helpdesk/`:

- `GET /tickets` — List (own if user, all if admin)
- `POST /tickets` — Create
- `GET /tickets/{id}` — Detail
- `PATCH /tickets/{id}` — Update status/priority (admin only)
- `POST /tickets/{id}/comments` — Add comment
- `GET /tickets/{id}/comments` — List comments
- `GET /tickets/{id}/history` — Audit log (admin only)
- `POST /tickets/{id}/attachments` — Upload file

See `project_spec.md` API section for complete list.

## Environment Setup

1. Copy `.env.example` to `.env` (both backend and frontend)
2. Fill in actual values:
   - Database credentials
   - Workmate's system URLs
   - File storage settings (local or S3)
   - Email settings (if notifications enabled)
3. Backend: `python -m venv venv && pip install -r requirements.txt`
4. Frontend: `npm install`

## Code Style & Quality

**Backend:**
- **Style:** PEP 8 (checked by flake8)
- **Formatter:** black (line length 100)
- **Type hints:** mypy for all functions
- **Tests:** pytest with >80% coverage target

**Frontend:**
- **Style:** ESLint + Prettier
- **Language:** TypeScript (strict mode)
- **Testing:** Jest + React Testing Library
- **Component naming:** PascalCase, files match component name

## When to Update Auto-Updated Docs

These files should be updated after major milestones:

- **`architecture.md`** → After significant design decisions or refactoring (end of phase)
- **`changelog.md`** → After each release/phase completion
- **`project_status.md`** → After each milestone update (weekly check-in recommended)

## Common Pitfalls

1. **Don't commit `.env`** — Use `.env.example` template only
2. **Auth token validation** — Always validate against workmate's system; don't trust frontend
3. **Permission checks** — Verify role in backend before returning admin data
4. **File uploads** — Validate file type and size; scan for malware in production
5. **Database migrations** — Test migrations locally before deploying

## Phase 2 & 3 Notes

**Phase 2 (Weeks 11-18):**
- Ticket assignment to IT staff
- Email notifications
- SLA tracking & reporting

**Phase 3 (Weeks 19-24):**
- Claude API integration for ticket categorization
- Knowledge base with search
- Approval workflows

See `project_status.md` for current phase details.

## Useful Docs

- `project_spec.md` — Full requirements, all 4 phases
- `architecture.md` — Technical design details
- `changelog.md` — What changed and when
- `project_status.md` — Blockers, current milestone, next steps
- `.env.example` — All configurable settings with descriptions
