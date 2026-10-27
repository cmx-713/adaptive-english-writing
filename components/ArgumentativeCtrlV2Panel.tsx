import React, { useEffect, useState } from 'react';
import { analyzeArgumentativeCtrlScoreV2, type CtrlScore } from '../services/geminiService';
import { markArgumentativeCtrlV2Reviewed, saveArgumentativeCtrlScoreV2 } from '../services/supabaseDataService';
import { ARGUMENTATIVE_CTRL_DIMS, type ArgumentativeCtrlV2 } from '../services/argumentativeCtrlRubric';

interface Props {
  process: any;
  onSaved?: (processId: string, score: ArgumentativeCtrlV2) => void;
}

const ArgumentativeCtrlV2Panel: React.FC<Props> = ({ process, onSaved }) => {
  const [score, setScore] = useState<ArgumentativeCtrlV2 | null>(process.ctrl_score_argumentative_v2 || null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const oldScore = process.ctrl_score as CtrlScore | null;

  useEffect(() => setScore(process.ctrl_score_argumentative_v2 || null), [process.ctrl_score_argumentative_v2]);

  const analyze = async () => {
    setBusy(true);
    setError('');
    try {
      const result = await analyzeArgumentativeCtrlScoreV2({
        topic: process.topic || '',
        inspirationCards: process.inspiration_cards || [],
        userIdeas: process.user_ideas || {},
        validationResults: process.validation_results || {},
        dimensionDrafts: process.dimension_drafts || {},
        assembledEssay: process.assembled_essay || null,
        argumentReflection: process.argument_reflection || null,
      });
      const next = { ...result, source: 'teacher_manual' as const, reviewed: score?.reviewed === true };
      const { error: saveError } = await saveArgumentativeCtrlScoreV2(process.id, next);
      if (saveError) throw saveError;
      setScore(next);
      onSaved?.(process.id, next);
    } catch (err: any) {
      setError(err?.message || '分析或保存失败，请重试。');
    } finally {
      setBusy(false);
    }
  };

  const markReviewed = async () => {
    if (!score) return;
    setBusy(true);
    const { error: saveError } = await markArgumentativeCtrlV2Reviewed(process.id);
    if (saveError) setError('复核标记保存失败，请重试。');
    else {
      const next = { ...score, reviewed: true };
      setScore(next);
      onSaved?.(process.id, next);
    }
    setBusy(false);
  };

  return (
    <div className="mt-3 rounded-xl border border-slate-200 bg-white overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 px-4 py-3 border-b border-slate-100">
        <div>
          <p className="text-sm font-bold text-slate-800">议论文审辨信度 · 三项思维过程能力</p>
          <p className="text-[11px] text-slate-500">新版量规 argumentative-ct-v2 · 学生过程证据</p>
        </div>
        <div className="flex items-center gap-2">
          {score && <strong className="text-xl text-blue-900">{score.total === null ? '证据不足' : `${score.total.toFixed(1)} / 10`}</strong>}
          <button type="button" onClick={analyze} disabled={busy || process.status !== 'sent_to_grader'}
            className="rounded-lg bg-blue-900 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-40">
            {busy ? '处理中...' : score ? '重新分析' : '分析新版审辨信度'}
          </button>
          {score && !score.reviewed && <button type="button" onClick={markReviewed} disabled={busy}
            className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs text-emerald-700 disabled:opacity-40">标记已复核</button>}
        </div>
      </div>
      {error && <p role="alert" className="px-4 pt-3 text-xs text-rose-700">{error}</p>}
      {!score && <p className="p-4 text-xs text-slate-500">{process.status === 'sent_to_grader' ? '该篇尚未按新版量规评分。' : '提交作文后可分析完整写作过程。'}</p>}
      {score && <div className="space-y-4 p-4">
        {score.reviewed && <p className="text-xs text-emerald-700">教师已复核</p>}
        {ARGUMENTATIVE_CTRL_DIMS.map(dim => {
          const result = score.dimensions?.[dim.key];
          return <div key={dim.key} className="border-b border-slate-100 pb-3 last:border-0 last:pb-0">
            <div className="flex justify-between text-xs font-bold text-slate-700"><span>{dim.label}</span><span style={{ color: dim.color }}>{typeof result?.score === 'number' ? result.score.toFixed(1) : '证据不足'}</span></div>
            {typeof result?.score === 'number' && <div className="mt-1 h-1.5 rounded-full bg-slate-100"><div className="h-full rounded-full" style={{ width: `${result.score * 10}%`, backgroundColor: dim.color }} /></div>}
            <p className="mt-2 text-xs leading-relaxed text-slate-600">{result?.explanation || '现有过程证据不足。'}</p>
            {result?.evidence?.map((item, index) => <p key={index} className="mt-1 text-[11px] text-slate-500">学生原文（{item.source}）：“{item.quote}”</p>)}
          </div>;
        })}
        {score.overallComment && <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">{score.overallComment}</p>}
        {score.total === null && <p className="text-xs text-amber-700">有维度缺少学生过程证据，暂不计算总分。</p>}
      </div>}
      {oldScore?.total != null && <details className="border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
        <summary className="cursor-pointer">查看保留的旧版四维评分：{oldScore.total.toFixed(1)} / 10</summary>
        <div className="mt-2 space-y-1">
          <p>观点一致性：{oldScore.opinionConsistency ?? '—'} · 论证递进性：{oldScore.argumentProgression ?? '—'}</p>
          <p>语言自主性：{oldScore.linguisticAutonomy ?? '—'} · 观点拓展度：{oldScore.thoughtExpansion ?? '—'}</p>
        </div>
      </details>}
    </div>
  );
};

export default ArgumentativeCtrlV2Panel;
