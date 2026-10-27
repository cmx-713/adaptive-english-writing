import React, { useEffect, useRef, useState } from 'react';
import { analyzeArgumentativeCtrlScoreV2 } from '../services/geminiService';
import { getBatchArgumentativeCtrlV2Candidates, getBatchWritingTopics, saveArgumentativeCtrlScoreV2 } from '../services/supabaseDataService';
import { collectStudentEvidence, type ArgumentativeCtrlV2 } from '../services/argumentativeCtrlRubric';
import BatchTopicPicker, { type BatchTopicOption } from './BatchTopicPicker';

interface Props {
  classOptions: string[];
  onClose: () => void;
  onSaved: (processId: string, score: ArgumentativeCtrlV2, field: 'ctrl_score_argumentative_v2') => void;
}

const BatchArgumentativeCtrlV2Modal: React.FC<Props> = ({ classOptions, onClose, onSaved }) => {
  const [selectedClass, setSelectedClass] = useState('');
  const [selectedTopic, setSelectedTopic] = useState('');
  const [topics, setTopics] = useState<BatchTopicOption[]>([]);
  const [selectedBatch, setSelectedBatch] = useState('');
  const [loadingTopics, setLoadingTopics] = useState(false);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [includeExisting, setIncludeExisting] = useState(false);
  const [candidates, setCandidates] = useState<any[]>([]);
  const [loadedScopeKey, setLoadedScopeKey] = useState('');
  const [excluded, setExcluded] = useState({ narrative: 0, unknownMode: 0, emptyEssay: 0 });
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [complete, setComplete] = useState(0);
  const [partial, setPartial] = useState(0);
  const [failures, setFailures] = useState<any[]>([]);
  const [error, setError] = useState('');
  const stopRef = useRef(false);

  useEffect(() => {
    if (!selectedClass) { setTopics([]); return; }
    let active = true;
    setLoadingTopics(true);
    getBatchWritingTopics(selectedClass, 'argumentative').then(result => {
      if (!active) return;
      setTopics(result.data);
      setError(result.error ? '读取该班写作题目失败。' : '');
    }).catch(() => { if (active) setError('读取该班写作题目失败。'); })
      .finally(() => { if (active) setLoadingTopics(false); });
    return () => { active = false; };
  }, [selectedClass]);

  const invalidDateRange = !!fromDate && !!toDate && fromDate > toDate;
  const scopeKey = JSON.stringify([selectedClass, selectedTopic, fromDate, toDate, includeExisting]);
  useEffect(() => {
    setCandidates([]);
    setLoadedScopeKey('');
    setFailures([]);
    if (!selectedClass || !selectedTopic || invalidDateRange) { setLoading(false); return; }
    let active = true;
    setLoading(true);
    setError('');
    getBatchArgumentativeCtrlV2Candidates(selectedClass, {
      includeExisting, scope: { topic: selectedTopic, topicVariants: topics.find(item => item.topic === selectedTopic)?.variants, fromDate, toDate },
    }).then(result => {
      if (!active) return;
      setCandidates(result.data || []);
      setLoadedScopeKey(scopeKey);
      setExcluded(result.excluded);
      setError(result.error ? '读取候选记录失败。请确认已在 Supabase 执行新版字段迁移。' : '');
    }).catch(() => { if (active) setError('读取候选记录失败。'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [selectedClass, selectedTopic, fromDate, toDate, invalidDateRange, includeExisting]);

  const analyzeBatch = async (batch: any[]) => {
    if (!selectedClass || !selectedTopic || invalidDateRange || loading || loadedScopeKey !== scopeKey || !batch.length) return;
    stopRef.current = false;
    setRunning(true);
    setError('');
    const failed: any[] = [];
    for (let index = 0; index < batch.length; index++) {
      if (stopRef.current) break;
      const process = batch[index];
      try {
        const score = await analyzeArgumentativeCtrlScoreV2({
          topic: process.topic || '',
          inspirationCards: process.inspiration_cards || [],
          userIdeas: process.user_ideas || {},
          validationResults: process.validation_results || {},
          dimensionDrafts: process.dimension_drafts || {},
          assembledEssay: process.assembled_essay || null,
          argumentReflection: process.argument_reflection || null,
        });
        const { error: saveError } = await saveArgumentativeCtrlScoreV2(process.id, score);
        if (saveError) throw saveError;
        onSaved(process.id, score, 'ctrl_score_argumentative_v2');
        setCandidates(previous => previous.filter(item => item.id !== process.id));
        if (score.total === null) setPartial(value => value + 1);
        else setComplete(value => value + 1);
      } catch (err) {
        failed.push(process);
        setError(`部分记录分析或保存失败，可重新尝试失败的记录。${err instanceof Error ? `最近错误：${err.message}` : ''}`);
      }
      setProgress(value => value + 1);
    }
    setFailures(failed);
    setRunning(false);
  };

  const partialCandidates = candidates.filter(process => {
    const evidence = collectStudentEvidence({
      topic: process.topic || '', inspirationCards: process.inspiration_cards || [],
      userIdeas: process.user_ideas || {}, validationResults: process.validation_results || {},
      dimensionDrafts: process.dimension_drafts || {}, assembledEssay: process.assembled_essay || null,
      argumentReflection: process.argument_reflection || null,
    });
    return !evidence.some(item => item.source === 'student_answer' || item.source === 'student_reflection');
  }).length;

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4">
    <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-xl bg-white shadow-xl border border-slate-200 p-6 space-y-4">
      <div className="flex justify-between gap-3"><div><h2 className="text-lg font-bold text-slate-800">议论文新版量规 · 历史重评</h2><p className="text-xs text-slate-500">仅评已提交议论文；旧版分数保留</p></div><button disabled={running} onClick={onClose} aria-label="关闭" className="text-slate-500 disabled:opacity-40">✕</button></div>
      <label className="block text-sm">班级
        <select value={selectedClass} onChange={event => { setSelectedClass(event.target.value); setSelectedTopic(''); setSelectedBatch(''); setTopics([]); setCandidates([]); setFromDate(''); setToDate(''); setProgress(0); setComplete(0); setPartial(0); setFailures([]); }} disabled={running} className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2">
          <option value="">请选择班级</option>{classOptions.map(label => <option key={label} value={label}>{label}</option>)}
        </select>
      </label>
      <label className="block text-sm">写作题目
        <BatchTopicPicker topics={topics} value={selectedTopic}
          onChange={topic => { setSelectedTopic(topic); setSelectedBatch(''); setFromDate(''); setToDate(''); setProgress(0); setComplete(0); setPartial(0); setFailures([]); }}
          disabled={!selectedClass || loadingTopics || running} placeholder="请选择要评分的题目" />
      </label>
      {selectedClass && !loadingTopics && !topics.length && !error && <p className="text-xs text-slate-500">该班暂无已送批改的议论文题目。</p>}
      {selectedTopic && <div className="space-y-2 text-xs text-slate-600">
        <p>相同或近似题目已归并；需要指定某一批时请选择批次。</p>
        {(topics.find(item => item.topic === selectedTopic)?.batches.length || 0) > 1 && <select value={selectedBatch} onChange={event => { const key = event.target.value; setSelectedBatch(key); setFromDate(key); setToDate(key); }} disabled={running} className="w-full border border-slate-300 rounded-lg px-2 py-2 text-sm">
          <option value="">全部批次（{topics.find(item => item.topic === selectedTopic)?.count || 0} 篇）</option>
          {topics.find(item => item.topic === selectedTopic)?.batches.map(batch => <option key={batch.key} value={batch.key}>{batch.label}</option>)}
        </select>}
        <p>也可以用日期范围进一步限定。</p>
        <div className="grid grid-cols-2 gap-2">
          <label>开始日期<input type="date" value={fromDate} onChange={event => setFromDate(event.target.value)} disabled={running} className="mt-1 w-full border border-slate-300 rounded-lg px-2 py-2" /></label>
          <label>结束日期<input type="date" value={toDate} onChange={event => setToDate(event.target.value)} disabled={running} className="mt-1 w-full border border-slate-300 rounded-lg px-2 py-2" /></label>
        </div>
        {invalidDateRange && <p role="alert" className="text-rose-700">结束日期不能早于开始日期。</p>}
      </div>}
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={includeExisting} disabled={running} onChange={event => setIncludeExisting(event.target.checked)} />主动重新评分已有新版分数</label>
      {loading ? <p className="text-sm text-slate-500">正在读取候选记录…</p> : selectedClass && selectedTopic && !invalidDateRange && <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-xs text-slate-700 space-y-1">
        <p>{selectedTopic}：待分析 {candidates.length} 篇；其中约 {partialCandidates} 篇缺少学生追问回答或自检记录，可能只能得到部分评价。</p>
        <p>已排除记叙文 {excluded.narrative} 篇、文体无法确认 {excluded.unknownMode} 篇、没有完整文章 {excluded.emptyEssay} 篇。</p>
      </div>}
      {(running || progress > 0) && <p className="text-sm text-slate-600">已处理 {progress} 篇；完整评分 {complete} 篇，证据不足 {partial} 篇，失败 {failures.length} 篇。</p>}
      {error && <p role="alert" className="text-xs text-rose-700">{error}</p>}
      <div className="flex gap-2 justify-end">
        {running ? <button onClick={() => { stopRef.current = true; }} className="px-4 py-2 rounded-lg border border-slate-300">处理当前篇后停止</button> : <>
          {failures.length > 0 && <button onClick={() => analyzeBatch(failures)} className="px-4 py-2 rounded-lg border border-slate-300">重试失败项</button>}
          <button disabled={loading || candidates.length === 0 || !selectedClass || !selectedTopic || invalidDateRange || loadedScopeKey !== scopeKey || !!error} onClick={() => analyzeBatch(candidates)} className="px-4 py-2 rounded-lg bg-blue-900 text-white disabled:opacity-40">开始分析</button>
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-300">关闭</button>
        </>}
      </div>
    </div>
  </div>;
};

export default BatchArgumentativeCtrlV2Modal;
