export type Role = 'user' | 'admin'
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
