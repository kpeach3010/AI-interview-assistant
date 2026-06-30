import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { 
  SparklesIcon, 
  ArrowLeftIcon, 
  ExclamationTriangleIcon, 
  DocumentTextIcon, 
  ClipboardDocumentIcon, 
  CheckIcon, 
  CheckCircleIcon, 
  XCircleIcon, 
  BriefcaseIcon,
  PlusIcon,
  TrashIcon,
  AcademicCapIcon,
  TrophyIcon,
  UserIcon
} from '@heroicons/react/24/outline';
import { useAuth } from '../contexts/AuthContext';
import { apiFetch } from '../lib/api';

const API_URL = import.meta.env.VITE_API_URL as string;

interface SkillItem {
  name: string;
  level?: string;
  years?: number;
}

interface ExperienceItem {
  company: string;
  role: string;
  period: string;
  highlights: string[];
}

interface ProjectItem {
  name: string;
  tech_stack: string[];
  description: string;
  role: string;
}

interface EducationItem {
  school: string;
  degree: string;
  period: string;
}

interface CandidateProfileData {
  skills: SkillItem[];
  experiences: ExperienceItem[];
  projects: ProjectItem[];
  education: EducationItem[];
  achievements: string[];
  jd_gap_analysis?: {
    matched_skills?: string[];
    missing_keywords?: string[];
    weak_areas?: string[];
    personal_info?: {
      full_name?: string;
      email?: string;
      phone?: string;
      address?: string;
      summary?: string;
      theme_color?: string;
    };
  };
}

interface ReportData {
  cv_suggestions?: Array<{
    section: string;
    suggestion: string;
    priority?: string;
    evidence?: string | null;
    before?: string | null;
    after?: string | null;
  }>;
  jd_gap_analysis?: {
    matched_skills?: string[];
    missing_keywords?: string[];
    weak_areas?: string[];
  };
}

type EditorTab = 'personal_info' | 'experiences' | 'skills' | 'projects' | 'education' | 'achievements';

interface DiffToken {
  type: 'added' | 'removed' | 'common';
  value: string;
}

function computeDiff(oldStr: string, newStr: string): DiffToken[] {
  const oldWords = (oldStr || "").trim().split(/\s+/).filter(Boolean);
  const newWords = (newStr || "").trim().split(/\s+/).filter(Boolean);
  
  const dp: number[][] = Array(oldWords.length + 1).fill(0).map(() => Array(newWords.length + 1).fill(0));
  
  for (let i = 1; i <= oldWords.length; i++) {
    for (let j = 1; j <= newWords.length; j++) {
      if (oldWords[i-1].toLowerCase() === newWords[j-1].toLowerCase()) {
        dp[i][j] = dp[i-1][j-1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i-1][j], dp[i][j-1]);
      }
    }
  }
  
  const result: DiffToken[] = [];
  let i = oldWords.length;
  let j = newWords.length;
  
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldWords[i-1].toLowerCase() === newWords[j-1].toLowerCase()) {
      result.unshift({ type: 'common', value: oldWords[i-1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j-1] >= dp[i-1][j])) {
      result.unshift({ type: 'added', value: newWords[j-1] });
      j--;
    } else {
      result.unshift({ type: 'removed', value: oldWords[i-1] });
      i--;
    }
  }
  return result;
}

const renderDiffText = (oldStr: string, newStr: string) => {
  const diffs = computeDiff(oldStr, newStr);
  if (diffs.length === 0) return <span className="text-slate-400 italic">Trống</span>;
  return (
    <span className="leading-relaxed break-words">
      {diffs.map((token, idx) => {
        if (token.type === 'added') {
          return (
            <span key={idx} className="bg-emerald-100 text-emerald-800 px-1 py-0.5 rounded mx-0.5 font-bold">
              {token.value}
            </span>
          );
        }
        if (token.type === 'removed') {
          return (
            <span key={idx} className="bg-rose-100 text-rose-800 line-through px-1 py-0.5 rounded mx-0.5 font-medium">
              {token.value}
            </span>
          );
        }
        return <span key={idx} className="mx-0.5">{token.value}</span>;
      })}
    </span>
  );
};

