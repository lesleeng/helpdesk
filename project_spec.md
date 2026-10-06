# Helpdesk Module - Project Plan

**Last updated:** October 6, 2026

## Project Overview

Internal IT help desk module built as a plug-and-play service in a modular Odoo-like system. Users submit and track tickets across four request types; admins manage, prioritize, and resolve tickets system-wide. The module integrates with an existing centralized system sharing the same user database and login.

**Goals:**
- Centralized ticket intake & tracking for all IT requests
- User visibility into ticket status and resolution time
- Admin dashboard for workload and SLA tracking
- Scalable architecture—can be toggled on/off per customer

## MVP Scope

**What users can do:**
- Submit a new ticket with category, subcategory, title, description, attachments, and urgency level
- View their own tickets with full details and status history
- Comment on their tickets to provide updates or ask questions
- Reopen a resolved ticket

**What admins can do:**
- View all tickets from all users
- Filter/search tickets by category, status, priority, urgency, or submitter
- Change ticket status (Open → In Progress → On Hold → Resolved → Closed)
- Set ticket priority (Low, Medium, High, Critical) based on user urgency input
- Add comments/notes to tickets
- View ticket history (who changed what, when)
- Assign tickets to themselves or other IT staff (phase 2)

**Deliverables:**
- User dashboard: my tickets list + detail view
- Admin dashboard: all tickets list + detail view + bulk actions
- Ticket submission form with category-specific fields
- Status and comment threads on each ticket

## Technology Stack

| Layer | Choice | Notes |
| --- | --- | --- |
| Frontend | React | Hooks + TypeScript recommended; match workmate's UI/component style once confirmed |
| Backend | Python | FastAPI or Django REST Framework; depends on workmate's preference |
| Database | PostgreSQL | Shared or separate; you chose separate—create new tables in same or linked DB |
| Auth | Shared login/session | Reuse workmate's user table + authentication (JWT, session tokens, or OAuth) |
| File storage | TBD | Local uploads, S3, or existing file service used by main system |

**Integration Model (Odoo-style):**
- **Separate code repo** with its own React frontend + Python backend
- **Shared user database**: queries workmate's users table; no duplicate auth
- **Menu integration**: workmate's navbar/settings exposes a toggle for this module
- **Separate data schema**: helpdesk tables live in their own section (or separate DB, TBD)
- **API endpoints** for ticket CRUD, status updates, file uploads, comments
- **Future**: webhooks or async tasks for notifications and SLA tracking

## Database Schema

**Core Tables:**

