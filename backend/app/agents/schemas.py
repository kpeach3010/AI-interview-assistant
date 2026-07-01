from typing import Any

from pydantic import BaseModel, Field, field_validator


def _to_str_list(value: Any) -> list[str]:
    """LLM doi khi tra list[dict] hoac str don le -> ep ve list[str]."""
    if value is None:
        return []
    if isinstance(value, str):
        return [value] if value.strip() else []
    if isinstance(value, dict):
        value = [value]
    if not isinstance(value, list):
        return []
    result: list[str] = []
    for item in value:
        if isinstance(item, str):
            if item.strip():
                result.append(item)
        elif isinstance(item, dict):
            # Gop cac gia tri co nghia thanh 1 chuoi (vd {title, date})
            parts = [str(v) for v in item.values() if v not in (None, "")]
            if parts:
                result.append(" - ".join(parts))
        elif item is not None:
            result.append(str(item))
    return result


class SkillItem(BaseModel):
    name: str
    level: str | None = None
    years: float | None = None


class ExperienceItem(BaseModel):
    company: str = ""
    role: str = ""
    period: str = ""
    highlights: list[str] = Field(default_factory=list)

    _v_highlights = field_validator("highlights", mode="before")(_to_str_list)


class ProjectItem(BaseModel):
    name: str = ""
    tech_stack: list[str] = Field(default_factory=list)
    description: str = ""
    role: str = ""

    _v_tech = field_validator("tech_stack", mode="before")(_to_str_list)


class EducationItem(BaseModel):
    school: str = ""
    degree: str = ""
    period: str = ""


class PersonalInfo(BaseModel):
    full_name: str = ""
    email: str = ""
    phone: str = ""
    address: str = ""
    summary: str = ""
    theme_color: str = "emerald"


class JdGapAnalysis(BaseModel):
    matched_skills: list[str] = Field(default_factory=list)
    missing_keywords: list[str] = Field(default_factory=list)
    weak_areas: list[str] = Field(default_factory=list)
    personal_info: PersonalInfo = Field(default_factory=PersonalInfo)

    _v_matched = field_validator("matched_skills", mode="before")(_to_str_list)
    _v_missing = field_validator("missing_keywords", mode="before")(_to_str_list)
    _v_weak = field_validator("weak_areas", mode="before")(_to_str_list)


class CandidateProfileData(BaseModel):
    skills: list[SkillItem] = Field(default_factory=list)
    experiences: list[ExperienceItem] = Field(default_factory=list)
    projects: list[ProjectItem] = Field(default_factory=list)
    education: list[EducationItem] = Field(default_factory=list)
    achievements: list[str] = Field(default_factory=list)
    jd_gap_analysis: JdGapAnalysis = Field(default_factory=JdGapAnalysis)

    _v_achievements = field_validator("achievements", mode="before")(_to_str_list)

    @field_validator("skills", mode="before")
    @classmethod
    def _normalize_skills(cls, value: Any) -> Any:
        # Chap nhan skills la list[str] -> chuyen thanh list[{"name": ...}]
        if isinstance(value, list):
            return [
                {"name": item} if isinstance(item, str) else item
                for item in value
            ]
        return value

    @field_validator("education", mode="before")
    @classmethod
    def _drop_empty_education(cls, value: Any) -> Any:
        # Bo cac muc education khong co school lan degree (vd chi co 'courses')
        if isinstance(value, list):
            return [
                item
                for item in value
                if not isinstance(item, dict) or item.get("school") or item.get("degree")
            ]
        return value


VALID_CATEGORIES = {"screening", "technical", "behavioral", "project"}

# Map các giá trị LLM hay trả sai về đúng
CATEGORY_ALIAS: dict[str, str] = {
    "star": "behavioral",
    "situational": "behavioral",
    "competency": "behavioral",
    "hr": "screening",
    "culture": "screening",
    "general": "screening",
    "soft_skill": "behavioral",
    "soft-skill": "behavioral",
    "technical_project": "project",
}


class GeneratedQuestion(BaseModel):
    category: str
    question_text: str
    order_index: int
    source_context: dict[str, Any] | None = None

    @field_validator("category", mode="before")
    @classmethod
    def _normalize_category(cls, v: Any) -> str:
        """Chuẩn hóa category về 4 giá trị hợp lệ. Map alias → đúng, fallback 'screening'."""
        raw = str(v).strip().lower()
        if raw in VALID_CATEGORIES:
            return raw
        if raw in CATEGORY_ALIAS:
            return CATEGORY_ALIAS[raw]
        # Fuzzy fallback: nếu chứa từ khoá thì map tương ứng
        for key in VALID_CATEGORIES:
            if key in raw:
                return key
        return "screening"  # safe default


class QuestionList(BaseModel):
    questions: list[GeneratedQuestion]


