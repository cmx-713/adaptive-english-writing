import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { getEssaySubmissionRecords, getWritingProcessStatuses, normalizeWritingTopic } from '../../services/supabaseDataService'
import { isArgumentativeProcess } from '../../services/argumentativeCtrlRubric'

interface Props {
  students: any[]
  selectedClass: string
  classOptions: string[]
}

interface ClassSubmission {
  className: string
  studentIds: Set<string>
  workingIds: Set<string>
  gradedCount: number
}

interface TopicSubmission {
  key: string
  title: string
  variants: Map<string, number>
  classes: Map<string, ClassSubmission>
  studentIds: Set<string>
  workingIds: Set<string>
  gradedCount: number
}

const localDate = (value: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

const EssaySubmissionTab: React.FC<Props> = ({ students, selectedClass, classOptions }) => {
  const [grades, setGrades] = useState<any[]>([])
  const [processes, setProcesses] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [selectedTopicKey, setSelectedTopicKey] = useState('')
  const [modeFilter, setModeFilter] = useState<'all' | 'argumentative' | 'narrative'>('all')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

  const loadRecords = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [gradeResult, processResult] = await Promise.all([getEssaySubmissionRecords(), getWritingProcessStatuses()])
      if (gradeResult.error || processResult.error) throw gradeResult.error || processResult.error
      setGrades(gradeResult.data)
      setProcesses(processResult.data)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '读取提交记录失败，请重试。')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void loadRecords() }, [loadRecords])

  const topics = useMemo(() => {
    const grouped = new Map<string, TopicSubmission>()
    const registeredIds = new Set(students.map(student => String(student.id)))
    const entryFor = (record: any) => {
      const recordDate = localDate(record.created_at)
      if ((fromDate && recordDate < fromDate) || (toDate && recordDate > toDate)) return null
      const title = typeof record.topic === 'string' ? record.topic.trim() : ''
      const userId = String(record.user_id || '')
      const className = String(record.wc_users?.class_name || '').trim() || '未分班'
      if (!title || !registeredIds.has(userId) || (selectedClass !== 'all' && className !== selectedClass)) return null
      const key = normalizeWritingTopic(title)
      if (!key) return null
      let topic = grouped.get(key)
      if (!topic) {
        topic = { key, title, variants: new Map(), classes: new Map(), studentIds: new Set(), workingIds: new Set(), gradedCount: 0 }
        grouped.set(key, topic)
      }
      topic.variants.set(title, (topic.variants.get(title) || 0) + 1)
      if ((topic.variants.get(title) || 0) > (topic.variants.get(topic.title) || 0)) topic.title = title
      let classEntry = topic.classes.get(className)
      if (!classEntry) {
        classEntry = { className, studentIds: new Set(), workingIds: new Set(), gradedCount: 0 }
        topic.classes.set(className, classEntry)
      }
      return { topic, classEntry, userId }
    }
    for (const process of processes) {
      if (modeFilter !== 'all' && isArgumentativeProcess(process) !== (modeFilter === 'argumentative')) continue
      const entry = entryFor(process)
      if (!entry) continue
      if (process.status === 'sent_to_grader') {
        entry.topic.studentIds.add(entry.userId)
        entry.classEntry.studentIds.add(entry.userId)
      } else if (process.status === 'in_progress' || process.status === 'completed') {
        entry.topic.workingIds.add(entry.userId)
        entry.classEntry.workingIds.add(entry.userId)
      }
    }
    for (const grade of grades) {
      if (modeFilter !== 'all' && (grade.writing_mode || 'argumentative') !== modeFilter) continue
      const entry = entryFor(grade)
      if (!entry) continue
      entry.topic.studentIds.add(entry.userId)
      entry.classEntry.studentIds.add(entry.userId)
      entry.topic.gradedCount += 1
      entry.classEntry.gradedCount += 1
    }
    return [...grouped.values()].sort((a, b) => b.studentIds.size - a.studentIds.size || a.title.localeCompare(b.title, 'zh-CN'))
  }, [grades, processes, students, selectedClass, modeFilter, fromDate, toDate])

  useEffect(() => {
    if (!topics.some(topic => topic.key === selectedTopicKey)) setSelectedTopicKey(topics[0]?.key || '')
  }, [topics, selectedTopicKey])

  const visibleTopics = topics.filter(topic =>
    [...topic.variants.keys()].some(variant => variant.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())))
  const selectedTopic = topics.find(topic => topic.key === selectedTopicKey)
  const classNames = selectedClass === 'all'
    ? [...new Set([...classOptions, ...students.map(student => String(student.class_name || '').trim()).filter(Boolean), ...(selectedTopic?.classes.keys() || [])])]
      .filter(name => name === '未分班' || students.some(student => String(student.class_name || '').trim() === name) || selectedTopic?.classes.has(name))
    : [selectedClass]

  return <div className="space-y-5 animate-fade-in-up">
    <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-5">
      <div>
        <h2 className="text-lg font-bold text-slate-900">按题目查看提交情况</h2>
        <p className="mt-1 text-sm text-slate-500">“已送批改”按学生档案中的写作过程状态统计，并纳入直接提交后已有批改记录的作文；“进行中”不计入已送人数。同一学生重复提交只计 1 人。</p>
      </div>
      <button type="button" onClick={() => void loadRecords()} disabled={loading}
        className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
        {loading ? '读取中…' : '刷新统计'}
      </button>
    </div>

    <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
      <label className="text-xs text-slate-600">文体<select value={modeFilter} onChange={event => setModeFilter(event.target.value as 'all' | 'argumentative' | 'narrative')} className="mt-1 block rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm"><option value="all">全部文体</option><option value="argumentative">议论文</option><option value="narrative">记叙文</option></select></label>
      <span className="pb-2 text-sm font-medium text-slate-700">记录日期范围</span>
      <label className="text-xs text-slate-600">开始日期<input type="date" value={fromDate} onChange={event => setFromDate(event.target.value)} className="mt-1 block rounded-lg border border-slate-300 px-2 py-1.5 text-sm" /></label>
      <label className="text-xs text-slate-600">结束日期<input type="date" value={toDate} onChange={event => setToDate(event.target.value)} className="mt-1 block rounded-lg border border-slate-300 px-2 py-1.5 text-sm" /></label>
      {(fromDate || toDate) && <button type="button" onClick={() => { setFromDate(''); setToDate('') }} className="pb-2 text-sm text-blue-800 hover:underline">清除日期</button>}
      <p className="w-full text-xs text-slate-500">写作过程按开始日期、批改记录按保存日期筛选；同一题目多次布置时，可缩小日期范围。</p>
      {fromDate && toDate && fromDate > toDate && <p role="alert" className="w-full text-xs text-rose-700">结束日期不能早于开始日期。</p>}
    </div>

    {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">读取失败：{error}</div>}
    {loading ? <div className="py-16 text-center text-sm text-slate-500">正在统计提交情况…</div> : !error && topics.length === 0
      ? <div className="rounded-2xl border border-slate-200 bg-white py-16 text-center text-sm text-slate-500">当前班级暂无写作过程或批改记录。</div>
      : !error && <div className="grid gap-5 lg:grid-cols-[minmax(280px,360px)_minmax(0,1fr)]">
        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <label htmlFor="submission-topic-search" className="mb-2 block text-sm font-semibold text-slate-700">选择作文题目 · {topics.length} 个</label>
          <input id="submission-topic-search" value={search} onChange={event => setSearch(event.target.value)}
            placeholder="搜索题目" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-600" />
          <div className="mt-3 max-h-[34rem] space-y-1 overflow-y-auto">
            {visibleTopics.length ? visibleTopics.map(topic => <button type="button" key={topic.key}
              onClick={() => setSelectedTopicKey(topic.key)}
              className={`w-full rounded-lg px-3 py-3 text-left ${selectedTopicKey === topic.key ? 'bg-blue-50 text-blue-900 ring-1 ring-blue-200' : 'text-slate-700 hover:bg-slate-50'}`}>
              <span className="block break-words text-sm font-semibold">{topic.title}</span>
              <span className="mt-1 block text-xs text-slate-500">{topic.studentIds.size} 人已送批改 · {topic.gradedCount} 篇有批改记录</span>
            </button>) : <p className="px-2 py-5 text-center text-sm text-slate-500">没有匹配的题目</p>}
          </div>
        </section>

        {selectedTopic && <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h3 className="break-words text-lg font-bold text-slate-900">{selectedTopic.title}</h3>
          <p className="mt-1 text-sm text-slate-500">{selectedTopic.studentIds.size} 人已送批改 · {selectedTopic.gradedCount} 篇有批改记录</p>
          {selectedTopic.variants.size > 1 && <p className="mt-2 text-xs text-slate-500">已合并 {selectedTopic.variants.size} 种大小写、空格或标点不同的题目写法。</p>}
          <div className="mt-5 space-y-3">
            {classNames.map(className => {
              const entry = selectedTopic.classes.get(className)
              const classStudents = students.filter(student => (String(student.class_name || '').trim() || '未分班') === className)
              const submittedIds = entry?.studentIds || new Set<string>()
              const workingIds = entry?.workingIds || new Set<string>()
              const submitted = classStudents.filter(student => submittedIds.has(String(student.id)))
              const working = classStudents.filter(student => !submittedIds.has(String(student.id)) && workingIds.has(String(student.id)))
              const pending = classStudents.filter(student => !submittedIds.has(String(student.id)) && !workingIds.has(String(student.id)))
              const submittedCount = submittedIds.size
              return <div key={className} className="rounded-xl border border-slate-200 p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h4 className="font-semibold text-slate-800">{className}</h4>
                  <div className="text-sm text-slate-700"><strong className="text-lg text-blue-800">{submittedCount}</strong> / {classStudents.length} 人已送批改 <span className="ml-2 text-slate-500">· {entry?.gradedCount || 0} 篇有批改记录</span></div>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-600" style={{ width: `${classStudents.length ? Math.min(100, submittedCount / classStudents.length * 100) : 0}%` }} /></div>
                <details className="mt-3 text-sm text-slate-600">
                  <summary className="cursor-pointer font-medium text-blue-800">查看学生名单</summary>
                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    <div><p className="font-semibold text-emerald-700">已送批改（{submitted.length} 人）</p><p className="mt-1 leading-relaxed">{submitted.map(student => `${student.name || '未命名'}${student.student_id ? `（${student.student_id}）` : ''}`).join('、') || '暂无'}</p></div>
                    <div><p className="font-semibold text-amber-700">尚未送批改，已有过程（{working.length} 人）</p><p className="mt-1 leading-relaxed">{working.map(student => `${student.name || '未命名'}${student.student_id ? `（${student.student_id}）` : ''}`).join('、') || '暂无'}</p></div>
                    <div><p className="font-semibold text-slate-600">暂无该题记录（{pending.length} 人）</p><p className="mt-1 leading-relaxed">{pending.map(student => `${student.name || '未命名'}${student.student_id ? `（${student.student_id}）` : ''}`).join('、') || '暂无'}</p></div>
                  </div>
                </details>
              </div>
            })}
          </div>
          <p className="mt-4 text-xs text-slate-500">班级总人数按当前已注册且分配到该班的学生计算；无人开始写作且没有批改记录的题目不会出现在列表中。</p>
        </section>}
      </div>}
  </div>
}

export default EssaySubmissionTab