export default function CVSuggestionPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { accessToken } = useAuth();
  
  // Suggestion State
  const [report, setReport] = useState<ReportData | null>(null);
  const [loadingSuggestions, setLoadingSuggestions] = useState(true);
  const [errorSuggestions, setErrorSuggestions] = useState('');
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  // Profile Editor State
  const [profile, setProfile] = useState<CandidateProfileData | null>(null);
  const [originalProfile, setOriginalProfile] = useState<CandidateProfileData | null>(null);
  const [viewMode, setViewMode] = useState<'edit' | 'compare'>('edit');
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [errorProfile, setErrorProfile] = useState('');
  const [activeTab, setActiveTab] = useState<EditorTab>('personal_info');

  const handleCopy = (text: string, index: number) => {
    navigator.clipboard.writeText(text)
      .then(() => {
        setCopiedIndex(index);
        setTimeout(() => setCopiedIndex(null), 2000);
      })
      .catch((err) => console.error('Không thể sao chép: ', err));
  };

  useEffect(() => {
    if (!sessionId || !accessToken) return;

    // Fetch Suggestions
    const fetchReport = async () => {
      try {
        const data = await apiFetch<ReportData>(
          `/sessions/${sessionId}/report`,
          {},
          accessToken
        );
        setReport(data);
      } catch (err) {
        setErrorSuggestions(err instanceof Error ? err.message : 'Chưa có báo cáo');
      } finally {
        setLoadingSuggestions(false);
      }
    };

    // Fetch Candidate Profile
    const fetchProfile = async () => {
      try {
        const data = await apiFetch<CandidateProfileData>(
          `/sessions/${sessionId}/candidate-profile`,
          {},
          accessToken
        );
        
        const gapAnalysis = data.jd_gap_analysis || {};
        const personalInfo = gapAnalysis.personal_info || {
          full_name: '',
          email: '',
          phone: '',
          address: '',
          summary: '',
          theme_color: 'emerald'
        };
        if (!personalInfo.theme_color) {
          personalInfo.theme_color = 'emerald';
        }

        // Normalize fields if null
        const initialProfile = {
          skills: data.skills || [],
          experiences: data.experiences || [],
          projects: data.projects || [],
          education: data.education || [],
          achievements: data.achievements || [],
          jd_gap_analysis: {
            ...gapAnalysis,
            personal_info: personalInfo
          }
        };
        setProfile(initialProfile);
        setOriginalProfile(JSON.parse(JSON.stringify(initialProfile)));
      } catch (err) {
        setErrorProfile(err instanceof Error ? err.message : 'Không tải được hồ sơ ứng viên');
      } finally {
        setLoadingProfile(false);
      }
    };

    fetchReport();
    fetchProfile();
  }, [sessionId, accessToken]);

  // Handle Save and Export CV PDF
  const handleSaveAndExport = async () => {
    if (savingProfile || !sessionId || !accessToken || !profile) return;
    setSavingProfile(true);
    setErrorProfile('');

    try {
      // 1. Update Candidate Profile via PUT
      await apiFetch<CandidateProfileData>(
        `/sessions/${sessionId}/candidate-profile`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(profile)
        },
        accessToken
      );

      // 2. Download CV PDF
      const response = await fetch(`${API_URL}/sessions/${sessionId}/cv/pdf`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) throw new Error('Không thể xuất CV PDF');
      
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `optimized-cv-${sessionId}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      setErrorProfile(err instanceof Error ? err.message : 'Đã xảy ra lỗi khi lưu và tải PDF');
    } finally {
      setSavingProfile(false);
    }
  };

  // Helper change handlers
  const updatePersonalInfo = (field: string, value: string) => {
    if (!profile) return;
    const gapAnalysis = profile.jd_gap_analysis || {};
    const personalInfo = gapAnalysis.personal_info || {};
    setProfile({
      ...profile,
      jd_gap_analysis: {
        ...gapAnalysis,
        personal_info: {
          ...personalInfo,
          [field]: value
        }
      }
    });
  };

  const updateField = (section: keyof CandidateProfileData, index: number, field: string, value: any) => {
    if (!profile) return;
    const sectionData = [...(profile[section] as any[])];
    sectionData[index] = { ...sectionData[index], [field]: value };
    setProfile({ ...profile, [section]: sectionData });
  };

  const addListItem = (section: keyof CandidateProfileData, newItem: any) => {
    if (!profile) return;
    setProfile({
      ...profile,
      [section]: [...(profile[section] as any[]), newItem]
    });
  };

  const removeListItem = (section: keyof CandidateProfileData, index: number) => {
    if (!profile) return;
    const sectionData = (profile[section] as any[]).filter((_, i) => i !== index);
    setProfile({ ...profile, [section]: sectionData });
  };

  const updateExperienceHighlight = (expIdx: number, hlIdx: number, value: string) => {
    if (!profile) return;
    const exps = [...profile.experiences];
    const highlights = [...exps[expIdx].highlights];
    highlights[hlIdx] = value;
    exps[expIdx] = { ...exps[expIdx], highlights };
    setProfile({ ...profile, experiences: exps });
  };

  const addExperienceHighlight = (expIdx: number) => {
    if (!profile) return;
    const exps = [...profile.experiences];
    const highlights = [...exps[expIdx].highlights, ''];
    exps[expIdx] = { ...exps[expIdx], highlights };
    setProfile({ ...profile, experiences: exps });
  };

  const removeExperienceHighlight = (expIdx: number, hlIdx: number) => {
    if (!profile) return;
    const exps = [...profile.experiences];
    const highlights = exps[expIdx].highlights.filter((_, i) => i !== hlIdx);
    exps[expIdx] = { ...exps[expIdx], highlights };
    setProfile({ ...profile, experiences: exps });
  };

  const updateAchievement = (idx: number, value: string) => {
    if (!profile) return;
    const achievements = [...profile.achievements];
    achievements[idx] = value;
    setProfile({ ...profile, achievements });
  };

  const CompareView = () => {
    if (!originalProfile || !profile) return null;
    
    return (
      <div className="space-y-6 max-h-[600px] overflow-y-auto pr-2 mt-4" style={{ scrollbarWidth: 'thin' }}>
        
        {/* PERSONAL INFO COMPARISON */}
        <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100 space-y-4">
          <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider border-b border-slate-200/60 pb-2 flex items-center gap-1.5">
            <UserIcon className="w-4 h-4 text-emerald-500" />
            1. Thông tin cá nhân & Giới thiệu
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <span className="text-[9px] font-bold text-slate-400 uppercase">Họ và tên</span>
              <p className="text-sm font-bold text-slate-800">
                {renderDiffText(originalProfile.jd_gap_analysis?.personal_info?.full_name || "", profile.jd_gap_analysis?.personal_info?.full_name || "")}
              </p>
            </div>
            <div className="space-y-1">
              <span className="text-[9px] font-bold text-slate-400 uppercase">Liên hệ</span>
              <p className="text-xs font-semibold text-slate-600 leading-relaxed">
                Email: {renderDiffText(originalProfile.jd_gap_analysis?.personal_info?.email || "", profile.jd_gap_analysis?.personal_info?.email || "")} <br/>
                SĐT: {renderDiffText(originalProfile.jd_gap_analysis?.personal_info?.phone || "", profile.jd_gap_analysis?.personal_info?.phone || "")} <br/>
                Địa chỉ: {renderDiffText(originalProfile.jd_gap_analysis?.personal_info?.address || "", profile.jd_gap_analysis?.personal_info?.address || "")}
              </p>
            </div>
          </div>
          <div className="space-y-1 border-t border-slate-200/60 pt-3">
            <span className="text-[9px] font-bold text-slate-400 uppercase block mb-1">Mục tiêu / Giới thiệu bản thân</span>
            <div className="text-xs text-slate-700 leading-relaxed font-semibold">
              {renderDiffText(originalProfile.jd_gap_analysis?.personal_info?.summary || "", profile.jd_gap_analysis?.personal_info?.summary || "")}
            </div>
          </div>
        </div>

        {/* EXPERIENCES COMPARISON */}
        <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100 space-y-4">
          <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider border-b border-slate-200/60 pb-2 flex items-center gap-1.5">
            <BriefcaseIcon className="w-4 h-4 text-emerald-500" />
            2. Kinh nghiệm làm việc
          </h3>
          {profile.experiences.length === 0 ? (
            <p className="text-xs text-slate-400 italic">Không có thông tin kinh nghiệm</p>
          ) : (
            <div className="space-y-4">
              {profile.experiences.map((exp, idx) => {
                const origExp = originalProfile.experiences[idx] || { company: "", role: "", period: "", highlights: [] };
                return (
                  <div key={idx} className="border-l-2 border-emerald-500 pl-4 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h4 className="text-xs font-bold text-slate-800">
                        {renderDiffText(origExp.company, exp.company)} - {renderDiffText(origExp.role, exp.role)}
                      </h4>
                      <span className="text-[9px] font-bold text-slate-400 bg-white border border-slate-100 px-2 py-0.5 rounded-full">
                        {renderDiffText(origExp.period, exp.period)}
                      </span>
                    </div>
                    <div className="space-y-1.5 pl-2">
                      {exp.highlights.map((hl, hlIdx) => {
                        const origHl = origExp.highlights[hlIdx] || "";
                        return (
                          <div key={hlIdx} className="text-xs text-slate-600 font-semibold leading-relaxed">
                            • {renderDiffText(origHl, hl)}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* PROJECTS COMPARISON */}
        <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100 space-y-4">
          <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider border-b border-slate-200/60 pb-2 flex items-center gap-1.5">
            <DocumentTextIcon className="w-4 h-4 text-emerald-500" />
            3. Dự án tiêu biểu
          </h3>
          {profile.projects.length === 0 ? (
            <p className="text-xs text-slate-400 italic">Không có thông tin dự án</p>
          ) : (
            <div className="space-y-4">
              {profile.projects.map((proj, idx) => {
                const origProj = originalProfile.projects[idx] || { name: "", role: "", tech_stack: [], description: "" };
                return (
                  <div key={idx} className="border-l-2 border-indigo-500 pl-4 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h4 className="text-xs font-bold text-slate-800">
                        {renderDiffText(origProj.name, proj.name)} (Vai trò: {renderDiffText(origProj.role, proj.role)})
                      </h4>
                      <span className="text-[9px] font-bold text-indigo-600 bg-white border border-slate-100 px-2 py-0.5 rounded-full">
                        Tech stack: {renderDiffText((origProj.tech_stack || []).join(", "), (proj.tech_stack || []).join(", "))}
                      </span>
                    </div>
                    <div className="text-xs text-slate-600 font-semibold leading-relaxed pl-2">
                      {renderDiffText(origProj.description, proj.description)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* SKILLS COMPARISON */}
        <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100 space-y-4">
          <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider border-b border-slate-200/60 pb-2 flex items-center gap-1.5">
            <SparklesIcon className="w-4 h-4 text-emerald-500" />
            4. Kỹ năng chuyên môn
          </h3>
          <div className="flex flex-wrap gap-2">
            {profile.skills.map((sk, idx) => {
              const origSk = originalProfile.skills[idx] || { name: "", level: "", years: 0 };
              return (
                <span key={idx} className="inline-flex items-center gap-1 bg-white border border-slate-200/60 rounded-xl px-3 py-1 text-xs font-bold text-slate-700">
                  {renderDiffText(origSk.name, sk.name)} 
                  <span className="text-[9px] text-slate-400 font-medium">
                    ({renderDiffText(origSk.level || "", sk.level || "")} - {renderDiffText(String(origSk.years || ""), String(sk.years || ""))} năm)
                  </span>
                </span>
              );
            })}
          </div>
        </div>

        {/* EDUCATION COMPARISON */}
        <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100 space-y-4">
          <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider border-b border-slate-200/60 pb-2 flex items-center gap-1.5">
            <AcademicCapIcon className="w-4 h-4 text-emerald-500" />
            5. Học vấn
          </h3>
          {profile.education.length === 0 ? (
            <p className="text-xs text-slate-400 italic">Không có thông tin học vấn</p>
          ) : (
            <div className="space-y-4">
              {profile.education.map((edu, idx) => {
                const origEdu = originalProfile.education[idx] || { school: "", degree: "", period: "" };
                return (
                  <div key={idx} className="space-y-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h4 className="text-xs font-bold text-slate-800">
                        {renderDiffText(origEdu.school, edu.school)}
                      </h4>
                      <span className="text-[9px] font-bold text-slate-400">
                        {renderDiffText(origEdu.period, edu.period)}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 font-semibold pl-2">
                      Bằng cấp: {renderDiffText(origEdu.degree, edu.degree)}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ACHIEVEMENTS COMPARISON */}
        <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100 space-y-4">
          <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider border-b border-slate-200/60 pb-2 flex items-center gap-1.5">
            <TrophyIcon className="w-4 h-4 text-emerald-500" />
            6. Chứng chỉ & Thành tựu
          </h3>
          {profile.achievements.length === 0 ? (
            <p className="text-xs text-slate-400 italic">Không có thông tin chứng chỉ/thành tựu</p>
          ) : (
            <div className="space-y-2 pl-2">
              {profile.achievements.map((ach, idx) => {
                const origAch = originalProfile.achievements[idx] || "";
                return (
                  <div key={idx} className="text-xs text-slate-600 font-semibold leading-relaxed">
                    • {renderDiffText(origAch, ach)}
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>
    );
  };

  // Rendering Helper Lists
  const matched = report?.jd_gap_analysis?.matched_skills || [];
  const missing = report?.jd_gap_analysis?.missing_keywords || [];
  const hasJdData = matched.length > 0 || missing.length > 0;
  const matchScore = hasJdData ? Math.round((matched.length / (matched.length + missing.length)) * 100) : 0;

  if (loadingSuggestions && loadingProfile) {
    return (
      <div className="flex flex-col items-center justify-center py-32">
        <div className="w-12 h-12 border-4 border-emerald-200 border-t-emerald-600 rounded-full animate-spin mb-4"></div>
        <p className="text-slate-500 font-medium">Đang tải gợi ý CV và hồ sơ ứng viên...</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-8 pb-20 animate-fade-in font-sans">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-6">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">
            Trình tối ưu hóa <span className="text-emerald-600">CV thông minh</span>
          </h1>
          <p className="text-slate-500 mt-2 font-medium flex items-center gap-2">
            <DocumentTextIcon className="w-5 h-5 text-emerald-500" /> 
            So sánh gợi ý AI và chỉnh sửa trực quan để xuất Resume chuẩn ATS
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            to={`/report/${sessionId}`}
            className="flex items-center gap-2 text-slate-600 font-semibold bg-slate-100 px-4 py-2.5 rounded-xl hover:bg-slate-200 transition-colors shadow-sm text-sm"
          >
            <ArrowLeftIcon className="w-4 h-4" />
            Quay lại báo cáo
          </Link>
          <button
            onClick={handleSaveAndExport}
            disabled={savingProfile || !profile}
            className="flex items-center gap-2 text-white font-bold bg-gradient-to-r from-emerald-600 to-teal-600 px-6 py-2.5 rounded-xl hover:shadow-[0_4px_12px_rgba(16,185,129,0.3)] hover:-translate-y-0.5 transition-all shadow-sm text-sm disabled:opacity-50 disabled:pointer-events-none disabled:transform-none"
          >
            {savingProfile ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Đang xử lý...</span>
              </>
            ) : (
              <>
                <CheckCircleIcon className="w-5 h-5 stroke-[2.5]" />
                <span>Lưu & Tải CV PDF mới</span>
              </>
            )}
          </button>
        </div>
      </div>

      {errorProfile && (
        <div className="bg-red-50 text-red-700 p-4 rounded-2xl flex items-center gap-3">
          <ExclamationTriangleIcon className="w-6 h-6 shrink-0" />
          <span className="font-medium text-sm">{errorProfile}</span>
        </div>
      )}

      {/* Main Container: Split View */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* LEFT COLUMN: Suggestions & ATS Dashboard (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-3xl p-6 text-white shadow-xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 -mr-8 -mt-8 w-32 h-32 rounded-full bg-emerald-500/5 blur-2xl group-hover:opacity-100 transition-opacity duration-700" />
            
            <h2 className="text-lg font-extrabold mb-4 flex items-center gap-2">
              <BriefcaseIcon className="w-5 h-5 text-emerald-400 stroke-[2.5]" />
              Hệ thống tương thích ATS
            </h2>

            {hasJdData ? (
              <div className="flex items-center gap-6">
                {/* Score gauge */}
                <div className="relative w-24 h-24 flex items-center justify-center shrink-0">
                  <svg className="w-full h-full transform -rotate-90">
                    <circle
                      cx="48"
                      cy="48"
                      r="40"
                      className="text-white/10"
                      strokeWidth="7"
                      stroke="currentColor"
                      fill="transparent"
                    />
                    <circle
                      cx="48"
                      cy="48"
                      r="40"
                      className="text-emerald-500 transition-all duration-1000 ease-out"
                      strokeWidth="7"
                      strokeDasharray={2 * Math.PI * 40}
                      strokeDashoffset={2 * Math.PI * 40 * (1 - matchScore / 100)}
                      strokeLinecap="round"
                      stroke="currentColor"
                      fill="transparent"
                    />
                  </svg>
                  <div className="absolute flex flex-col items-center justify-center">
                    <span className="text-2xl font-black">{matchScore}%</span>
                    <span className="text-[8px] uppercase tracking-wider text-slate-400 font-bold">Khớp</span>
                  </div>
                </div>

                <div className="space-y-1">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                    matchScore >= 80 ? "bg-emerald-500/20 text-emerald-300" :
                    matchScore >= 50 ? "bg-amber-500/20 text-amber-300" :
                    "bg-red-500/20 text-red-300"
                  }`}>
                    {matchScore >= 80 ? "Độ tương thích cao" :
                     matchScore >= 50 ? "Tương thích trung bình" :
                     "Tương thích thấp"}
                  </span>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Đã quét được {matched.length} từ khóa chuẩn ngành từ CV của bạn khớp với yêu cầu mô tả công việc (JD).
                  </p>
                </div>
              </div>
            ) : (
              <div className="text-center py-4 bg-white/5 rounded-2xl">
                <p className="text-slate-400 text-xs font-semibold px-4">
                  Không đính kèm JD ở buổi phỏng vấn này. Vui lòng bổ sung JD ở buổi phỏng vấn tiếp theo để phân tích độ tương thích ATS.
                </p>
              </div>
            )}

            {/* Keyword badges lists */}
            {hasJdData && (
              <div className="mt-5 border-t border-white/10 pt-4 space-y-4">
                <div>
                  <h4 className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                    <CheckCircleIcon className="w-3.5 h-3.5 text-emerald-400" />
                    Từ khóa đã khớp ({matched.length})
                  </h4>
                  <div className="flex flex-wrap gap-1.5 max-h-[80px] overflow-y-auto pr-1">
                    {matched.map((skill, idx) => (
                      <span key={idx} className="text-[10px] font-bold bg-emerald-500/10 text-emerald-300 px-2 py-0.5 rounded border border-emerald-500/15">
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 className="text-[11px] font-bold text-rose-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                    <XCircleIcon className="w-3.5 h-3.5 text-rose-400" />
                    Từ khóa còn thiếu cần bổ sung ({missing.length})
                  </h4>
                  <div className="flex flex-wrap gap-1.5 max-h-[100px] overflow-y-auto pr-1">
                    {missing.map((keyword, idx) => (
                      <span key={idx} className="text-[10px] font-bold bg-rose-500/10 text-rose-300 px-2 py-0.5 rounded border border-rose-500/15">
                        + {keyword}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* AI Suggestions Accordion/List */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2 pl-1">
              <SparklesIcon className="w-5 h-5 text-emerald-600" />
              Gợi ý tối ưu hóa từ AI
            </h3>
            
            {errorSuggestions && !report && (
              <div className="bg-red-50 text-red-700 p-4 rounded-2xl flex items-center gap-3">
                <ExclamationTriangleIcon className="w-5 h-5 shrink-0" />
                <span className="font-medium text-xs">{errorSuggestions}</span>
              </div>
            )}

            {report && (
              <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2" style={{ scrollbarWidth: 'thin' }}>
                {[...(report.cv_suggestions || [])]
                  .sort((a, b) => {
                    const rank: Record<string, number> = { high: 0, medium: 1, low: 2 };
                    return (rank[a.priority || "medium"] ?? 1) - (rank[b.priority || "medium"] ?? 1);
                  })
                  .map((s, i) => (
                  <div key={i} className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 relative group hover:border-emerald-200 transition-colors">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="inline-flex items-center px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[10px] font-bold uppercase tracking-wider">
                          {s.section}
                        </span>
                        {s.priority && (
                          <span
                            className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                              s.priority === "high"
                                ? "bg-red-50 text-red-600"
                                : s.priority === "low"
                                ? "bg-slate-100 text-slate-500"
                                : "bg-amber-50 text-amber-600"
                            }`}
                          >
                            {s.priority === "high" ? "Ưu tiên cao" : s.priority === "low" ? "Thấp" : "Trung bình"}
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => handleCopy(s.suggestion, i)}
                        className="flex items-center gap-1 text-[10px] font-bold text-slate-400 hover:text-emerald-600 bg-slate-50 hover:bg-emerald-50 px-2 py-0.5 rounded border border-slate-100 hover:border-emerald-100 transition-all shadow-sm shrink-0"
                      >
                        {copiedIndex === i ? (
                          <>
                            <CheckIcon className="w-3 text-emerald-600 stroke-[2.5]" />
                            <span className="text-emerald-700">Đã chép</span>
                          </>
                        ) : (
                          <>
                            <ClipboardDocumentIcon className="w-3 h-3" />
                            <span>Chép</span>
                          </>
                        )}
                      </button>
                    </div>
                    <p className="text-slate-700 text-xs font-semibold leading-relaxed mb-3">
                      {s.suggestion}
                    </p>

                    {/* Bằng chứng trích từ CV (nếu có) */}
                    {s.evidence && (
                      <p className="text-[10px] text-slate-400 italic mb-2 leading-relaxed">
                        Trích từ CV của bạn: "{s.evidence}"
                      </p>
                    )}

                    {/* Before/After THẬT từ AI (theo công thức XYZ) — chỉ hiện khi có */}
                    {(s.before || s.after) && (
                      <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 text-[10px] font-semibold space-y-2">
                        {s.before && (
                          <div>
                            <span className="text-slate-400 uppercase tracking-wider text-[8px] block">Cách viết cũ</span>
                            <p className="text-slate-500 line-through font-medium mt-0.5 leading-relaxed">{s.before}</p>
                          </div>
                        )}
                        {s.after && (
                          <div className="border-t border-slate-200/60 pt-1">
                            <span className="text-emerald-600 uppercase tracking-wider text-[8px] block">Đề xuất viết lại</span>
                            <p className="text-slate-700 font-medium mt-0.5 leading-relaxed">{s.after}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: Interactive CV Editor (7 cols) */}
        <div className="lg:col-span-7">
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 flex flex-col min-h-[650px] relative">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 border-b border-slate-100 pb-3">
              <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
                <DocumentTextIcon className="w-6 h-6 text-emerald-600" />
                Nội dung hồ sơ ứng viên
              </h2>
              <div className="flex bg-slate-100 p-1 rounded-xl shadow-inner self-start sm:self-auto">
                <button
                  type="button"
                  onClick={() => setViewMode('edit')}
                  className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    viewMode === 'edit'
                      ? 'bg-white text-slate-800 shadow-sm'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Chỉnh sửa
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('compare')}
                  className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    viewMode === 'compare'
                      ? 'bg-white text-emerald-600 shadow-sm'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  So sánh Trước/Sau
                </button>
              </div>
            </div>

            {loadingProfile ? (
              <div className="flex-1 flex flex-col items-center justify-center py-20">
                <div className="w-8 h-8 border-3 border-emerald-200 border-t-emerald-600 rounded-full animate-spin mb-2"></div>
                <p className="text-slate-400 text-xs font-semibold">Đang tải hồ sơ...</p>
              </div>
            ) : profile ? (
              viewMode === 'compare' ? (
                <CompareView />
              ) : (
                <>
                {/* Editor Tab Headers */}
                <div className="flex border-b border-slate-100 gap-1 pb-px overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
                  {([
                    'personal_info',
                    'experiences',
                    'skills',
                    'projects',
                    'education',
                    'achievements'
                  ] as EditorTab[]).map((tab) => {
                    const labels: Record<EditorTab, { label: string; Icon: any }> = {
                      personal_info: { label: 'Cá nhân', Icon: UserIcon },
                      experiences: { label: 'Kinh nghiệm', Icon: BriefcaseIcon },
                      skills: { label: 'Kỹ năng', Icon: SparklesIcon },
                      projects: { label: 'Dự án', Icon: DocumentTextIcon },
                      education: { label: 'Học vấn', Icon: AcademicCapIcon },
                      achievements: { label: 'Thành tựu', Icon: TrophyIcon }
                    };
                    const item = labels[tab];
                    const Icon = item.Icon;
                    const isActive = activeTab === tab;

                    return (
                      <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`flex items-center gap-1.5 px-4 py-2.5 border-b-2 font-bold text-xs shrink-0 transition-all uppercase tracking-wider ${
                          isActive 
                            ? 'border-emerald-500 text-emerald-600 bg-emerald-50/30' 
                            : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <Icon className="w-4 h-4 shrink-0" />
                        {item.label}
                      </button>
                    );
                  })}
                </div>

                {/* Editor Forms Area */}
                <div className="flex-1 py-6 space-y-6">
                  
                  {/* TABS 0: personal_info */}
                  {activeTab === 'personal_info' && (
                    <div className="space-y-5 bg-slate-50/50 border border-slate-100 rounded-2xl p-4 md:p-5">
                      <h3 className="text-xs text-slate-400 font-bold uppercase mb-2">Thông tin liên hệ ứng viên</h3>
                      
                      <div className="grid md:grid-cols-2 gap-4">
                        <div>
                          <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Họ và tên *</label>
                          <input
                            type="text"
                            value={profile.jd_gap_analysis?.personal_info?.full_name || ''}
                            onChange={(e) => updatePersonalInfo('full_name', e.target.value)}
                            className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-emerald-500 bg-white text-sm font-semibold text-slate-700 shadow-sm"
                            placeholder="VD: Nguyễn Văn A"
                            required
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Email liên hệ</label>
                          <input
                            type="email"
                            value={profile.jd_gap_analysis?.personal_info?.email || ''}
                            onChange={(e) => updatePersonalInfo('email', e.target.value)}
                            className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-emerald-500 bg-white text-sm font-semibold text-slate-700 shadow-sm"
                            placeholder="VD: nguyenvana@email.com"
                          />
                        </div>
                      </div>

                      <div className="grid md:grid-cols-2 gap-4">
                        <div>
                          <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Số điện thoại</label>
                          <input
                            type="text"
                            value={profile.jd_gap_analysis?.personal_info?.phone || ''}
                            onChange={(e) => updatePersonalInfo('phone', e.target.value)}
                            className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-emerald-500 bg-white text-sm font-semibold text-slate-700 shadow-sm"
                            placeholder="VD: 0901234567"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Địa chỉ / Khu vực</label>
                          <input
                            type="text"
                            value={profile.jd_gap_analysis?.personal_info?.address || ''}
                            onChange={(e) => updatePersonalInfo('address', e.target.value)}
                            className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-emerald-500 bg-white text-sm font-semibold text-slate-700 shadow-sm"
                            placeholder="VD: Quận 1, TP. Hồ Chí Minh, Việt Nam"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase block mb-2">Màu sắc chủ đạo CV (Theme Color)</label>
                        <div className="flex flex-wrap gap-2.5 items-center mb-1">
                          {[
                            { id: 'emerald', name: 'Emerald', bgClass: 'bg-emerald-500' },
                            { id: 'blue', name: 'Blue', bgClass: 'bg-blue-600' },
                            { id: 'slate', name: 'Slate', bgClass: 'bg-slate-600' },
                            { id: 'crimson', name: 'Crimson', bgClass: 'bg-red-800' },
                            { id: 'purple', name: 'Purple', bgClass: 'bg-purple-600' },
                          ].map((theme) => {
                            const isSelected = (profile.jd_gap_analysis?.personal_info?.theme_color || 'emerald') === theme.id;
                            return (
                              <button
                                key={theme.id}
                                type="button"
                                onClick={() => updatePersonalInfo('theme_color', theme.id)}
                                className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-semibold transition-all shadow-sm ${
                                  isSelected 
                                    ? 'border-slate-800 bg-white ring-2 ring-slate-800/10' 
                                    : 'border-slate-200 bg-white hover:bg-slate-50'
                                }`}
                              >
                                <span className={`w-3.5 h-3.5 rounded-full ${theme.bgClass} shrink-0`} />
                                <span className="capitalize">{theme.name}</span>
                                {isSelected && <CheckIcon className="w-3.5 h-3.5 text-slate-800 stroke-[2.5]" />}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Mục tiêu nghề nghiệp / Giới thiệu</label>
                        <textarea
                          rows={4}
                          value={profile.jd_gap_analysis?.personal_info?.summary || ''}
                          onChange={(e) => updatePersonalInfo('summary', e.target.value)}
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-emerald-500 bg-white text-xs font-medium text-slate-700 shadow-sm leading-relaxed"
                          placeholder="Mô tả mục tiêu nghề nghiệp của bạn, ví dụ: 'Mong muốn ứng tuyển vị trí thực tập để tích lũy kinh nghiệm thực tế, rèn luyện kỹ năng...'"
                        />
                      </div>
                    </div>
                  )}

                  {/* TABS 1: experiences */}
                  {activeTab === 'experiences' && (
                    <div className="space-y-6">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-400 font-bold">Danh sách các công việc đã làm</span>
                        <button
                          onClick={() => addListItem('experiences', { company: '', role: '', period: '', highlights: [''] })}
                          className="flex items-center gap-1 text-xs font-bold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-xl border border-emerald-100 transition-all"
                        >
                          <PlusIcon className="w-4 h-4" />
                          Thêm công việc
                        </button>
                      </div>

                      {profile.experiences.map((exp, expIdx) => (
                        <div key={expIdx} className="bg-slate-50/50 border border-slate-100 rounded-2xl p-4 md:p-5 relative group/card">
                          <button
                            onClick={() => removeListItem('experiences', expIdx)}
                            className="absolute top-4 right-4 text-slate-400 hover:text-red-500 opacity-0 group-hover/card:opacity-100 transition-opacity p-1.5 rounded-lg hover:bg-red-50"
                            title="Xóa công việc này"
                          >
                            <TrashIcon className="w-4 h-4" />
                          </button>

                          <div className="grid md:grid-cols-2 gap-4 mb-4">
                            <div>
                              <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Công ty / Tổ chức</label>
                              <input
                                type="text"
                                value={exp.company}
                                onChange={(e) => updateField('experiences', expIdx, 'company', e.target.value)}
                                className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-emerald-500 bg-white text-sm font-semibold text-slate-700 shadow-sm"
                                placeholder="Tên công ty"
                              />
                            </div>
                            <div>
                              <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Vị trí / Chức danh</label>
                              <input
                                type="text"
                                value={exp.role}
                                onChange={(e) => updateField('experiences', expIdx, 'role', e.target.value)}
                                className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-emerald-500 bg-white text-sm font-semibold text-slate-700 shadow-sm"
                                placeholder="Vị trí đảm nhận"
                              />
                            </div>
                          </div>

                          <div className="mb-4">
                            <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Thời gian làm việc</label>
                            <input
                              type="text"
                              value={exp.period}
                              onChange={(e) => updateField('experiences', expIdx, 'period', e.target.value)}
                              className="w-full md:w-1/2 px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-emerald-500 bg-white text-sm font-semibold text-slate-700 shadow-sm"
                              placeholder="Ví dụ: 06/2023 - Hiện tại"
                            />
                          </div>

                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <label className="text-[10px] font-bold text-slate-400 uppercase block">Chi tiết công việc / Thành tích</label>
                              <button
                                onClick={() => addExperienceHighlight(expIdx)}
                                className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 hover:text-emerald-700"
                              >
                                <PlusIcon className="w-3 h-3 stroke-[2.5]" />
                                Thêm gạch đầu dòng
                              </button>
                            </div>

                            <div className="space-y-2">
                              {exp.highlights.map((hl, hlIdx) => (
                                <div key={hlIdx} className="flex items-center gap-2 group/hl">
                                  <span className="text-slate-300 font-bold shrink-0">•</span>
                                  <input
                                    type="text"
                                    value={hl}
                                    onChange={(e) => updateExperienceHighlight(expIdx, hlIdx, e.target.value)}
                                    className="flex-1 px-3 py-1.5 rounded-lg border border-slate-200 focus:outline-none focus:border-emerald-500 bg-white text-xs font-medium text-slate-700 shadow-sm"
                                    placeholder="Điền chi tiết công việc hoặc thành tựu tại đây"
                                  />
                                  <button
                                    onClick={() => removeExperienceHighlight(expIdx, hlIdx)}
                                    className="text-slate-400 hover:text-red-500 opacity-0 group-hover/hl:opacity-100 transition-opacity p-1 rounded hover:bg-slate-200/50 shrink-0"
                                  >
                                    <TrashIcon className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* TABS 2: skills */}
                  {activeTab === 'skills' && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-400 font-bold">Kỹ năng công nghệ & kỹ năng mềm</span>
                        <button
                          onClick={() => addListItem('skills', { name: '', level: '', years: undefined })}
                          className="flex items-center gap-1 text-xs font-bold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-xl border border-emerald-100 transition-all"
                        >
                          <PlusIcon className="w-4 h-4" />
                          Thêm kỹ năng
                        </button>
                      </div>

                      <div className="bg-slate-50/50 border border-slate-100 rounded-2xl p-4 space-y-3">
                        <div className="grid grid-cols-12 gap-3 text-[10px] font-bold text-slate-400 uppercase px-2 mb-1">
                          <div className="col-span-5">Tên kỹ năng</div>
                          <div className="col-span-4">Cấp độ (Mức độ thành thạo)</div>
                          <div className="col-span-2 text-center">Năm exp</div>
                          <div className="col-span-1"></div>
                        </div>

                        {profile.skills.map((sk, idx) => (
                          <div key={idx} className="grid grid-cols-12 gap-3 items-center">
                            <div className="col-span-5">
                              <input
                                type="text"
                                value={sk.name}
                                onChange={(e) => updateField('skills', idx, 'name', e.target.value)}
                                className="w-full px-3 py-1.5 rounded-lg border border-slate-200 focus:outline-none focus:border-emerald-500 bg-white text-xs font-semibold text-slate-700 shadow-sm"
                                placeholder="Ví dụ: ReactJS"
                              />
                            </div>
                            <div className="col-span-4">
                              <input
                                type="text"
                                value={sk.level || ''}
                                onChange={(e) => updateField('skills', idx, 'level', e.target.value)}
                                className="w-full px-3 py-1.5 rounded-lg border border-slate-200 focus:outline-none focus:border-emerald-500 bg-white text-xs font-semibold text-slate-700 shadow-sm"
                                placeholder="Ví dụ: Advanced, Cơ bản..."
                              />
                            </div>
                            <div className="col-span-2">
                              <input
                                type="number"
                                step="0.5"
                                value={sk.years || ''}
                                onChange={(e) => updateField('skills', idx, 'years', e.target.value ? parseFloat(e.target.value) : undefined)}
                                className="w-full px-2 py-1.5 rounded-lg border border-slate-200 focus:outline-none focus:border-emerald-500 bg-white text-xs text-center font-semibold text-slate-700 shadow-sm"
                                placeholder="2"
                              />
                            </div>
                            <div className="col-span-1 text-center">
                              <button
                                onClick={() => removeListItem('skills', idx)}
                                className="text-slate-400 hover:text-red-500 p-1 rounded hover:bg-red-50"
                              >
                                <TrashIcon className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* TABS 3: projects */}
                  {activeTab === 'projects' && (
                    <div className="space-y-6">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-400 font-bold">Các dự án cá nhân hoặc dự án thực tế tiêu biểu</span>
                        <button
                          onClick={() => addListItem('projects', { name: '', role: '', tech_stack: [], description: '' })}
                          className="flex items-center gap-1 text-xs font-bold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-xl border border-emerald-100 transition-all"
                        >
                          <PlusIcon className="w-4 h-4" />
                          Thêm dự án
                        </button>
                      </div>

                      {profile.projects.map((proj, idx) => (
                        <div key={idx} className="bg-slate-50/50 border border-slate-100 rounded-2xl p-4 md:p-5 relative group/card">
                          <button
                            onClick={() => removeListItem('projects', idx)}
                            className="absolute top-4 right-4 text-slate-400 hover:text-red-500 opacity-0 group-hover/card:opacity-100 transition-opacity p-1.5 rounded-lg hover:bg-red-50"
                            title="Xóa dự án này"
                          >
                            <TrashIcon className="w-4 h-4" />
                          </button>

                          <div className="grid md:grid-cols-2 gap-4 mb-3">
                            <div>
                              <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Tên dự án</label>
                              <input
                                type="text"
                                value={proj.name}
                                onChange={(e) => updateField('projects', idx, 'name', e.target.value)}
                                className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-emerald-500 bg-white text-sm font-semibold text-slate-700 shadow-sm"
                                placeholder="Ví dụ: Website thương mại điện tử"
                              />
                            </div>
                            <div>
                              <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Vai trò trong dự án</label>
                              <input
                                type="text"
                                value={proj.role}
                                onChange={(e) => updateField('projects', idx, 'role', e.target.value)}
                                className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-emerald-500 bg-white text-sm font-semibold text-slate-700 shadow-sm"
                                placeholder="Ví dụ: Lập trình viên Backend"
                              />
                            </div>
                          </div>

                          <div className="mb-3">
                            <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Công nghệ sử dụng (Cách nhau bởi dấu phẩy)</label>
                            <input
                              type="text"
                              value={proj.tech_stack.join(', ')}
                              onChange={(e) => updateField('projects', idx, 'tech_stack', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                              className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-emerald-500 bg-white text-sm font-semibold text-slate-700 shadow-sm"
                              placeholder="Ví dụ: ReactJS, Node.js, PostgreSQL"
                            />
                          </div>

                          <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Mô tả dự án</label>
                            <textarea
                              rows={3}
                              value={proj.description}
                              onChange={(e) => updateField('projects', idx, 'description', e.target.value)}
                              className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-emerald-500 bg-white text-xs font-medium text-slate-700 shadow-sm leading-relaxed"
                              placeholder="Mô tả tóm tắt tính năng chính, công nghệ và kết quả dự án"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* TABS 4: education */}
                  {activeTab === 'education' && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-400 font-bold">Lịch sử học vấn, các trường đã học</span>
                        <button
                          onClick={() => addListItem('education', { school: '', degree: '', period: '' })}
                          className="flex items-center gap-1 text-xs font-bold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-xl border border-emerald-100 transition-all"
                        >
                          <PlusIcon className="w-4 h-4" />
                          Thêm học vấn
                        </button>
                      </div>

                      {profile.education.map((edu, idx) => (
                        <div key={idx} className="bg-slate-50/50 border border-slate-100 rounded-2xl p-4 md:p-5 relative group/card">
                          <button
                            onClick={() => removeListItem('education', idx)}
                            className="absolute top-4 right-4 text-slate-400 hover:text-red-500 opacity-0 group-hover/card:opacity-100 transition-opacity p-1.5 rounded-lg hover:bg-red-50"
                            title="Xóa học vấn này"
                          >
                            <TrashIcon className="w-4 h-4" />
                          </button>

                          <div className="grid md:grid-cols-2 gap-4 mb-3">
                            <div>
                              <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Trường học</label>
                              <input
                                type="text"
                                value={edu.school}
                                onChange={(e) => updateField('education', idx, 'school', e.target.value)}
                                className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-emerald-500 bg-white text-sm font-semibold text-slate-700 shadow-sm"
                                placeholder="Tên trường đại học / cao đẳng"
                              />
                            </div>
                            <div>
                              <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Bằng cấp / Ngành học</label>
                              <input
                                type="text"
                                value={edu.degree}
                                onChange={(e) => updateField('education', idx, 'degree', e.target.value)}
                                className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-emerald-500 bg-white text-sm font-semibold text-slate-700 shadow-sm"
                                placeholder="Ví dụ: Cử nhân Công nghệ thông tin"
                              />
                            </div>
                          </div>

                          <div className="w-full md:w-1/2">
                            <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Thời gian học</label>
                            <input
                              type="text"
                              value={edu.period}
                              onChange={(e) => updateField('education', idx, 'period', e.target.value)}
                              className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-emerald-500 bg-white text-sm font-semibold text-slate-700 shadow-sm"
                              placeholder="Ví dụ: 2019 - 2023"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* TABS 5: achievements */}
                  {activeTab === 'achievements' && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-400 font-bold">Các chứng chỉ chuyên môn, giải thưởng hoặc thành tựu nổi bật</span>
                        <button
                          onClick={() => addListItem('achievements', '')}
                          className="flex items-center gap-1 text-xs font-bold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-xl border border-emerald-100 transition-all"
                        >
                          <PlusIcon className="w-4 h-4" />
                          Thêm thành tựu
                        </button>
                      </div>

                      <div className="bg-slate-50/50 border border-slate-100 rounded-2xl p-4 space-y-3">
                        {profile.achievements.map((ach, idx) => (
                          <div key={idx} className="flex items-center gap-2 group/ach">
                            <span className="text-slate-300 font-bold shrink-0">•</span>
                            <input
                              type="text"
                              value={ach}
                              onChange={(e) => updateAchievement(idx, e.target.value)}
                              className="flex-1 px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-emerald-500 bg-white text-xs font-semibold text-slate-700 shadow-sm"
                              placeholder="Ví dụ: Chứng chỉ IELTS 7.5, Giải Nhì Hackathon..."
                            />
                            <button
                              onClick={() => removeListItem('achievements', idx)}
                              className="text-slate-400 hover:text-red-500 opacity-0 group-hover/ach:opacity-100 transition-opacity p-1.5 rounded-lg hover:bg-red-50 shrink-0"
                            >
                              <TrashIcon className="w-4 h-4" />
                            </button>
                          </div>
                        ))}

                        {profile.achievements.length === 0 && (
                          <div className="text-center py-6 text-slate-400 text-xs font-medium italic">
                            Chưa có chứng chỉ / thành tựu nào. Bấm "Thêm thành tựu" ở góc trên để tạo mới.
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                </div>
              </>
              )
            ) : (
              <div className="flex-1 flex items-center justify-center text-slate-400 text-sm font-semibold">
                Không tải được dữ liệu hồ sơ ứng viên
              </div>
            )}
          </div>
        </div>

      </div>

    </div>
  );
}