# Changelog

All notable changes to the Helpdesk Module project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Planning
- MVP Phase 1 specifications complete
- Database schema designed
- API endpoints planned
- Technology stack finalized (React + Python FastAPI + PostgreSQL)
- Architecture documented

---

## Phase 1 (MVP) - Planned

### Milestone 1.1: Database & Backend Setup
**Planned:** Week 1-2

- [ ] Python FastAPI project initialized
- [ ] PostgreSQL database & schema migrations (Alembic)
- [ ] Auth integration with workmate's system
- [ ] Core database models (Ticket, Comment, Category, History, Attachment, ExtraFields)

### Milestone 1.2: Backend API
**Planned:** Week 3-5

- [ ] Ticket CRUD endpoints
- [ ] Status flow validation & state transitions
- [ ] Comment & attachment endpoints
- [ ] Admin dashboard API (stats, filtering)
- [ ] Unit tests (target >80% coverage)

### Milestone 1.3: Frontend Setup & User Pages
**Planned:** Week 6-8

- [ ] React + TypeScript + Vite project setup
- [ ] Ticket submission form (dynamic fields by category)
- [ ] My Tickets list & detail pages
- [ ] Comment thread UI
- [ ] Auth integration

### Milestone 1.4: Admin Pages & Launch
**Planned:** Week 9-10

- [ ] All Tickets admin page with filters
- [ ] Status/priority change UI
- [ ] Admin dashboard with stats
- [ ] End-to-end testing
- [ ] Deployment setup
- [ ] Documentation

**Expected Release:** October 2026 (TBD)

---

## Phase 2 - Planned

**Planned:** Weeks 11-18 (6-8 weeks after MVP)

### Features
- [ ] Ticket assignment to IT staff (new Tech Staff role)
- [ ] Email notifications (create, status change, comment)
- [ ] SLA tracking (response time & resolution time targets)
- [ ] Tech staff dashboard (assigned tickets)
- [ ] Advanced filtering & search
- [ ] Bulk actions (status change, assign, priority)
- [ ] Reports (resolved vs open, avg time to resolution)

**Expected Release:** TBD

---

## Phase 3 - Planned

**Planned:** Weeks 19-24 (2-3 months after Phase 2)

### Features
- [ ] Claude AI integration (ticket categorization, suggested responses, duplicate detection)
- [ ] Knowledge base (searchable articles, linked to tickets)
- [ ] Approval workflows (manager approval for access/license requests)
- [ ] Customer satisfaction survey (post-resolution)
- [ ] Custom SLA rules per category
- [ ] Mobile-responsive enhancements
- [ ] Role-based dashboards

**Expected Release:** TBD

---

## Phase 3+ - Ongoing

### Features
- [ ] Advanced analytics & reporting
- [ ] Slack integration (notifications, quick actions)
- [ ] Helpdesk chatbot (Claude-powered)
- [ ] Webhooks for third-party integrations
- [ ] Custom fields & forms per organization

---

## Version History

### [0.0.0] - 2026-10-06
**Status:** Planning Phase

#### Added
- Project specification document (`project_spec.md`)
- Environment variables template (`.env.example`)
- This changelog
- Architecture documentation (`architecture.md`)
- CLAUDE.md for future developers
- Project status tracking (`project_status.md`)

#### Notes
- No code deployed yet
- All designs and requirements finalized
- Ready to begin development

---

## Document Update Policy

This changelog is updated when:
1. **Phase completed** → Add release notes
2. **Major milestone reached** → Document what was built
3. **Breaking changes** → Noted prominently
4. **Blockers resolved** → Noted in context

## How to Use This File

- **For releases:** Add new version section at the top (under `[Unreleased]`)
- **For milestones:** Document what was completed, not started, and blockers
- **For features:** Group by type (Added, Changed, Fixed, Removed, Deprecated)
- **For dates:** Use YYYY-MM-DD format

### Example Entry (When Phase 1 Completes)

```markdown
## [1.0.0] - 2026-12-31
### MVP Release

#### Added
- Ticket submission & tracking (4 request categories)
- User dashboard (My Tickets list & detail)
- Admin dashboard (all tickets, status changes)
- Comment threads on tickets
- File attachments
- Ticket history & audit log
- Category-specific extra fields

#### Fixed
- Auth token validation with workmate's system
- Database migration from development to production

#### Known Issues
- Email notifications not enabled (Phase 2)
- Tech staff assignment not available (Phase 2)
- Mobile view needs work (Phase 3)
```

---

## Milestones Overview

| Phase | Status | Start | End | Key Deliverables |
|-------|--------|-------|-----|------------------|
| MVP (Phase 1) | Planning | Oct 2026 | Dec 2026 | Core CRUD, User & Admin dashboards |
| Phase 2 | Not started | Dec 2026 | Feb 2027 | Assignments, Notifications, SLA |
| Phase 3 | Not started | Feb 2027 | Apr 2027 | AI, Knowledge Base, Workflows |
| Phase 3+ | Not started | Apr 2027+ | Ongoing | Analytics, Chatbot, Webhooks |

---

**Last Updated:** October 6, 2026 (Planning Phase)