class AnswerEvaluationData(BaseModel):
    score_content: float
    score_relevance: float
    score_completeness: float
    score_presentation: float
    strengths: list[str]
    weaknesses: list[str]
    feedback: str
    sample_answer: str


class CvSuggestion(BaseModel):
    section: str
    suggestion: str
    priority: str = "medium"
    # Bằng chứng trích từ CV và ví dụ viết lại theo công thức XYZ (do LLM tạo,
    # gắn với CV thật — thay cho ví dụ hard-code ở frontend).
    evidence: str | None = None
    before: str | None = None
    after: str | None = None


class ReportSummary(BaseModel):
    overall_score: float
    summary: str
    cv_suggestions: list[CvSuggestion] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Multi-agent "hội đồng phỏng vấn" — blackboard & thông điệp giữa các vai trò
# ---------------------------------------------------------------------------

# Trạng thái đánh giá một mục tiêu năng lực trong buổi phỏng vấn.
GOAL_STATUSES = {
    "open",  # chưa hỏi
    "probing",  # đang khai thác
    "covered",  # đã đánh giá đủ
    "gap_confirmed",  # xác nhận là điểm yếu/khoảng trống
    "strength_confirmed",  # xác nhận là điểm mạnh
}

# 4 loại chuyên gia có thể được Lead phân công.
SPECIALISTS = {"screening", "technical", "behavioral", "project"}


class Goal(BaseModel):
    """Một mục tiêu năng lực cần đánh giá (đơn vị của blackboard)."""

    id: str
    label: str
    category: str = "technical"  # screening|technical|behavioral|project
    source: str = "cv"  # jd_requirement|cv_project|skill|cv
    priority: int = 2  # 1 (cao) .. 3 (thấp)
    status: str = "open"
    confidence: float = 0.0
    evidence: list[str] = Field(default_factory=list)
    question_ids: list[str] = Field(default_factory=list)

    _v_evidence = field_validator("evidence", mode="before")(_to_str_list)

    @field_validator("category", mode="before")
    @classmethod
    def _norm_category(cls, v: Any) -> str:
        raw = str(v).strip().lower()
        return raw if raw in VALID_CATEGORIES else "technical"


class PanelBudget(BaseModel):
    max_questions: int = 12
    asked_count: int = 0


class PanelState(BaseModel):
    """Blackboard chia sẻ giữa Lead / Scorekeeper / chuyên gia."""

    goals: list[Goal] = Field(default_factory=list)
    budget: PanelBudget = Field(default_factory=PanelBudget)
    current_goal_id: str | None = None
    current_specialist: str | None = None
    used_question_ids: list[str] = Field(default_factory=list)
    turn: int = 0


class AnswerAssessment(BaseModel):
    """Đầu ra của Scorekeeper sau mỗi câu trả lời."""

    answer_quality: str = "partial"  # 6 nhãn taxonomy
    goal_id: str | None = None
    covered: bool = False  # mục tiêu đã đánh giá đủ chưa
    is_strength: bool = False
    confidence: float = 0.0
    note: str = ""
    # Tín hiệu thích ứng động cho câu hỏi kế tiếp:
    difficulty_adjust: str = "same"  # harder | same | easier
    emergent_topic: str = ""  # chủ đề đáng đào sâu ứng viên vừa nêu (rỗng nếu không)
    suggest_new_goal: bool = False  # emergent_topic có nên thành mục tiêu theo dõi

    @field_validator("difficulty_adjust", mode="before")
    @classmethod
    def _norm_difficulty(cls, v: Any) -> str:
        raw = str(v).strip().lower()
        return raw if raw in ("harder", "same", "easier") else "same"


class TurnDirective(BaseModel):
    """Mệnh lệnh của Lead orchestrator cho lượt kế tiếp."""

    action: str = "switch_goal"  # drill | switch_goal | end
    target_goal_id: str | None = None
    specialist: str = "technical"
    reason: str = ""

    @field_validator("specialist", mode="before")
    @classmethod
    def _norm_specialist(cls, v: Any) -> str:
        raw = str(v).strip().lower()
        return raw if raw in SPECIALISTS else "technical"


class SpecialistQuestion(BaseModel):
    """Câu hỏi do một chuyên gia soạn cho lượt hiện tại."""

    text: str = ""


class QuestionCritique(BaseModel):
    """Đầu ra của Question Critic (QA offline cho ngân hàng câu hỏi)."""

    needs_revision: bool = False
    coverage_gaps: list[str] = Field(default_factory=list)
    issues: list[str] = Field(default_factory=list)

    _v_gaps = field_validator("coverage_gaps", mode="before")(_to_str_list)
    _v_issues = field_validator("issues", mode="before")(_to_str_list)


class ReportCritique(BaseModel):
    """Đầu ra của Report Critic (QA offline cho báo cáo cuối)."""

    needs_revision: bool = False
    issues: list[str] = Field(default_factory=list)

    _v_issues = field_validator("issues", mode="before")(_to_str_list)
