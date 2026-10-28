import React, { useMemo, useState } from 'react'

export interface BatchTopicOption {
  topic: string
  count: number
  variants: string[]
  batches: Array<{ key: string; label: string; count: number }>
}

interface Props {
  topics: BatchTopicOption[]
  value: string
  onChange: (topic: string) => void
  disabled?: boolean
  placeholder?: string
  countLabel?: string
}

/** 大量题目时使用搜索+滚动列表，避免原生 select 撑满页面。 */
const BatchTopicPicker: React.FC<Props> = ({ topics, value, onChange, disabled, placeholder = '请选择要评分的题目', countLabel = '篇' }) => {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const selected = topics.find(item => item.topic === value)
  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase()
    if (!query) return topics
    return topics.filter(item => [item.topic, ...item.variants].some(text => text.toLocaleLowerCase().includes(query)))
  }, [topics, search])

  return <div className="relative">
    <button type="button" disabled={disabled} onClick={() => { setOpen(current => !current); setSearch('') }}
      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-left text-sm disabled:opacity-50 flex items-center justify-between gap-3">
      <span className={selected ? 'text-slate-800 truncate' : 'text-slate-400 truncate'}>
        {selected ? `${selected.topic}（${selected.count} ${countLabel}）` : placeholder}
      </span>
      <span className="text-slate-400 shrink-0">{open ? '⌃' : '⌄'}</span>
    </button>
    {open && <div className="absolute z-40 mt-1 w-full rounded-lg border border-slate-300 bg-white shadow-xl overflow-hidden">
      <div className="p-2 border-b border-slate-200">
        <input autoFocus value={search} onChange={event => setSearch(event.target.value)}
          placeholder="搜索题目或原始写法…" className="w-full rounded-md border border-slate-200 px-2.5 py-2 text-sm outline-none focus:border-blue-500" />
      </div>
      <div className="max-h-64 overflow-y-auto p-1">
        {filtered.length ? filtered.map(item => <button type="button" key={item.topic}
          onClick={() => { onChange(item.topic); setOpen(false); setSearch('') }}
          className={`w-full rounded-md px-3 py-2 text-left text-sm hover:bg-blue-50 ${item.topic === value ? 'bg-blue-50 text-blue-800 font-semibold' : 'text-slate-700'}`}>
          <span className="block truncate">{item.topic}</span>
          <span className="block text-xs text-slate-400 mt-0.5">{item.count} {countLabel} · {item.batches.length} 个批次{item.variants.length > 1 ? ` · ${item.variants.length} 种原始写法` : ''}</span>
        </button>) : <p className="px-3 py-5 text-center text-sm text-slate-400">没有匹配的题目</p>}
      </div>
    </div>}
  </div>
}

export default BatchTopicPicker