| Table | Purpose | Key Fields |
| --- | --- | --- |
| `tickets` | Main ticket record | id, user_id (FK to workmate's users), category, subcategory, title, description, status, priority, urgency_level, created_at, updated_at, resolved_at, closed_at |
| `ticket_categories` | Request type list | id, name (Service/Incident/Maintenance/HR-Initiated) |
| `ticket_subcategories` | Subcategory per type | id, category_id (FK), name, extra_fields (JSON) |
| `ticket_comments` | Thread conversation | id, ticket_id (FK), user_id (FK), body, created_at, attachment_ids (JSON) |
| `ticket_history` | Audit log | id, ticket_id (FK), changed_by_id (FK), field, old_value, new_value, changed_at |
| `ticket_attachments` | Files on tickets | id, ticket_id (FK), file_url, file_name, uploaded_by_id (FK), created_at |
| `departments` (optional) | Org structure | id, name |
| `ticket_extra_fields` | Dynamic fields per category | ticket_id, subcategory_id, field_name, field_value |

**Relationships:**
- `tickets` → `workmate's users` (user_id = submitter)
- `tickets` → `ticket_categories` (category)
- `tickets` → `ticket_subcategories` (subcategory)
- `tickets` → `departments` (if tracking department)
- `ticket_comments` → `tickets` + `workmate's users`
- `ticket_history` → `tickets` + `workmate's users`
- `ticket_attachments` → `tickets` + `workmate's users`

## Roles & Permissions

| Action | User | Admin | HR Staff |
| --- | --- | --- | --- |
| Submit ticket | ✓ | ✓ | ✓ (HR-Init only in MVP) |
| View own tickets | ✓ | ✓ | ✓ |
| View all tickets | ✗ | ✓ | ✗ (phase 2) |
| Change status | ✗ | ✓ | ✗ (phase 2) |
| Set priority | ✗ | ✓ | ✗ |
| Comment on ticket | ✓ (own) | ✓ (all) | ✓ (assigned, phase 2) |
| View history | ✗ | ✓ | ✗ |
| Close/reopen | ✗ | ✓ | ✗ |
| Assign tickets | ✗ | ✓ (phase 2) | ✗ |
| View dashboard/reports | ✗ | ✓ | ✗ |

**MVP simplification:** HR staff = regular users in phase 1 (can only submit HR-Init tickets). Admins handle everything. Tech staff added in phase 2.

## Ticket Status Flow

**Statuses:**
- **Open** (default): ticket submitted, waiting for admin action
- **In Progress**: admin assigned or started work on it
- **On Hold**: waiting for user info, approval, or external dependency
- **Resolved**: issue fixed, closed by admin (user can reopen within 7 days)
- **Closed**: permanently closed (user can comment but not reopen after 7 days)
- **Cancelled** (optional): ticket rejected or user cancelled it

**State transitions:**
- User can submit (Open) and comment on their tickets
- User can reopen a Resolved ticket (within 7 days, then 30 days, or admin-configurable)
- Admin can move: Open → In Progress → On Hold, then back to In Progress → Resolved → Closed
- Admin can cancel from any state
- Cannot revert Closed
- History logs every transition and who made it

## Request Categories & Extra Fields

**Service Requests** (New user, Password reset, Software install, Email setup, Access requests, License assignment, App/System creation)
- Extra fields: affected user/system name, department, start date (for new accounts), software/app name, business justification

**Incident Requests** (Hardware failure, App errors, Printer issues, Internet problems, System outages)
- Extra fields: affected system/app name, error code/message (if applicable), number of users impacted, severity level (critical/high/medium/low), department

**Maintenance Requests** (Preventive maintenance, System updates, Hardware upgrades, Equipment replacement)
- Extra fields: system/equipment name, scheduled date, estimated downtime, affected departments, maintenance window preferences

**HR-Initiated Requests** (Employee onboarding, Offboarding, Department transfers)
- Extra fields: employee name, start/end date, department (current and new for transfers), equipment needed (laptop, phone, keys, etc.), manager name, role

**Implementation strategy:**
- Store extra fields in `ticket_extra_fields` table with flexible JSON schema
- Form builder on frontend shows/hides fields based on selected category + subcategory
- All fields optional in MVP (validation can be added phase 2)
- Attachment upload available for all categories

## Pages & Features

**User Pages (MVP):**
1. **Submit Ticket** - Form with category/subcategory dropdown, dynamic extra fields, file upload, urgency selector
2. **My Tickets** - List view (filters by status, category, date), search, pagination
3. **Ticket Detail** - Full ticket info, status history, comments thread, ability to add comments/attachments, reopen button
4. **Dashboard** - Quick stats (open tickets, resolved this month, avg response time)

**Admin Pages (MVP):**
1. **All Tickets** - Master list with filters (category, status, priority, assignee, date range), bulk status change, search
2. **Ticket Detail** - Full view, change status/priority, comment, view history, assign (phase 2)
3. **Dashboard/Reports** - Ticket volume by category, avg resolution time, SLA tracking, priority distribution
4. **Settings** (Admin only) - Module on/off toggle, email notification settings (phase 2), team management (phase 2)

**Components (reusable):**
- Ticket form (category selector, dynamic fields, file uploader)
- Status badge + dropdown
- Comment thread
- Filter/search bar
- Pagination
- History log viewer

## Milestones (Phase 1-3+)

**Phase 1 (MVP) - 2-3 months:**
- Backend: user/ticket auth, CRUD endpoints, status flow, comments, attachments
- Frontend: form builder, My Tickets + detail, All Tickets (admin)
- Database: schema, migrations
- Admin dashboard: basic stats (count by status/category)
- Testing: unit tests on API, basic integration tests
- Deployment: module can be toggled on/off by admin

**Phase 2 (6-8 weeks after phase 1):**
- Ticket assignment to IT staff (tech staff role)
- Email notifications (ticket created, status changed, comment added)
- SLA tracking: response time & resolution time targets
- Assigned tickets dashboard for tech staff
- Advanced filtering/search
- Bulk actions (change status, assign, set priority)
- Phase 2 report: resolved vs open, avg time to resolution

**Phase 3 (future, 2-3 months after phase 2):**
- AI integration: Claude API for ticket categorization, suggested responses, duplicate detection
- Knowledge base: searchable docs, linked to tickets
- Approval workflows: manager approval for access/license requests
- Customer feedback survey (post-resolution)
- Custom SLA rules per category
- Mobile-responsive design enhancements
- Role-based dashboards

**Phase 3+ (ongoing):**
- Advanced analytics & reporting
- Integration with Slack for notifications
- Helpdesk chatbot (Claude-powered)
- Webhook for third-party integrations

## API Endpoints & Integration

**Backend API (Python REST):**

| Endpoint | Method | Auth | Description |
| --- | --- | --- | --- |
| `/api/helpdesk/tickets` | GET | user | List tickets (own if user, all if admin) |
| `/api/helpdesk/tickets/{id}` | GET | user | Ticket detail |
| `/api/helpdesk/tickets` | POST | user | Create ticket |
| `/api/helpdesk/tickets/{id}` | PATCH | admin | Update status/priority |
| `/api/helpdesk/tickets/{id}/comments` | GET | user | List comments |
| `/api/helpdesk/tickets/{id}/comments` | POST | user | Add comment |
| `/api/helpdesk/tickets/{id}/history` | GET | admin | Audit log |
| `/api/helpdesk/tickets/{id}/attachments` | POST | user | Upload file |
| `/api/helpdesk/categories` | GET | public | List request categories |
| `/api/helpdesk/categories/{id}/subcategories` | GET | public | List subcategories + extra fields |
| `/api/helpdesk/dashboard` | GET | admin | Dashboard metrics |

**Shared with workmate's system:**
- Use workmate's `/auth` endpoints for login verification
- Query workmate's `users` table to populate user info in tickets
- Use workmate's session/JWT for authentication
- Optionally expose a webhook `/api/helpdesk/webhooks/ticket-created` for external integrations (phase 2)

**Frontend Integration:**
- React + TypeScript
- Use axios/fetch for API calls
- Share user context from workmate's auth system
- Match workmate's styling/component library if available

## Timeline & Estimates

**Phase 1 (MVP) - Effort breakdown (solo developer, ~8-10 weeks):**
- Backend setup & auth integration: 1-2 weeks
- Database schema + migrations: 3-5 days
- Ticket CRUD + status endpoints: 2 weeks
- Comments + attachments endpoints: 1 week
- Admin dashboard API: 1 week
- Frontend setup + React components: 2 weeks
- User pages (submit, list, detail): 2 weeks
- Admin pages (all tickets, detail, dashboard): 2 weeks
- Testing + bug fixes: 1-2 weeks
- Documentation + deployment: 3-5 days
- **Buffer/unknown:** 20% (1-2 weeks)

**Assumptions:**
- Workmate's user table is accessible; auth is ready
- You match existing UI framework (or start simple Bootstrap/Tailwind)
- No complex reporting in MVP (basic counts only)
- File uploads go to local storage initially (can add S3/cloud later)
- No AI integration in MVP

**Next steps:**
1. Confirm workmate's tech stack, auth method, and UI library
2. Decide: separate DB or shared with workmate's system?
3. Sketch React component hierarchy
4. Set up Python + React project structure
5. Create initial migrations for helpdesk tables
6. Build and test auth integration with workmate's system
