from pydantic import BaseModel, Field


class DocumentUploadResponse(BaseModel):
    id: str
    type: str
    file_name: str
    storage_path: str


class DocumentResponse(BaseModel):
    id: str
    file_name: str
    type: str
    created_at: str | None = None


class CreateSessionRequest(BaseModel):
    cv_document_id: str
    jd_document_id: str | None = None
    position_applied: str
    industry: str | None = None
    language: str = "vi"


class SessionResponse(BaseModel):
    id: str
    title: str | None
    position_applied: str
    industry: str | None
    language: str
    status: str
    current_question_index: int
    created_at: str
    error_message: str | None = None
    overall_score: float | None = None
    avg_content: float | None = None
    avg_relevance: float | None = None
    avg_completeness: float | None = None
    avg_presentation: float | None = None


class QuestionResponse(BaseModel):
    id: str
    category: str
    question_text: str
    order_index: int
    is_follow_up: bool


class ReportResponse(BaseModel):
    session_id: str
    overall_score: float
    avg_content: float
    avg_relevance: float
    avg_completeness: float
    avg_presentation: float
    summary: str
    cv_suggestions: list
    evaluations: list = Field(default_factory=list)
    pdf_url: str | None = None
    jd_gap_analysis: dict | None = None
