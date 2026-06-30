interface InterviewProgressProps {
  current: number;
  total: number;
}

export default function InterviewProgress({ current, total }: InterviewProgressProps) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  return (
    <div className="w-full">
      <div className="flex justify-between text-sm text-slate-600 mb-1 font-medium">
        <span>Câu hỏi chính: {current}/{total}</span>
        <span>{pct}%</span>
      </div>
      <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
        <div
          className="h-full bg-primary-600 transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-[11px] text-slate-400 mt-2 font-medium italic">
        * Tiến độ chỉ đếm câu hỏi chính, các câu hỏi phụ (đào sâu) sẽ không làm tăng tổng số câu.
      </p>
    </div>
  );
}
