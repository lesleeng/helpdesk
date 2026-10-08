"""Pydantic schemas for tickets, comments, history, attachments, categories."""
from datetime import datetime
from typing import Dict, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator

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
    active: bool = True


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


class WebhookIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    url: str = Field(min_length=8, max_length=500)
    events: List[str] = Field(default_factory=lambda: ["*"], max_length=20)


class WebhookUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    url: Optional[str] = Field(default=None, min_length=8, max_length=500)
    events: Optional[List[str]] = Field(default=None, max_length=20)
    active: Optional[bool] = None


class WebhookOut(BaseModel):
    id: int
    name: str
    url: str
    events: List[str]
    active: bool
    created_at: datetime
    last_status: Optional[str] = None
    last_delivery_at: Optional[datetime] = None


class WebhookCreated(WebhookOut):
    secret: str


class DeliveryOut(ORMModel):
    id: int
    event: str
    ticket_id: Optional[int] = None
    status: str
    response_code: Optional[int] = None
    attempts: int
    error: Optional[str] = None
    created_at: datetime
    delivered_at: Optional[datetime] = None


class IntegrationsStatus(BaseModel):
    slack_enabled: bool
    webhook_events: List[str]
    allow_private_webhooks: bool


class VolumePoint(BaseModel):
    date: str
    created: int
    resolved: int


class BacklogBucket(BaseModel):
    bucket: str
    count: int


class CategoryResolution(BaseModel):
    category: str
    avg_hours: Optional[float] = None
    resolved: int


class SlaWeek(BaseModel):
    week_start: str
    met: int
    total: int
    pct: float


class SatisfactionWeek(BaseModel):
    week_start: str
    avg_rating: Optional[float] = None
    count: int


class AnalyticsTotals(BaseModel):
    created: int
    resolved: int
    avg_first_response_hours: Optional[float] = None
    avg_resolution_hours: Optional[float] = None
    reopen_rate_pct: Optional[float] = None


class AnalyticsOut(BaseModel):
    days: int
    totals: AnalyticsTotals
    volume: List[VolumePoint]
    backlog_age: List[BacklogBucket]
    resolution_by_category: List[CategoryResolution]
    sla_by_week: List[SlaWeek]
    satisfaction_by_week: List[SatisfactionWeek]


class FieldDef(BaseModel):
    name: str = Field(pattern=r"^[a-z][a-z0-9_]{0,49}$")
    label: str = Field(min_length=1, max_length=100)
    type: Literal["text", "textarea", "date", "number", "select"] = "text"
    options: Optional[List[str]] = Field(default=None, max_length=30)
    required: bool = False

    @model_validator(mode="after")
    def check_options(self):
        if self.type == "select":
            cleaned = [o.strip() for o in (self.options or []) if o.strip()]
            if not cleaned:
                raise ValueError("A select field needs at least one option")
            self.options = list(dict.fromkeys(cleaned))
        else:
            self.options = None
        return self


class FieldsIn(BaseModel):
    fields: List[FieldDef] = Field(max_length=20)

    @model_validator(mode="after")
    def unique_names(self):
        names = [f.name for f in self.fields]
        if len(names) != len(set(names)):
            raise ValueError("Field names must be unique")
        return self


class SubcategoryCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    requires_approval: bool = False


class SubcategoryUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    requires_approval: Optional[bool] = None
    active: Optional[bool] = None


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=2000)


class ChatIn(BaseModel):
    messages: List[ChatMessage] = Field(min_length=1, max_length=20)


class TicketDraftOut(BaseModel):
    title: str
    description: str
    category_id: int
    subcategory_id: Optional[int] = None
    urgency: Literal["low", "medium", "high"]


class ChatOut(BaseModel):
    answer: str
    articles: List[KbArticleOut]
    ticket_draft: Optional[TicketDraftOut] = None
