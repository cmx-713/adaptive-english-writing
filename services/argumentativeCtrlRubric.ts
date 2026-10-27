import type { WritingMode } from '../types';

export const ARGUMENTATIVE_CTRL_VERSION = 'argumentative-ct-v2' as const;
export const ARGUMENTATIVE_CTRL_KEYS = ['argumentEvidence', 'reasoningConditions', 'argumentRevision'] as const;
export type ArgumentativeCtrlKey = typeof ARGUMENTATIVE_CTRL_KEYS[number];
export type ArgumentativeEvidenceSource = 'initial_idea' | 'student_answer' | 'student_draft' | 'student_final' | 'student_reflection';

export interface ArgumentativeEvidence {
  source: ArgumentativeEvidenceSource;
  cardId?: string;
  quote: string;
}

export interface ArgumentativeCtrlDimension {
  score: number | null;
  evidenceStatus: 'sufficient' | 'insufficient';
  evidence: ArgumentativeEvidence[];
  explanation: string;
}

export interface ArgumentativeCtrlV2 {
  rubricVersion: typeof ARGUMENTATIVE_CTRL_VERSION;
  writingMode: 'argumentative';
  dimensions: Record<ArgumentativeCtrlKey, ArgumentativeCtrlDimension>;
  total: number | null;
  overallComment: string;
  analyzedAt: string;
  source: 'auto' | 'teacher_manual';
  reviewed: boolean;
}

export interface ArgumentReflection {
  text: string;
  updatedAt: string;
}

export interface ArgumentativeProcessInput {
  topic: string;
  inspirationCards: Array<{ id: string; dimension?: string; narrativeRole?: string }>;
  userIdeas: Record<string, string>;
  validationResults: Record<string, any>;
  dimensionDrafts: Record<string, { draft?: string; dimension?: string }>;
  assembledEssay: { introduction?: string; bodyParagraphs?: Array<{ draft?: string }>; conclusion?: string } | null;
  argumentReflection?: ArgumentReflection | null;
}

export interface StudentEvidenceText {
  source: ArgumentativeEvidenceSource;
  cardId?: string;
  text: string;
}

export const ARGUMENTATIVE_CTRL_DIMS = [
  { key: 'argumentEvidence', label: '论点与依据辨识', weight: 33.3, color: '#2563eb' },
  { key: 'reasoningConditions', label: '推理与条件审查', weight: 33.3, color: '#059669' },
  { key: 'argumentRevision', label: '自我监控与有据修订', weight: 33.4, color: '#d97706' },
] as const;

const sourceKinds: ArgumentativeEvidenceSource[] = [
  'initial_idea', 'student_answer', 'student_draft', 'student_final', 'student_reflection',
];

export const collectStudentEvidence = (process: ArgumentativeProcessInput): StudentEvidenceText[] => {
  const entries: StudentEvidenceText[] = [];
  const add = (source: ArgumentativeEvidenceSource, text: unknown, cardId?: string) => {
    if (typeof text === 'string' && text.trim()) entries.push({ source, cardId, text: text.trim() });
  };
  const cardIds = new Set([
    ...(process.inspirationCards || []).map(card => card.id),
    ...Object.keys(process.userIdeas || {}),
    ...Object.keys(process.validationResults || {}),
    ...Object.keys(process.dimensionDrafts || {}),
  ]);
  for (const cardId of cardIds) {
    add('initial_idea', process.userIdeas?.[cardId], cardId);
    const turns = process.validationResults?.[cardId]?.conversation;
    if (Array.isArray(turns)) turns.forEach(turn => add('student_answer', turn?.studentResponse, cardId));
    add('student_draft', process.dimensionDrafts?.[cardId]?.draft, cardId);
  }
  const final = process.assembledEssay;
  if (final) {
    add('student_final', [final.introduction, ...(final.bodyParagraphs || []).map(part => part.draft), final.conclusion].filter(Boolean).join('\n\n'));
  }
  add('student_reflection', process.argumentReflection?.text);
  return entries;
};

