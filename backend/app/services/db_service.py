"""Database access via Supabase PostgREST (service role)."""

from typing import Any

from supabase import create_client

from app.core.config import get_settings


class DatabaseService:
    def __init__(self) -> None:
        self._client = None

    @property
    def client(self):
        if self._client is None:
            settings = get_settings()
            self._client = create_client(settings.supabase_url, settings.supabase_service_role_key)
        return self._client

    def _table(self, name: str):
        return self.client.table(name)

    async def execute_raw(self, query: str, *args: Any) -> None:
        """Run raw SQL via Supabase RPC if needed; fallback for embeddings."""
        # pgvector insert handled via RPC - use postgrest for simple ops
        pass

    def insert_embedding(
        self,
        document_id: str,
        session_id: str | None,
        chunk_index: int,
        section_type: str,
        chunk_text: str,
        vector_str: str,
    ) -> None:
        self.client.rpc(
            "insert_document_embedding",
            {
                "p_document_id": document_id,
                "p_session_id": session_id,
                "p_chunk_index": chunk_index,
                "p_section_type": section_type,
                "p_chunk_text": chunk_text,
                "p_embedding": vector_str,
            },
        ).execute()

    def create_document(self, data: dict) -> dict:
        return self._table("documents").insert(data).execute().data[0]

    def get_document(self, doc_id: str, user_id: str | None = None) -> dict | None:
        q = self._table("documents").select("*").eq("id", doc_id)
        if user_id:
            q = q.eq("user_id", user_id)
        result = q.execute()
        return result.data[0] if result.data else None

    def get_documents_by_user(self, user_id: str, doc_type: str | None = None) -> list[dict]:
        q = self._table("documents").select("id, file_name, created_at, type").eq("user_id", user_id)
        if doc_type:
            q = q.eq("type", doc_type)
        q = q.order("created_at", desc=True)
        result = q.execute()
        return result.data

    def update_document(self, doc_id: str, data: dict) -> dict:
        return self._table("documents").update(data).eq("id", doc_id).execute().data[0]

    def create_session(self, data: dict) -> dict:
        return self._table("interview_sessions").insert(data).execute().data[0]

    def get_session(self, session_id: str, user_id: str | None = None) -> dict | None:
        q = self._table("interview_sessions").select("*").eq("id", session_id)
        if user_id:
            q = q.eq("user_id", user_id)
        result = q.execute()
        return result.data[0] if result.data else None

    def update_session(self, session_id: str, data: dict) -> dict:
        return self._table("interview_sessions").update(data).eq("id", session_id).execute().data[0]

    def update_session_duration(self, session_id: str, duration_ms: int) -> dict:
        return self._table("interview_sessions").update({"total_duration_ms": duration_ms}).eq("id", session_id).execute().data[0]

    def get_panel_state(self, session_id: str) -> dict | None:
        """Đọc blackboard 'hội đồng phỏng vấn' (JSON) của phiên. None nếu chưa có."""
        result = (
            self._table("interview_sessions")
            .select("panel_state")
            .eq("id", session_id)
            .execute()
        )
        if not result.data:
            return None
        state = result.data[0].get("panel_state")
        return state if isinstance(state, dict) else None

    def save_panel_state(self, session_id: str, state: dict) -> dict:
        """Ghi đè blackboard của phiên."""
        return (
            self._table("interview_sessions")
            .update({"panel_state": state})
            .eq("id", session_id)
            .execute()
            .data[0]
        )

    def list_sessions(self, user_id: str) -> list[dict]:
        return (
            self._table("interview_sessions")
            .select("*, report:interview_reports(overall_score, avg_content, avg_relevance, avg_completeness, avg_presentation)")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .execute()
            .data
        )

    def upsert_candidate_profile(self, session_id: str, data: dict) -> dict:
        existing = (
            self._table("candidate_profiles").select("id").eq("session_id", session_id).execute()
        )
        payload = {"session_id": session_id, **data}
        if existing.data:
            return (
                self._table("candidate_profiles")
                .update(data)
                .eq("session_id", session_id)
                .execute()
                .data[0]
            )
        return self._table("candidate_profiles").insert(payload).execute().data[0]

    def get_candidate_profile(self, session_id: str) -> dict | None:
        result = self._table("candidate_profiles").select("*").eq("session_id", session_id).execute()
        return result.data[0] if result.data else None

    def delete_questions(self, session_id: str) -> None:
        self._table("questions").delete().eq("session_id", session_id).execute()

    def create_question(self, data: dict) -> dict:
        return self._table("questions").insert(data).execute().data[0]

    def update_question_duration(self, question_id: str, duration_ms: int) -> dict:
        return self._table("questions").update({"answer_duration_ms": duration_ms}).eq("id", question_id).execute().data[0]

    def list_questions(self, session_id: str, main_only: bool = False) -> list[dict]:
        q = self._table("questions").select("*").eq("session_id", session_id).order("order_index")
        if main_only:
            q = q.eq("is_follow_up", False)
        return q.execute().data

    def create_message(self, data: dict) -> dict:
        return self._table("messages").insert(data).execute().data[0]

    def list_messages(self, session_id: str, role: str | None = None) -> list[dict]:
        q = self._table("messages").select("*").eq("session_id", session_id).order("sequence_number")
        if role:
            q = q.eq("role", role)
        return q.execute().data

    def get_last_message(self, session_id: str) -> dict | None:
        result = (
            self._table("messages")
            .select("*")
            .eq("session_id", session_id)
            .order("sequence_number", desc=True)
            .limit(1)
            .execute()
        )
        return result.data[0] if result.data else None

    def upsert_evaluation(self, session_id: str, question_id: str, data: dict) -> dict:
        existing = (
            self._table("answer_evaluations")
            .select("id")
            .eq("session_id", session_id)
            .eq("question_id", question_id)
            .execute()
        )
        payload = {"session_id": session_id, "question_id": question_id, **data}
        if existing.data:
            return (
                self._table("answer_evaluations")
                .update(data)
                .eq("session_id", session_id)
                .eq("question_id", question_id)
                .execute()
                .data[0]
            )
        return self._table("answer_evaluations").insert(payload).execute().data[0]

    def list_evaluations(self, session_id: str) -> list[dict]:
        return self._table("answer_evaluations").select("*, questions(*)").eq("session_id", session_id).execute().data

    def upsert_report(self, session_id: str, data: dict) -> dict:
        existing = self._table("interview_reports").select("id").eq("session_id", session_id).execute()
        payload = {"session_id": session_id, **data}
        if existing.data:
            return (
                self._table("interview_reports").update(data).eq("session_id", session_id).execute().data[0]
            )
        return self._table("interview_reports").insert(payload).execute().data[0]

    def get_report(self, session_id: str) -> dict | None:
        result = self._table("interview_reports").select("*").eq("session_id", session_id).execute()
        return result.data[0] if result.data else None

    def get_session_with_docs(self, session_id: str) -> dict | None:
        result = (
            self._table("interview_sessions")
            .select("*, cv_document:documents!cv_document_id(*), jd_document:documents!jd_document_id(*)")
            .eq("id", session_id)
            .execute()
        )
        return result.data[0] if result.data else None


db_service = DatabaseService()
