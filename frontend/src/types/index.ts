export type Role = 'user' | 'tech' | 'admin'
export type TicketStatus = 'open' | 'in_progress' | 'on_hold' | 'resolved' | 'closed' | 'cancelled'
export type Urgency = 'low' | 'medium' | 'high'
export type Priority = 'low' | 'medium' | 'high' | 'urgent'

export interface User {
  id: string
  name: string
  email: string
  department?: string
  role: Role
}

export interface Category {
  id: number
  name: string
  description?: string | null
  color?: string | null
}

export interface ExtraFieldDef {
  name: string
  label: string
  type: 'text' | 'textarea' | 'date' | 'number' | 'select'
  options?: string[]
}

export interface Subcategory {
  id: number
  category_id: number
  name: string
  description?: string | null
  extra_fields_template?: { fields?: ExtraFieldDef[] } | null
}

export interface Ticket {
  id: number
  title: string
  description: string
  user_id: string
  category_id: number
  subcategory_id?: number | null
  status: TicketStatus
  priority: Priority
  urgency: Urgency
  created_at: string
  updated_at: string
  resolved_at?: string | null
  closed_at?: string | null
  reopen_count: number
  assigned_to_id?: string | null
  assigned_at?: string | null
  first_response_at?: string | null
  sla_response_due?: string | null
  sla_resolution_due?: string | null
  sla_status: 'n/a' | 'ok' | 'at_risk' | 'breached' | 'met'
}

export interface Attachment {
  id: number
  ticket_id: number
  file_name: string
  file_size?: number | null
  uploaded_by_id: string
  created_at: string
}

export interface TicketDetail extends Ticket {
  extra_fields: { field_name: string; field_value?: string | null }[]
  attachments: Attachment[]
}

export interface TicketList {
  items: Ticket[]
  total: number
  page: number
  page_size: number
}

export interface Comment {
  id: number
  ticket_id: number
  user_id: string
  content: string
  is_internal: boolean
  created_at: string
}

export interface TicketCreateInput {
  title: string
  description: string
  category_id: number
  subcategory_id?: number
  urgency: Urgency
  extra_fields: Record<string, string>
}

export interface HistoryEntry {
  id: number
  ticket_id: number
  changed_by_id: string
  field_name: string
  old_value?: string | null
  new_value?: string | null
  change_type?: string | null
  created_at: string
}

export interface Dashboard {
  total: number
  by_status: Record<string, number>
  by_category: Record<string, number>
  by_priority: Record<string, number>
  avg_resolution_hours?: number | null
}

export interface StaffMember {
  id: string
  name: string
  email: string
  role: Role
}

export interface BulkInput {
  ticket_ids: number[]
  status?: TicketStatus
  priority?: Priority
  assignee_id?: string
}

export interface BulkResult {
  updated: number[]
  failed: { id: number; reason: string }[]
}

export interface Report {
  open_count: number
  resolved_count: number
  avg_resolution_hours?: number | null
  avg_first_response_hours?: number | null
  response_sla_met_pct?: number | null
  resolution_sla_met_pct?: number | null
  unassigned_open: number
  by_assignee: { assignee_id: string; open: number; resolved: number }[]
}
