import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { apiFetch, uploadDocument, getDocuments, getDocumentUrl, type Session, type DocumentResponse } from "../lib/api";
import CVReviewModal from "../components/modals/CVReviewModal";

export default function UploadPage() {
  const { accessToken } = useAuth();
  const navigate = useNavigate();

  const [cvMode, setCvMode] = useState<"upload" | "select">("upload");
  const [savedCVs, setSavedCVs] = useState<DocumentResponse[]>([]);
  const [selectedCVId, setSelectedCVId] = useState<string>("");

  const [cvFile, setCvFile] = useState<File | null>(null);
  const [jdFile, setJdFile] = useState<File | null>(null);
  const [position, setPosition] = useState("");
  const [industry, setIndustry] = useState("");
  const [language, setLanguage] = useState("vi");
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState<"idle" | "upload_cv" | "upload_jd" | "analyze" | "done">("idle");
  const [error, setError] = useState("");

  // Modal State
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [previewDocId, setPreviewDocId] = useState<string | null>(null);
  const [previewDocName, setPreviewDocName] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (accessToken) {
      getDocuments("cv", accessToken)
        .then(docs => setSavedCVs(docs))
        .catch(console.error);
    }
  }, [accessToken]);

  const handlePreview = async (e: React.MouseEvent, docId: string, docName: string) => {
    e.stopPropagation();
    setPreviewDocId(docId);
    setPreviewDocName(docName);
    setPreviewUrl(null);
    setPreviewModalOpen(true);

    try {
      if (accessToken) {
        const res = await getDocumentUrl(docId, accessToken);
        setPreviewUrl(res.url);
      }
    } catch (err) {
      console.error("Failed to load document URL", err);
    }
  };

  const handleToggleSelectFromModal = () => {
    if (previewDocId) {
      if (selectedCVId === previewDocId) {
        setSelectedCVId("");
      } else {
        setSelectedCVId(previewDocId);
      }
    } else {
      // Case when file is uploaded from computer (no ID yet)
      setCvFile(null);
      setPreviewModalOpen(false); // Close modal immediately after deselecting
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!accessToken || loading) return;

    if (cvMode === "upload" && !cvFile) {
      setError("Vui lòng tải lên CV");
      return;
    }
    if (cvMode === "select" && !selectedCVId) {
      setError("Vui lòng chọn một CV đã lưu");
      return;
    }

    setLoading(true);
    setLoadingStep(cvMode === "upload" && cvFile ? "upload_cv" : (jdFile ? "upload_jd" : "analyze"));
    setError("");

    try {
      let finalCvId = selectedCVId;

      if (cvMode === "upload" && cvFile) {
        setLoadingStep("upload_cv");
        const cvDoc = await uploadDocument(cvFile, "cv", accessToken);
        finalCvId = cvDoc.id;
      }

      let jdDocId: string | undefined;
      if (jdFile) {
        setLoadingStep("upload_jd");
        const jdDoc = await uploadDocument(jdFile, "jd", accessToken);
        jdDocId = jdDoc.id;
      }

      setLoadingStep("analyze");
      const session = await apiFetch<Session>(
        "/sessions",
        {
          method: "POST",
          body: JSON.stringify({
            cv_document_id: finalCvId,
            jd_document_id: jdDocId,
            position_applied: position,
            industry: industry || null,
            language,
          }),
        },
        accessToken
      );

      if (session.status === "failed") {
        throw new Error(session.error_message || "Phân tích CV thất bại");
      }
      if (session.status !== "ready") {
        throw new Error(`Phiên chưa sẵn sàng (trạng thái: ${session.status})`);
      }

      setLoadingStep("done");
      setTimeout(() => {
        navigate(`/interview/${session.id}`);
      }, 500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Có lỗi xảy ra");
      setLoading(false);
      setLoadingStep("idle");
    }
  };

  return (
    <div className="max-w-6xl mx-auto py-8 px-4">
      <div className="text-center mb-12">
        <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight mb-5">
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600">Tạo Phiên Phỏng Vấn</span>
        </h1>
        <p className="text-slate-500 text-lg max-w-2xl mx-auto font-medium">Thiết lập chi tiết công việc và hồ sơ ứng tuyển của bạn. AI sẽ tự động phân tích và tạo ra các câu hỏi cá nhân hóa chuyên sâu.</p>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-[2rem] p-6 md:p-10 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 relative z-0">
        {error && (
          <div className="bg-red-50/80 border border-red-200 text-red-600 p-4 rounded-2xl text-sm mb-6 flex items-center space-x-3">
            <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" /></svg>
            <span>{error}</span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
          {/* Left Column: Job Details */}
          <section className="space-y-6 lg:border-r border-slate-100 lg:pr-8">
            <div className="flex items-center space-x-3 mb-6 pb-2 border-b border-slate-50">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 text-white flex items-center justify-center font-bold shadow-sm shadow-blue-200">1</div>
              <h2 className="text-xl font-extrabold text-slate-800 tracking-tight">Chi tiết công việc</h2>
            </div>
            <div className="bg-slate-50/50 border border-slate-200 rounded-[1.5rem] p-6 space-y-6 flex-1">
              
              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-slate-700">Vị trí ứng tuyển <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={position}
                    onChange={(e) => setPosition(e.target.value)}
                    placeholder="VD: Senior React Developer"
                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all duration-200 shadow-sm placeholder:text-slate-400"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-slate-700">Ngành nghề <span className="text-slate-400 font-normal">(Tùy chọn)</span></label>
                  <input
                    type="text"
                    value={industry}
                    onChange={(e) => setIndustry(e.target.value)}
                    placeholder="VD: Công nghệ thông tin"
                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all duration-200 shadow-sm placeholder:text-slate-400"
                  />
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-slate-700">Job Description <span className="text-slate-400 font-normal">(Tùy chọn, PDF/DOCX)</span></label>
                  <div className="relative">
                    {jdFile ? (
                      <div className="w-full bg-blue-50/50 border border-blue-200 rounded-xl px-4 py-3 flex items-center justify-between shadow-sm animate-in fade-in duration-200">
                        <div className="flex items-center space-x-3 overflow-hidden">
                          <svg className="w-6 h-6 text-blue-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" /></svg>
                          <span className="text-sm font-medium text-blue-700 truncate">{jdFile.name}</span>
                        </div>
                        <button 
                          type="button" 
                          onClick={() => setJdFile(null)}
                          className="p-1 hover:bg-blue-100 rounded-md text-blue-400 hover:text-blue-600 transition-colors"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      </div>
                    ) : (
                      <div className="w-full bg-white border border-slate-200 border-dashed rounded-xl px-4 py-3 hover:bg-slate-50 transition-colors relative cursor-pointer group">
                        <div className="flex items-center space-x-3 text-slate-500 group-hover:text-blue-500 transition-colors">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                          <span className="text-sm font-medium">Đính kèm File Mô tả (JD)...</span>
                        </div>
                        <input
                          type="file"
                          accept=".pdf,.docx,.doc,.txt"
                          onChange={(e) => setJdFile(e.target.files?.[0] || null)}
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        />
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-slate-700">Ngôn ngữ phỏng vấn</label>
                  <select
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all duration-200 shadow-sm appearance-none cursor-pointer font-medium text-slate-700"
                    style={{ backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`, backgroundPosition: `right 0.75rem center`, backgroundRepeat: `no-repeat`, backgroundSize: `1.5em 1.5em`, paddingRight: `2.5rem` }}
                  >
                    <option value="vi">🇻🇳 Tiếng Việt</option>
                    <option value="en">🇺🇸 English</option>
                  </select>
                </div>
              </div>
            </div>
          </section>

          {/* Right Column: CV Upload */}
          <section className="flex flex-col">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 pb-2 border-b border-slate-50 gap-4">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-indigo-600 text-white flex items-center justify-center font-bold shadow-sm shadow-indigo-200">2</div>
                <h2 className="text-xl font-extrabold text-slate-800 tracking-tight">
                  Hồ sơ ứng viên (CV) <span className="text-red-500 font-bold ml-1">*</span>
                </h2>
              </div>
              
              {/* Toggle Switch */}
              <div className="flex p-1.5 bg-slate-100/80 rounded-xl border border-slate-200/60 shadow-inner">
                <button
                  type="button"
                  onClick={() => setCvMode("upload")}
                  className={`flex items-center space-x-2 px-4 py-1.5 rounded-lg text-sm font-semibold transition-all duration-200 ${
                    cvMode === "upload" 
                      ? "bg-white text-blue-700 shadow-sm border border-slate-200/50" 
                      : "text-slate-500 hover:text-slate-700 hover:bg-slate-200/50"
                  }`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                  <span>Tải lên</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCvMode("select")}
                  className={`flex items-center space-x-2 px-4 py-1.5 rounded-lg text-sm font-semibold transition-all duration-200 ${
                    cvMode === "select" 
                      ? "bg-white text-blue-700 shadow-sm border border-slate-200/50" 
                      : "text-slate-500 hover:text-slate-700 hover:bg-slate-200/50"
                  }`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" /></svg>
                  <span>Từ kho</span>
                </button>
              </div>
            </div>

            {/* CV Selection Area */}
            {cvMode === "upload" ? (
              <div className="group relative flex-1 min-h-[360px] flex">
                <div className="absolute -inset-1 bg-gradient-to-r from-blue-100 to-indigo-100 rounded-[2rem] blur opacity-25 group-hover:opacity-50 transition duration-500"></div>
                <div className="relative border-2 border-dashed border-slate-200 rounded-[1.5rem] p-10 flex-1 flex flex-col items-center justify-center text-center hover:bg-blue-50/50 hover:border-blue-300 transition-all duration-300 bg-slate-50/50">
                  {cvFile ? (
                    <div className="w-full max-w-sm bg-blue-50/50 border border-blue-200 rounded-2xl p-4 flex items-center justify-between shadow-sm animate-in zoom-in duration-200">
                      <div className="flex items-center space-x-3 overflow-hidden">
                        <div className="w-12 h-12 bg-white text-blue-600 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm border border-blue-100">
                          <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" /></svg>
                        </div>
                        <div className="flex-1 min-w-0 text-left">
                          <p className="text-sm font-bold text-slate-800 truncate" title={cvFile.name}>{cvFile.name}</p>
                          <p className="text-xs text-blue-600 font-medium mt-0.5">File đã sẵn sàng</p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2 pl-2 border-l border-blue-200 ml-2">
                        <button 
                          type="button" 
                          onClick={(e) => {
                            e.preventDefault();
                            setPreviewDocId(null); // Not a server doc yet
                            setPreviewDocName(cvFile.name);
                            setPreviewUrl(URL.createObjectURL(cvFile));
                            setPreviewModalOpen(true);
                          }}
                          className="p-2 bg-white hover:bg-blue-50 border border-slate-200 hover:border-blue-200 rounded-xl text-slate-400 hover:text-blue-500 transition-colors shadow-sm flex-shrink-0 group"
                          title="Xem trước CV"
                        >
                          <svg className="w-5 h-5 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                        </button>
                        <button 
                          type="button" 
                          onClick={() => setCvFile(null)}
                          className="p-2 bg-white hover:bg-red-50 border border-slate-200 hover:border-red-200 rounded-xl text-slate-400 hover:text-red-500 transition-colors shadow-sm flex-shrink-0 group"
                          title="Bỏ chọn file này"
                        >
                          <svg className="w-5 h-5 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mb-4 shadow-sm text-blue-500 group-hover:scale-110 transition-transform duration-300">
                        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                      </div>
                      <h3 className="text-base font-semibold text-slate-800 mb-1">Click để chọn file hoặc kéo thả vào đây</h3>
                      <p className="text-sm text-slate-500 mb-6">Hỗ trợ định dạng PDF, DOCX, TXT (Tối đa 5MB)</p>
                      <button type="button" className="px-6 py-2.5 bg-blue-600 text-white font-semibold rounded-full hover:bg-blue-700 shadow-sm transition-colors text-sm">
                        Chọn File CV
                      </button>
                      <input
                        type="file"
                        accept=".pdf,.docx,.doc,.txt"
                        onChange={(e) => setCvFile(e.target.files?.[0] || null)}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        required={cvMode === "upload"}
                      />
                    </>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-slate-50/50 border border-slate-200 rounded-[1.5rem] p-6 flex-1 min-h-[360px]">
                {savedCVs.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-slate-500 min-h-[250px]">
                    <svg className="w-16 h-16 text-slate-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                    <p className="text-base">Bạn chưa lưu CV nào trong hệ thống.</p>
                    <button type="button" onClick={() => setCvMode("upload")} className="mt-4 text-blue-600 font-medium hover:text-blue-700">Tải lên CV đầu tiên &rarr;</button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-4 max-h-[340px] overflow-y-auto pr-2 custom-scrollbar">
                    {savedCVs.map(cv => (
                      <div
                        key={cv.id}
                        onClick={() => {
                          if (selectedCVId === cv.id) {
                            setSelectedCVId("");
                          } else {
                            setSelectedCVId(cv.id);
                          }
                        }}
                        className={`group cursor-pointer rounded-2xl p-4 md:p-5 flex items-center justify-between transition-all duration-300 bg-white border ${selectedCVId === cv.id
                            ? "border-blue-500 shadow-[0_0_0_1px_rgba(59,130,246,1)] bg-blue-50/30"
                            : "border-slate-200 hover:border-blue-300 hover:shadow-md hover:-translate-y-0.5"
                          }`}
                      >
                        <div className="flex items-center space-x-4 overflow-hidden">
                          <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors ${selectedCVId === cv.id ? "bg-blue-100 text-blue-600" : "bg-red-50 text-red-500 group-hover:bg-red-100"
                            }`}>
                            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" /></svg>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-slate-900 truncate" title={cv.file_name}>{cv.file_name}</p>
                            <p className="text-xs text-slate-500 mt-0.5 font-medium">
                              Tải lên: {cv.created_at ? new Date(cv.created_at).toLocaleDateString('vi-VN') : "Gần đây"}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center space-x-2 pl-3 border-l border-slate-100 ml-3">
                          <button
                            type="button"
                            onClick={(e) => handlePreview(e, cv.id, cv.file_name)}
                            className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="Xem trước CV"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                          </button>

                          {selectedCVId === cv.id && (
                            <div className="w-7 h-7 rounded-full bg-blue-500 shadow-sm flex items-center justify-center flex-shrink-0 animate-in zoom-in duration-200">
                              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>
        </div>

        <div className="mt-10 flex flex-col sm:flex-row items-center justify-between border-t border-slate-100 pt-6 gap-4">
          <p className="text-sm text-slate-500 italic">
            <span className="text-red-500 font-bold">*</span> Các trường được đánh dấu sao là thông tin bắt buộc.
          </p>
          <button
            type="submit"
            disabled={loading || (cvMode === "upload" && !cvFile) || (cvMode === "select" && !selectedCVId)}
            className="w-full sm:w-auto px-8 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-medium hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
          >
            {loading ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                <span>Đang xử lý dữ liệu...</span>
              </>
            ) : (
              <>
                <span>Tiếp tục</span>
                <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
              </>
            )}
          </button>
        </div>
      </form>

      <CVReviewModal
        isOpen={previewModalOpen}
        onClose={() => setPreviewModalOpen(false)}
        onToggleSelect={handleToggleSelectFromModal}
        isSelected={previewDocId ? previewDocId === selectedCVId : true}
        fileName={previewDocName}
        fileUrl={previewUrl}
      />
      {/* Loading Overlay */}
      {loading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-[2rem] p-8 md:p-10 shadow-2xl max-w-md w-full mx-4 animate-in zoom-in-95 duration-300">
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-blue-600 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
              </div>
              <h3 className="text-2xl font-bold text-slate-800">Đang chuẩn bị phiên phỏng vấn</h3>
              <p className="text-slate-500 mt-2 text-sm">Vui lòng không đóng trình duyệt trong quá trình này.</p>
            </div>

            <div className="space-y-4">
              {/* Step 1: Upload CV */}
              {cvMode === "upload" && (
                <div className={`flex items-center space-x-3 p-3 rounded-xl transition-colors ${loadingStep === "upload_cv" ? "bg-blue-50/50" : ""}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                    loadingStep === "upload_cv" ? "bg-blue-100 text-blue-600" : 
                    loadingStep === "upload_jd" || loadingStep === "analyze" || loadingStep === "done" ? "bg-green-100 text-green-600" : "bg-slate-100 text-slate-400"
                  }`}>
                    {loadingStep === "upload_jd" || loadingStep === "analyze" || loadingStep === "done" ? (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" /></svg>
                    ) : loadingStep === "upload_cv" ? (
                      <svg className="w-5 h-5 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                    ) : (
                      <span className="text-sm font-semibold">1</span>
                    )}
                  </div>
                  <div className="flex-1">
                    <p className={`text-sm font-semibold ${loadingStep === "idle" ? "text-slate-500" : "text-slate-800"}`}>Tải lên CV</p>
                  </div>
                </div>
              )}

              {/* Step 2: Upload JD */}
              {jdFile && (
                <div className={`flex items-center space-x-3 p-3 rounded-xl transition-colors ${loadingStep === "upload_jd" ? "bg-blue-50/50" : ""}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                    loadingStep === "upload_jd" ? "bg-blue-100 text-blue-600" : 
                    loadingStep === "analyze" || loadingStep === "done" ? "bg-green-100 text-green-600" : "bg-slate-100 text-slate-400"
                  }`}>
                     {loadingStep === "analyze" || loadingStep === "done" ? (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" /></svg>
                    ) : loadingStep === "upload_jd" ? (
                      <svg className="w-5 h-5 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                    ) : (
                      <span className="text-sm font-semibold">{cvMode === "upload" ? "2" : "1"}</span>
                    )}
                  </div>
                  <div className="flex-1">
                    <p className={`text-sm font-semibold ${loadingStep === "upload_cv" || loadingStep === "idle" ? "text-slate-500" : "text-slate-800"}`}>Tải lên Job Description</p>
                  </div>
                </div>
              )}

              {/* Step 3: Analyze */}
              <div className={`flex items-start space-x-3 p-3 rounded-xl transition-colors ${loadingStep === "analyze" ? "bg-blue-50/50" : ""}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                    loadingStep === "analyze" ? "bg-blue-100 text-blue-600" : 
                    loadingStep === "done" ? "bg-green-100 text-green-600" : "bg-slate-100 text-slate-400"
                  }`}>
                    {loadingStep === "done" ? (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" /></svg>
                    ) : loadingStep === "analyze" ? (
                      <svg className="w-5 h-5 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                    ) : (
                      <span className="text-sm font-semibold">{cvMode === "upload" && jdFile ? "3" : (cvMode === "upload" || jdFile ? "2" : "1")}</span>
                    )}
                </div>
                <div className="flex-1">
                  <p className={`text-sm font-semibold ${loadingStep === "analyze" ? "text-slate-800" : "text-slate-500"}`}>AI đang phân tích & tạo câu hỏi</p>
                  {loadingStep === "analyze" && (
                    <p className="text-xs text-blue-600 mt-1 animate-pulse">Có thể mất 30 giây đến 2 phút...</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
