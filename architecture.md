# Architecture - Helpdesk Module

**Last Updated:** October 6, 2026  
**Phase:** MVP Planning  
**Status:** Design complete, implementation starting

## High-Level Overview

The Helpdesk module is a modular, plug-and-play service designed to integrate with a centralized system (Odoo-like architecture). It operates as three independent layers:

```
┌─────────────────────────────────────────────────────────┐
│                   React Frontend                        │
│         (User & Admin Dashboards, Forms)                │
│              Port: 5173 (dev) / 80 (prod)               │
└───────────────────┬─────────────────────────────────────┘
                    │ HTTPS (JSON)
                    │ axios/fetch
                    │
┌───────────────────▼─────────────────────────────────────┐
│            Python FastAPI Backend                       │
│    (Ticket CRUD, Auth, File Storage, Business Logic)   │
│              Port: 8000 (dev) / 443 (prod)              │
└───────────────────┬─────────────────────────────────────┘
         │                                     │
         ├──────────────────────────────┐      │
         │                              │      │
    ┌────▼──────────────────┐   ┌──────▼──────────────┐
    │  Helpdesk PostgreSQL  │   │  Workmate's System  │
    │    (Separate DB)      │   │  - Auth & Users     │
    │  - tickets            │   │  - User table       │
    │  - comments           │   │  - Session/JWT      │
    │  - history            │   │  - Main DB          │
    │  - attachments        │   │                     │
    │  - categories         │   │  (Queries only)     │
    └───────────────────────┘   └─────────────────────┘
             │                            │
             └────────────────────────────┘
                    Queries only
```

## System Boundaries

### What's in the Helpdesk Module
- Ticket lifecycle (create, update, resolve, close, reopen)
- Comment & conversation threads
- File attachments
- Audit logging (who changed what, when)
- Category-specific extra fields
- Admin dashboard & reports
- Status flow & state management

### What's Delegated to Workmate's System
- User authentication (login, JWT/session validation)
- User database (user profiles, departments, roles)
- System-wide auth/authorization framework
- Main app navbar & menu integration
- File storage service (optionally)
- Notifications system (optionally, phase 2+)

### Why Separate?
- **Modularity:** Helpdesk can be enabled/disabled per customer
- **Independence:** Helpdesk doesn't depend on workmate's internal schema changes
- **Scalability:** Can scale helpdesk database separately
- **Reusability:** Could be sold as a standalone module later

## Database Design

### Schema Separation
```
workmate_db:
├── users
├── departments
├── roles
└── ... (workmate's tables)

helpdesk_db: (separate database)
├── ticket_categories (4 types: Service, Incident, Maintenance, HR-Init)
├── ticket_subcategories (28 subcategories total)
├── tickets (main records)
├── ticket_comments (conversation thread)
├── ticket_history (audit log)
├── ticket_attachments (file references)
├── ticket_extra_fields (dynamic fields per category)
└── departments (optional, for org structure)
```

**Note:** For MVP, if shared database is preferred, all helpdesk tables can live in workmate's DB with a `helpdesk_*` prefix.

### Key Relationships

```
tickets (parent)
├── user_id → workmate.users (FK, read-only)
├── category_id → ticket_categories
├── subcategory_id → ticket_subcategories
└── department_id → departments (optional)

ticket_comments (child of tickets)
├── ticket_id → tickets (FK)
├── user_id → workmate.users (FK, read-only)
└── attachment_ids[] → ticket_attachments

ticket_history (audit of tickets)
├── ticket_id → tickets (FK)
├── changed_by_id → workmate.users (FK, read-only)
└── field, old_value, new_value (audit trail)

ticket_attachments
├── ticket_id → tickets (FK)
└── uploaded_by_id → workmate.users (FK, read-only)

ticket_extra_fields (flexible storage)
├── ticket_id → tickets (FK)
└── subcategory_id → ticket_subcategories
```

