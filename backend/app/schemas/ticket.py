"""Pydantic schemas for tickets, comments, history, attachments, categories."""
from datetime import datetime
from typing import Dict, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

from app.models.ticket import TicketPriority, TicketStatus, TicketUrgency


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class SubcategoryOut(ORMModel):
    id: int
    category_id: int
    name: str
    description: Optional[str] = None
    extra_fields_template: Optional[dict] = None
    requires_approval: bool = False


class CategoryOut(ORMModel):
    id: int
    name: str
    description: Optional[str] = None
    color: Optional[str] = None


class TicketCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(min_length=1)
    category_id: int
    subcategory_id: Optional[int] = None
    urgency: TicketUrgency = TicketUrgency.MEDIUM
    extra_fields: Dict[str, str] = Field(default_factory=dict)


class TicketUpdate(BaseModel):
    status: Optional[TicketStatus] = None
    priority: Optional[TicketPriority] = None


class AttachmentOut(ORMModel):
    id: int
    ticket_id: int
    comment_id: Optional[int] = None
    file_name: str
    file_size: Optional[int] = None
    file_type: Optional[str] = None
    uploaded_by_id: str
    created_at: datetime


class CommentCreate(BaseModel):
    content: str = Field(min_length=1)
    is_internal: bool = False


class CommentOut(ORMModel):
    id: int
    ticket_id: int
    user_id: str
    content: str
    is_internal: bool
    created_at: datetime


class HistoryOut(ORMModel):
    id: int
    ticket_id: int
    changed_by_id: str
    field_name: str
    old_value: Optional[str] = None
    new_value: Optional[str] = None
    change_type: Optional[str] = None
    created_at: datetime


class ExtraFieldOut(ORMModel):
    field_name: str
    field_value: Optional[str] = None


class TicketOut(ORMModel):
    id: int
    title: str
    description: str
    user_id: str
    category_id: int
    subcategory_id: Optional[int] = None
    status: TicketStatus
    priority: TicketPriority
    urgency: TicketUrgency
    created_at: datetime
    updated_at: datetime
    resolved_at: Optional[datetime] = None
    closed_at: Optional[datetime] = None
    reopen_count: int
    assigned_to_id: Optional[str] = None
    assigned_at: Optional[datetime] = None
    first_response_at: Optional[datetime] = None
    sla_response_due: Optional[datetime] = None
    sla_resolution_due: Optional[datetime] = None
    sla_status: str = "n/a"
    approval_status: Optional[str] = None
    approver_id: Optional[str] = None
    approval_decided_by_id: Optional[str] = None
    approval_decided_at: Optional[datetime] = None
    approval_comment: Optional[str] = None


class FeedbackOut(ORMModel):
    rating: int
    comment: Optional[str] = None
    created_at: datetime


class TicketDetailOut(TicketOut):
    extra_fields: List[ExtraFieldOut] = []
    attachments: List[AttachmentOut] = []
    feedback: Optional[FeedbackOut] = None


class TicketListOut(BaseModel):
    items: List[TicketOut]
    total: int
    page: int
    page_size: int


class DashboardOut(BaseModel):
    total: int
    by_status: Dict[str, int]
    by_category: Dict[str, int]
    by_priority: Dict[str, int]
    avg_resolution_hours: Optional[float] = None


class AssignRequest(BaseModel):
    assignee_id: Optional[str] = None


class BulkRequest(BaseModel):
    ticket_ids: List[int] = Field(min_length=1, max_length=100)
    status: Optional[TicketStatus] = None
    priority: Optional[TicketPriority] = None
    assignee_id: Optional[str] = None


class BulkFailure(BaseModel):
    id: int
    reason: str


class BulkResult(BaseModel):
    updated: List[int]
    failed: List[BulkFailure]


class StaffOut(BaseModel):
    id: str
    name: str
    email: str
    role: str


class AssigneeLoad(BaseModel):
    assignee_id: str
    open: int
    resolved: int


class ReportOut(BaseModel):
    open_count: int
    resolved_count: int
    avg_resolution_hours: Optional[float] = None
    avg_first_response_hours: Optional[float] = None
    response_sla_met_pct: Optional[float] = None
    resolution_sla_met_pct: Optional[float] = None
    unassigned_open: int
    pending_approval: int = 0
    feedback_count: int = 0
    avg_satisfaction: Optional[float] = None
    by_assignee: List[AssigneeLoad]


class KbArticleCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    body: str = Field(min_length=1)
    tags: Optional[str] = Field(default=None, max_length=300)
    category_id: Optional[int] = None
    published: bool = False


class KbArticleUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=200)
    body: Optional[str] = Field(default=None, min_length=1)
    tags: Optional[str] = Field(default=None, max_length=300)
    category_id: Optional[int] = None
    published: Optional[bool] = None


class KbArticleOut(ORMModel):
    id: int
    title: str
    body: str
    tags: Optional[str] = None
    category_id: Optional[int] = None
    published: bool
    created_by_id: str
    created_at: datetime
    updated_at: datetime


class KbListOut(BaseModel):
    items: List[KbArticleOut]
    total: int
    page: int
    page_size: int


class KbLinkRequest(BaseModel):
    article_id: int


class ApprovalDecision(BaseModel):
    decision: Literal["approve", "reject"]
    comment: Optional[str] = Field(default=None, max_length=1000)


class FeedbackIn(BaseModel):
    rating: int = Field(ge=1, le=5)
    comment: Optional[str] = Field(default=None, max_length=2000)


class SlaRuleIn(BaseModel):
    response_hours: int = Field(ge=1, le=24 * 90)
    resolution_hours: int = Field(ge=1, le=24 * 365)


class SlaRuleOut(BaseModel):
    category_id: int
    category_name: str
    response_hours: int
    resolution_hours: int
    custom: bool


class AiStatusOut(BaseModel):
    enabled: bool
    model: str


class AiCategorizeIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(min_length=1, max_length=5000)


class AiCategorizeOut(BaseModel):
    category_id: int
    subcategory_id: Optional[int] = None
    urgency: Literal["low", "medium", "high"]
    reasoning: str


class AiReplyOut(BaseModel):
    draft: str
    used_article_ids: List[int]
    articles: List[KbArticleOut]


class DuplicateOut(BaseModel):
    id: int
    title: str
    status: str
    score: float
