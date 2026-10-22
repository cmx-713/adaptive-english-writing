import type { NarrativeCardRole } from '../types';

export type NarrativeEvidenceKey =
  | 'eventAnchor'
  | 'concreteDetail'
  | 'immediateResponse'
  | 'nextActionOrResponse'
  | 'immediateConsequence'
  | 'outcomeOrEnding'
  | 'laterReflection';

export type EvidenceStatus = 'covered' | 'partial' | 'missing' | 'not_applicable' | 'uncertain';

export interface NarrativeEvidenceClaim {
  status: EvidenceStatus;
  quote: string;
}

export type NarrativeEvidenceAssessment = Partial<Record<NarrativeEvidenceKey, NarrativeEvidenceClaim>>;

export interface NarrativeDecision {
  completionReady: boolean;
  target?: NarrativeEvidenceKey;
  targetWasAsked: boolean;
  evidenceQuote: string;
  covered: NarrativeEvidenceKey[];
  partial: NarrativeEvidenceKey[];
  missing: NarrativeEvidenceKey[];
}

const requiredByRole: Record<NarrativeCardRole, NarrativeEvidenceKey[]> = {
  scene: ['eventAnchor', 'concreteDetail'],
  response: ['nextActionOrResponse'],
  outcome: ['outcomeOrEnding'],
};

const slotsByEvidence: Record<NarrativeEvidenceKey, string> = {
  eventAnchor: 'setting',
  concreteDetail: 'visual_detail',
  immediateResponse: 'body_response',
  nextActionOrResponse: 'immediate_action',
  immediateConsequence: 'consequence',
  outcomeOrEnding: 'consequence',
  laterReflection: 'reflection',
};

const normalizeEvidenceText = (value: string): string =>
  value.toLocaleLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');

const hasGroundedQuote = (claim: NarrativeEvidenceClaim | undefined, studentText: string): boolean => {
  if (!claim || !claim.quote.trim() || !['covered', 'partial'].includes(claim.status)) return false;
  const quote = normalizeEvidenceText(claim.quote);
  const source = normalizeEvidenceText(studentText);
  return quote.length > 0 && source.includes(quote);
};

export const decideNarrativeCoverage = (
  role: NarrativeCardRole,
  assessment: NarrativeEvidenceAssessment,
  studentText: string,
  priorTargets: NarrativeEvidenceKey[] = [],
): NarrativeDecision => {
  const allKeys = Object.keys(slotsByEvidence) as NarrativeEvidenceKey[];
  const covered = allKeys.filter(key => assessment[key]?.status === 'covered' && hasGroundedQuote(assessment[key], studentText));
  const partial = allKeys.filter(key => assessment[key]?.status === 'partial' && hasGroundedQuote(assessment[key], studentText));
  const required = requiredByRole[role];
  const missing = required.filter(key => !covered.includes(key));
  const target = missing[0];

  return {
    completionReady: missing.length === 0,
    target,
    targetWasAsked: target ? priorTargets.includes(target) : false,
    evidenceQuote: target && hasGroundedQuote(assessment[target], studentText) ? assessment[target]!.quote.trim() : '',
    covered,
    partial,
    missing,
  };
};

export const narrativeEvidenceSlot = (key: NarrativeEvidenceKey): string => slotsByEvidence[key];

export const narrativeEvidenceQuestion = (key: NarrativeEvidenceKey, clarify = false): string => {
  const questions: Record<NarrativeEvidenceKey, [string, string]> = {
    eventAnchor: [
      '这段经历中，真正的关键时刻发生了什么？',
      '回到那个关键时刻，最重要的事情具体是什么？',
    ],
    concreteDetail: [
      '当时有什么具体细节最能让读者看见你所处的情境？',
      '回想那个瞬间，哪一个具体细节最先浮现在你脑海里？',
    ],
    immediateResponse: [
      '发现这一情况时，你当下有什么反应？',
      '意识到这一点后，你当时做出的第一个反应是什么？',
    ],
    nextActionOrResponse: [
      '意识到这件事后，你接下来做了什么？',
      '从那个关键时刻往后看，你采取的第一个具体行动是什么？',
    ],
    immediateConsequence: [
      '采取这个行动后，事情马上有什么变化？',
      '这个行动直接带来了什么结果？',
    ],
    outcomeOrEnding: [
      '这段经历最后以什么结果结束？',
      '最后发生了什么，让这段经历告一段落？',
    ],
    laterReflection: [
      '后来这段经历让你对自己或这件事有了什么新的认识？',
      '回头看这段经历，你现在会怎样理解它？',
    ],
  };
  return questions[key][clarify ? 1 : 0];
};

export const narrativeQuestionMatchesTarget = (question: string, key: NarrativeEvidenceKey): boolean => {
  const patterns: Record<NarrativeEvidenceKey, RegExp> = {
    eventAnchor: /关键时刻|发生了什么|具体是什么|moment|happen|event/i,
    concreteDetail: /具体细节|具体画面|看见|注意到|听见|触到|细节|画面|detail|notice|see|hear|touch/i,
    immediateResponse: /当下.*反应|当时.*反应|做出的.*反应|respond|reaction/i,
    nextActionOrResponse: /接下来|之后.*做|第一个.*行动|采取.*行动|做了什么|next|action|do after/i,
    immediateConsequence: /马上.*变化|直接.*结果|带来.*结果|immediate.*result|change/i,
    outcomeOrEnding: /最后|结果|结束|告一段落|outcome|ending|end/i,
    laterReflection: /后来.*认识|回头看|怎样理解|新的认识|reflect|understand/i,
  };
  return patterns[key].test(question);
};

export const narrativeCoverageSlots = (role: NarrativeCardRole, decision: NarrativeDecision) => {
  const relevantKeys = Object.keys(slotsByEvidence) as NarrativeEvidenceKey[];
  const allowedKeys: NarrativeEvidenceKey[] = role === 'scene'
    ? ['eventAnchor', 'concreteDetail', 'immediateResponse']
    : role === 'response'
      ? ['nextActionOrResponse', 'immediateConsequence']
      : ['outcomeOrEnding', 'laterReflection'];
  const covered = relevantKeys.filter(key => allowedKeys.includes(key) && decision.covered.includes(key));
  const required = requiredByRole[role];
  const partial = required.filter(key => decision.partial.includes(key) && !covered.includes(key));
  const missing = required.filter(key => !covered.includes(key) && !partial.includes(key));
  return {
    coveredSlots: covered.map(key => slotsByEvidence[key]),
    partialSlots: partial.map(key => slotsByEvidence[key]),
    missingSlots: missing.map(key => slotsByEvidence[key]),
  };
};