### Why No User Table in Helpdesk DB?
- Avoid duplicate user data
- Single source of truth (workmate's users)
- No sync issues
- Backend queries workmate's DB to populate user names, emails, departments

## Backend Architecture

### Layers

```
FastAPI Application (app/main.py)
├── Routes Layer (app/routes/)
│   ├── tickets.py       → /api/helpdesk/tickets
│   ├── comments.py      → /api/helpdesk/tickets/{id}/comments
│   ├── attachments.py   → /api/helpdesk/tickets/{id}/attachments
│   ├── categories.py    → /api/helpdesk/categories
│   ├── dashboard.py     → /api/helpdesk/dashboard (admin)
│   └── admin.py         → Admin-only endpoints
│
├── Services Layer (app/services/)
│   ├── ticket_service.py    → Ticket CRUD & logic
│   ├── comment_service.py   → Comment management
│   ├── auth_service.py      → Token validation, user lookup
│   ├── file_service.py      → Upload, storage, cleanup
│   └── notification_service.py (Phase 2)
│
├── Models Layer (app/models/)
│   └── SQLAlchemy ORM models (Ticket, Comment, History, etc.)
│
├── Schemas Layer (app/schemas/)
│   └── Pydantic request/response models
│
└── Middleware (app/middleware/)
    ├── auth.py          → JWT/session validation
    ├── error_handler.py → Exception handling
    └── logging.py       → Request/response logging
```

### Request Flow

```
1. Client HTTP Request
   │
2. Middleware (auth validation)
   ├─ Validate token with workmate's auth service
   ├─ Fetch user from workmate's DB
   └─ Attach to request context
   │
3. Route Handler (app/routes/)
   ├─ Validate request schema (Pydantic)
   ├─ Check permissions (User vs Admin)
   └─ Call service layer
   │
4. Service Logic (app/services/)
   ├─ Business logic (state transitions, validation)
   ├─ Query/update helpdesk DB
   ├─ Query workmate's DB (read-only)
   └─ Call other services (email, file upload)
   │
5. Database
   ├─ Helpdesk PostgreSQL
   └─ Workmate's PostgreSQL (read-only)
   │
6. Response back to client (JSON)
```

### Error Handling

- All exceptions caught by middleware
- Return standardized JSON error format: `{"error": "message", "code": "ERR_CODE"}`
- Log errors with context (user, ticket ID, timestamp)
- No sensitive data in error messages

## Frontend Architecture

### Component Structure

```
React App (src/)
├── pages/
│   ├── Dashboard.tsx          (User: quick stats)
│   ├── MyTickets.tsx          (User: list view)
│   ├── TicketDetail.tsx       (Shared: detail + comments + history)
│   ├── SubmitTicket.tsx       (User: form)
│   ├── AdminTickets.tsx       (Admin: all tickets, filters)
│   └── AdminDashboard.tsx     (Admin: reports & stats)
│
├── components/
│   ├── TicketForm/
│   │   ├── TicketForm.tsx     (Shared: form with dynamic fields)
│   │   └── CategorySelector.tsx
│   ├── TicketList/
│   │   ├── TicketList.tsx     (Reusable: virtual list, sorting)
│   │   ├── TicketRow.tsx
│   │   └── Filters.tsx
│   ├── TicketDetail/
│   │   ├── TicketHeader.tsx
│   │   ├── StatusBadge.tsx
│   │   ├── HistoryLog.tsx
│   │   └── actions.tsx        (Buttons: edit status, reopen, etc.)
│   ├── CommentThread/
│   │   ├── CommentThread.tsx
│   │   ├── CommentItem.tsx
│   │   └── NewComment.tsx
│   ├── shared/
│   │   ├── Button.tsx
│   │   ├── Input.tsx
│   │   ├── Modal.tsx
│   │   ├── Spinner.tsx
│   │   └── ...
│   └── Layout/
│       ├── Header.tsx
│       ├── Sidebar.tsx (maybe, depends on integration)
│       └── Footer.tsx
│
├── hooks/
│   ├── useTickets.ts        (Fetch list, cache)
│   ├── useTicketDetail.ts   (Fetch single ticket + comments)
│   ├── useAuth.ts           (Get current user from workmate's auth)
│   ├── usePagination.ts     (Pagination logic)
│   └── useFilters.ts        (Filter state management)
│
├── services/
│   ├── api.ts               (Axios instance with base config)
│   ├── ticketApi.ts         (Ticket CRUD endpoints)
│   ├── commentApi.ts        (Comment endpoints)
│   ├── categoryApi.ts       (Categories, subcategories)
│   └── dashboardApi.ts      (Admin stats)
│
├── types/
│   ├── ticket.ts            (TypeScript interfaces)
│   ├── comment.ts
│   ├── user.ts
│   └── api.ts               (Request/response types)
│
├── App.tsx                  (Main component, routing)
└── main.tsx                 (Vite entry point)
```

### State Management

**MVP Approach:** React Query (TanStack Query) for server state

- Queries: `useQuery` for fetching tickets, categories
- Mutations: `useMutation` for create/update/delete
- Caching: Automatic with configurable TTL
- No Redux/Zustand needed for MVP

**User Context:** Passed from workmate's auth system

```typescript
type AuthContext = {
  user: {
    id: string;
    name: string;
    email: string;
    department?: string;
    role: "user" | "admin";
  };
  token: string;
};
```

## Integration Points

### With Workmate's System

**1. Authentication**
```
Frontend
  ↓ (sends token from workmate's auth)
Backend
  ↓ (validates at WORKMATE_AUTH_URL)
Workmate's Auth Service
  ↓ (returns user info)
Backend
  ↓ (queries workmate.users table)
Workmate's Database
```

**2. User Lookup**
```
Backend needs user name/email/department for a ticket
  ↓ (queries workmate's users table)
Workmate's Database
  ↓ (returns user record)
Backend (caches locally for performance)
```

**3. Menu Integration**
```
Workmate's navbar
  ↓ (adds link to helpdesk if enabled)
Frontend loads at /helpdesk/dashboard
  ↓ (uses workmate's auth context)
Helpdesk dashboard
```

### Environment Variables for Integration

```bash
# In .env
WORKMATE_AUTH_URL=https://workmate.local/api/auth
WORKMATE_DB_URL=postgresql://user:pass@workmate-host:5432/workmate_db
WORKMATE_API_KEY=optional-api-key-for-service-calls
```

## Data Flow Examples

### Creating a Ticket

```
1. User fills form (category, title, description, urgency, files)
   │
2. Frontend POST /api/helpdesk/tickets
   ├─ Includes: auth token, form data
   │
3. Backend receives request
   ├─ Middleware validates token (calls workmate's auth)
   ├─ Extracts user ID, department from context
   ├─ Service layer validates:
   │  ├─ Category exists
   │  ├─ Subcategory valid for category
   │  └─ Required extra fields present
   ├─ Service layer uploads attachments (if any)
   ├─ Service layer INSERTs into tickets table
   ├─ Service layer INSERTs into ticket_history (audit)
   └─ Returns ticket ID + full record
   │
4. Frontend shows confirmation
   ├─ Invalidates "My Tickets" cache
   └─ Redirects to detail page
```

### Admin Changing Ticket Status

```
1. Admin clicks "In Progress" on ticket detail
   │
2. Frontend PATCH /api/helpdesk/tickets/{id}
   ├─ Payload: { status: "in_progress" }
   │
3. Backend receives request
   ├─ Middleware validates (checks admin role)
   ├─ Service validates state transition:
   │  ├─ Current status: Open
   │  ├─ Target status: In Progress
   │  └─ Is this transition allowed? YES
   ├─ Service UPDATEs tickets table
   ├─ Service INSERTs into ticket_history
   │  └─ Record: changed_by=admin_id, field=status, old=open, new=in_progress
   └─ Returns updated ticket
   │
4. Frontend updates UI (optimistic or refetch)
```

## Security Considerations

### Authentication
- All requests must include valid token from workmate's system
- Backend validates token on every request (don't cache indefinitely)
- Invalid token → 401 Unauthorized

### Authorization
- User can only view/modify their own tickets
- Admin can view/modify all tickets
- Backend enforces this in every endpoint

### Data Leakage
- Never return sensitive data (passwords, hashes) in responses
- Audit log is admin-only
- Validate file uploads (type, size, scan for malware)

### SQL Injection
- Use SQLAlchemy ORM with parameterized queries
- Never concatenate user input into SQL strings

### CSRF
- Frontend sends CSRF token if not using SameSite cookies
- Backend validates CSRF token on state-changing requests

## Performance Considerations

### Database
- Index on `tickets.user_id` for user ticket list
- Index on `tickets.status` for admin filters
- Index on `tickets.created_at` for sorting
- Index on `ticket_comments.ticket_id` for thread loading

### Frontend
- Virtual list for large ticket lists (react-window)
- Lazy load comments (paginate by 10)
- Cache ticket list with React Query
- Debounce search input (300ms)

### Backend
- Connection pooling (PgBouncer or SQLAlchemy pool)
- Cache category/subcategory list (rarely changes)
- Pagination for all list endpoints (default 20 per page)
- Limit attachment size (50MB max per .env.example)

## Deployment Considerations

### Docker
Backend and frontend should each have Dockerfile for containerization.

### Environment Setup
- Dev: Local PostgreSQL + hot reload
- Staging: RDS PostgreSQL + staging URLs
- Production: RDS PostgreSQL + SSL/TLS + monitoring

### Monitoring
- API response times
- Database query performance
- Error rate & types
- User activity (logins, ticket submissions)

## Future Architecture Changes (Phase 2-3)

### Phase 2
- Add **ticket assignment** → New `assigned_to_id` column, new IT Staff role
- Add **email notifications** → Background job queue (Celery or native async)
- Add **SLA tracking** → New `sla_response_due` and `sla_resolution_due` columns

### Phase 3
- Add **Claude AI service** → New service for ticket categorization
- Add **knowledge base** → New table for KB articles, search service
- Add **approval workflows** → New state for pending approval, manager role

## Document Update Policy

This file is auto-updated after:
- Major design decisions
- Phase completion (MVP, Phase 2, etc.)
- Significant refactoring
- New integration added

Last review: October 6, 2026 (MVP planning)
