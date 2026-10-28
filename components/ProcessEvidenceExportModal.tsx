import React, { useEffect, useMemo, useState } from 'react'
import BatchTopicPicker, { type BatchTopicOption } from './BatchTopicPicker'
import { getBatchWritingTopics, getEvidenceExportProcesses } from '../services/supabaseDataService'
import { downloadProcessEvidenceBundle, downloadProcessEvidenceJsonBundle } from '../services/writingEvidenceExport'

interface Props {
  classOptions: string[]
  initialClass?: string
  onClose: () => void
}

const ProcessEvidenceExportModal: React.FC<Props> = ({ classOptions, initialClass = '', onClose }) => {
  const [className, setClassName] = useState(initialClass)
  const [mode, setMode] = useState<'argumentative' | 'narrative'>('argumentative')
  const [topic, setTopic] = useState('')
  const [topics, setTopics] = useState<BatchTopicOption[]>([])
  const [batch, setBatch] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [topicLoading, setTopicLoading] = useState(false)
  const [recordLoading, setRecordLoading] = useState(false)
  const [records, setRecords] = useState<any[]>([])
  const [students, setStudents] = useState<any[]>([])
  const [coverage, setCoverage] = useState<{ sentStudents: number; completeStudents: number; missingStudents: any[] } | null>(null)
  const [loadedScopeKey, setLoadedScopeKey] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const selectedTopic = topics.find(item => item.topic === topic)
  const invalidDateRange = !!fromDate && !!toDate && fromDate > toDate
  const scopeKey = useMemo(() => JSON.stringify([className, mode, topic, selectedTopic?.variants, fromDate, toDate]),
    [className, mode, topic, selectedTopic, fromDate, toDate])

  useEffect(() => {
    setTopics([])
    setTopic('')
    setRecords([])
    setCoverage(null)
    setLoadedScopeKey('')
    setError('')
    if (!className) return
    let active = true
    setTopicLoading(true)
    getBatchWritingTopics(className, mode).then(result => {
      if (!active) return
      setTopics(result.data)
      if (result.error) setError('读取写作题目失败，请重试。')
    }).catch(err => {
      if (active) setError(`读取写作题目失败：${err instanceof Error ? err.message : String(err)}`)
    }).finally(() => { if (active) setTopicLoading(false) })
    return () => { active = false }
  }, [className, mode])

  useEffect(() => {
    setRecords([])
    setStudents([])
    setCoverage(null)
    setLoadedScopeKey('')
    setMessage('')
    if (!className || !topic || !selectedTopic || invalidDateRange) {
      setRecordLoading(false)
      return
    }
    let active = true
    setRecordLoading(true)
    setError('')
    getEvidenceExportProcesses(className, mode, {
      topic,
      topicVariants: selectedTopic.variants,
      fromDate,
      toDate,
    }).then(result => {
      if (!active) return
      if (result.error) {
        setError('读取该题目过程记录失败，请重试。')
        return
      }
      setRecords(result.data)
      setStudents(result.students)
      setCoverage(result.coverage || null)
      setLoadedScopeKey(scopeKey)
    }).catch(err => {
      if (active) setError(`读取过程记录失败：${err instanceof Error ? err.message : String(err)}`)
    }).finally(() => { if (active) setRecordLoading(false) })
    return () => { active = false }
  }, [className, mode, topic, selectedTopic, fromDate, toDate, invalidDateRange, scopeKey])

  const chooseTopic = (next: string) => {
    setTopic(next)
    setBatch('')
    setFromDate('')
    setToDate('')
  }

  const chooseBatch = (value: string) => {
    setBatch(value)
    setFromDate(value)
    setToDate(value)
  }

  const download = (format: 'markdown' | 'json') => {
    if (!topic || !records.length || loadedScopeKey !== scopeKey || recordLoading || error) return
    const label = [className, mode === 'narrative' ? '记叙文' : '议论文', topic, fromDate || toDate ? `${fromDate || '起'}至${toDate || '今'}` : '全部批次'].join('_')
    try {
      if (format === 'json') downloadProcessEvidenceJsonBundle(records, students, label, coverage)
      else downloadProcessEvidenceBundle(records, students, label, coverage)
      setMessage(`已开始下载该题目的 ${records.length} 条完整过程记录。`)
    } catch (err) {
      setError(`生成证据包失败：${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const canDownload = !!topic && records.length > 0 && !recordLoading && loadedScopeKey === scopeKey && !error

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4">
    <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-xl border border-slate-200 bg-white p-6 shadow-xl space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-800">按题目导出教学过程证据包</h2>
          <p className="text-xs text-slate-500 mt-1">选定班级与题目后，仅导出该题目对应的写作过程。</p>
        </div>
        <button type="button" onClick={onClose} aria-label="关闭" className="text-slate-400 hover:text-slate-700 text-xl">✕</button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="text-sm text-slate-700">班级
          <select value={className} onChange={event => { setClassName(event.target.value); setBatch(''); setFromDate(''); setToDate('') }} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2">
            <option value="">请选择班级</option>
            {classOptions.map(value => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <label className="text-sm text-slate-700">文体
          <select value={mode} onChange={event => { setMode(event.target.value as 'argumentative' | 'narrative'); setBatch(''); setFromDate(''); setToDate('') }} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2">
            <option value="argumentative">议论文</option>
            <option value="narrative">记叙文</option>
          </select>
        </label>
      </div>

      <div className="space-y-1.5">
        <label className="text-sm text-slate-700">写作题目</label>
        <BatchTopicPicker topics={topics} value={topic} onChange={chooseTopic} disabled={!className || topicLoading} placeholder={topicLoading ? '正在读取题目…' : '请选择要导出的题目'} countLabel="条完整过程" />
        {className && !topicLoading && !topics.length && !error && <p className="text-xs text-slate-500">该班暂无可导出的成文记录。</p>}
      </div>

      {selectedTopic && <div className="space-y-2">
        {selectedTopic.batches.length > 1 && <label className="block text-sm text-slate-700">写作批次
          <select value={batch} onChange={event => chooseBatch(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2">
            <option value="">全部批次（{selectedTopic.count} 条完整过程）</option>
            {selectedTopic.batches.map(item => <option key={item.key} value={item.key}>{item.label}</option>)}
          </select>
        </label>}
        <p className="text-xs text-slate-500">同一题目多次布置时，可选择批次或用日期限定。过程按创建日期、批改记录按生成日期筛选。</p>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs text-slate-600">开始日期<input type="date" value={fromDate} onChange={event => { setFromDate(event.target.value); setBatch('') }} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2" /></label>
          <label className="text-xs text-slate-600">结束日期<input type="date" value={toDate} onChange={event => { setToDate(event.target.value); setBatch('') }} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2" /></label>
        </div>
      </div>}

      {invalidDateRange && <p role="alert" className="text-sm text-rose-700">结束日期不能早于开始日期。</p>}
      {recordLoading && <p className="text-sm text-slate-500">正在统计该题目的过程记录…</p>}
      {topic && !recordLoading && loadedScopeKey === scopeKey && <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
        <p>{className} · {topic}：<strong>{coverage?.sentStudents ?? 0}</strong> 人已送批改，<strong>{records.length}</strong> 条过程记录可导出（覆盖 {coverage?.completeStudents ?? 0} 人）。</p>
        {!!coverage?.missingStudents.length && <details className="mt-2">
          <summary className="cursor-pointer text-amber-800">另有 {coverage.missingStudents.length} 人已送批改，但缺少可导出的完整过程；查看名单</summary>
          <p className="mt-2 text-xs leading-relaxed text-slate-700">{coverage.missingStudents.map(student => `${student.name || '未命名'}${student.student_id ? `（${student.student_id}）` : ''}`).join('、')}</p>
        </details>}
      </div>}
      {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
      {message && <p role="status" className="text-sm text-emerald-700">{message}</p>}

      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" onClick={() => download('markdown')} disabled={!canDownload} className="rounded-lg bg-blue-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-40">导出可阅读证据包</button>
        <button type="button" onClick={() => download('json')} disabled={!canDownload} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 disabled:opacity-40">导出 JSON 数据</button>
        <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-slate-500">关闭</button>
      </div>
    </div>
  </div>
}

export default ProcessEvidenceExportModal
