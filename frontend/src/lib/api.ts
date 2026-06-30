const API_URL = import.meta.env.VITE_API_URL as string;


export class ApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  token?: string | null
): Promise<T> {
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  if (!(options.body instanceof FormData) && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new ApiError(res.status, err.detail || "Request failed");
  }
  return res.json();
}

export interface DocumentResponse {
  id: string;
  file_name: string;
  type: string;
  created_at: string;
}

export async function getDocuments(docType: "cv" | "jd", token: string) {
  return apiFetch<DocumentResponse[]>(`/documents?doc_type=${docType}`, {}, token);
}

export async function getDocumentUrl(docId: string, token: string) {
  return apiFetch<{ url: string }>(`/documents/${docId}/url`, {}, token);
}

export async function uploadDocument(
  file: File,
  docType: "cv" | "jd",
  token: string
) {
  const form = new FormData();
  form.append("file", file);
  form.append("doc_type", docType);
  return apiFetch<{ id: string; type: string; file_name: string }>(
    "/documents/upload",
    { method: "POST", body: form },
    token
  );
}

export interface Session {
  id: string;
  title: string | null;
  position_applied: string;
  industry: string | null;
  language: string;
  status: string;
  current_question_index: number;
  created_at: string;
  error_message?: string | null;
  overall_score?: number | null;
  avg_content?: number | null;
  avg_relevance?: number | null;
  avg_completeness?: number | null;
  avg_presentation?: number | null;
  total_duration_ms?: number | null;
}

export interface Report {
  session_id: string;
  total_duration_ms?: number | null;
  overall_score: number;
  avg_content: number;
  avg_relevance: number;
  avg_completeness: number;
  avg_presentation: number;
  summary: string;
  cv_suggestions: Array<{ section: string; suggestion: string; priority: string }>;
  evaluations: Array<{
    question_text: string;
    category: string;
    score_overall: number;
    feedback: string;
    sample_answer: string;
    candidate_answer?: string | null;
    strengths: string[];
    weaknesses: string[];
    answer_duration_ms?: number | null;
  }>;
  pdf_url: string | null;
}

export interface HintResponse {
  hint: string;
  provider: string;
}

export async function fetchAnswerHint(
  sessionId: string,
  questionText: string,
  language: string,
  token: string
): Promise<HintResponse> {
  return apiFetch<HintResponse>(
    `/sessions/${sessionId}/hint`,
    {
      method: "POST",
      body: JSON.stringify({ question_text: questionText, language }),
    },
    token
  );
}

export async function submitSessionTiming(
  sessionId: string,
  totalDurationMs: number,
  token: string
) {
  return apiFetch(
    `/sessions/${sessionId}/timing`,
    {
      method: "PATCH",
      body: JSON.stringify({ total_duration_ms: totalDurationMs }),
    },
    token
  );
}

export async function submitQuestionTiming(
  sessionId: string,
  questionId: string,
  answerDurationMs: number,
  token: string
) {
  return apiFetch(
    `/sessions/${sessionId}/questions/${questionId}/timing`,
    {
      method: "PATCH",
      body: JSON.stringify({ answer_duration_ms: answerDurationMs }),
    },
    token
  );
}