export const isArgumentativeProcess = (process: {
  writing_mode?: WritingMode | null;
  inspiration_cards?: Array<{ narrativeRole?: string }> | null;
}): boolean | null => {
  if (process.writing_mode === 'narrative') return false;
  if (process.writing_mode === 'argumentative') return true;
  const cards = process.inspiration_cards;
  if (!Array.isArray(cards) || !cards.length) return null;
  return cards.some(card => !!card?.narrativeRole) ? false : true;
};

const compact = (value: string) => value.replace(/\s+/g, ' ').trim();

export const normalizeArgumentativeCtrlV2 = (
  raw: any,
  sources: StudentEvidenceText[],
  source: 'auto' | 'teacher_manual' = 'auto',
): ArgumentativeCtrlV2 => {
  if (!raw || typeof raw !== 'object' || !raw.dimensions || typeof raw.dimensions !== 'object') {
    throw new Error('议论文审辨评分格式不完整，请重试。');
  }
  const hasProcessText = sources.some(entry => entry.source === 'initial_idea' || entry.source === 'student_answer' || entry.source === 'student_draft');
  const hasStudentMonitoring = sources.some(entry => entry.source === 'student_answer' || entry.source === 'student_reflection');
  const dimensions = {} as Record<ArgumentativeCtrlKey, ArgumentativeCtrlDimension>;
  for (const key of ARGUMENTATIVE_CTRL_KEYS) {
    const candidate = raw.dimensions[key];
    if (!candidate || typeof candidate !== 'object') throw new Error(`议论文审辨评分缺少 ${key}，请重试。`);
    const evidence: ArgumentativeEvidence[] = Array.isArray(candidate.evidence)
      ? candidate.evidence.filter((item: any): item is ArgumentativeEvidence => {
          if (!item || !sourceKinds.includes(item.source) || typeof item.quote !== 'string' || !item.quote.trim()) return false;
          return sources.some(entry => entry.source === item.source
            && (!item.cardId || entry.cardId === item.cardId)
            && compact(entry.text).includes(compact(item.quote)));
        }).map((item: ArgumentativeEvidence) => ({ source: item.source, cardId: item.cardId, quote: item.quote.trim() }))
      : [];
    const value = Number(candidate.score);
    const validScore = candidate.score !== null && candidate.score !== undefined && Number.isFinite(value) && value >= 0 && value <= 10;
    // 修订能力必须有学生自己说明判断或调整的原文；终稿与 AI 路线图不能替代。
    const monitoringEvidence = evidence.some(item => item.source === 'student_answer' || item.source === 'student_reflection');
    const assessable = hasProcessText && (key !== 'argumentRevision' || (hasStudentMonitoring && monitoringEvidence));
    const score = assessable && validScore && evidence.length > 0 && candidate.evidenceStatus !== 'insufficient'
      ? Math.round(value * 10) / 10
      : null;
    dimensions[key] = {
      score,
      evidenceStatus: score === null ? 'insufficient' : 'sufficient',
      evidence: score === null ? [] : evidence,
      explanation: typeof candidate.explanation === 'string' && candidate.explanation.trim()
        ? candidate.explanation.trim()
        : '现有学生过程证据不足，无法判断该项能力。',
    };
    if (score === null && typeof candidate.explanation === 'string' && dimensions[key].explanation === candidate.explanation.trim()) {
      dimensions[key].explanation = key === 'argumentRevision' && !hasStudentMonitoring
        ? '缺少学生对判断或修订依据的回答，暂不能评价自我监控与有据修订。'
        : '现有学生过程证据不足，暂不能给出可靠分数。';
    }
  }
  const scores = ARGUMENTATIVE_CTRL_KEYS.map(key => dimensions[key].score);
  const total = scores.every((value): value is number => value !== null)
    ? Math.round((scores as number[]).reduce((sum, value) => sum + value, 0) / 3 * 10) / 10
    : null;
  return {
    rubricVersion: ARGUMENTATIVE_CTRL_VERSION,
    writingMode: 'argumentative',
    dimensions,
    total,
    overallComment: typeof raw.overallComment === 'string' ? raw.overallComment.trim() : '',
    analyzedAt: new Date().toISOString(),
    source,
    reviewed: false,
  };
};
