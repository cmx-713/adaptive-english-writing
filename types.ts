
export interface VocabularyItem {
  word: string;
  chinese: string;
  englishDefinition: string;
  usage: string;
  usageChinese: string;
}

export interface CollocationItem {
  en: string;
  zh: string;
}

export interface SentenceFrame {
  patternName: string;      // 句型名称，如 "Not only...but also..."
  patternNameZh: string;    // 句型中文释义，如 "不仅……而且还……"
  template: string;         // 带中文提示的填空模板，如 "Not only do [培养什么能力], but..."
  modelSentence: string;    // 完整参考范句
}

// Phase 1: Inspiration
export interface InspirationCard {
  id: string;
  dimension: string;
  narrativeRole?: NarrativeCardRole;
  socraticQuestion: string;
  hint: string;
  keywords: { en: string; zh: string }[]; // Updated: Supports EN/ZH pair
  thinkingExpansion: string[]; // 思路拓展：该维度下 3-4 个具体论述角度（中文）
}

export type NarrativeCardRole = 'scene' | 'response' | 'outcome';

// Phase 2: Scaffolding
export interface ScaffoldContent {
  selectedDimension: string;
  userIdea: string;
  vocabulary: VocabularyItem[];
  collocations: CollocationItem[];
  frames: SentenceFrame[];
  writingMode?: WritingMode;
}

export interface UserInput {
  topic: string;
  blindBox?: boolean;
  writingMode?: WritingMode;
}

export type WritingMode = 'argumentative' | 'narrative';

// Keep internal AI labels for prompts/storage while showing readable Chinese in the UI.
export const getNarrativeFocusLabel = (focus: string): string => {
  const normalized = focus.trim().toLowerCase().replace(/[-_]+/g, ' ').replace(/\s+/g, ' ');
  const labels: Record<string, string> = {
    'anchor moment and setting': '关键时刻与场景',
    'the key moment': '关键时刻',
    'setting the scene': '场景铺陈',
    'what happened next and response': '后续行动与回应',
    'what happened next and respon': '后续行动与回应',
    'my reaction and choice': '我的反应与选择',
    'response and decision': '反应与选择',
    'outcome and reflection': '结果与回望',
    'what i realized': '我的事后理解',
    'details i remember': '我记得的细节',
    'a challenge i faced': '我遇到的困难'
  };
  return labels[normalized] || focus;
};

// 每个维度的草稿数据
export interface DimensionDraft {
  cardId: string;
  dimension: string;
  userIdea: string;
  draft: string;
  scaffoldData?: ScaffoldContent;
}

export type FlowState = 'input_topic' | 'loading_cards' | 'selecting_card' | 'loading_scaffold' | 'showing_result' | 'assembling_essay' | 'error';

// STRICT DATA TYPES
export type HistoryDataType = 'scaffold' | 'essay_grade' | 'inspiration' | 'drill';

export interface EssayHistoryData {
  essay: string;
  result: EssayGradeResult;
  writingMode?: WritingMode;
}

export interface InspirationHistoryData {
  cards: InspirationCard[];
  userInputs: Record<string, string>;
  writingMode?: WritingMode;
  dimensionDrafts?: Record<string, DimensionDraft>;
  validationResults?: Record<string, unknown>;
  personalizedExpansions?: Record<string, string[]>;
  assembledEssay?: { introduction: string; bodyParagraphs: { dimension: string; draft: string }[]; conclusion: string } | null;
  argumentReflection?: { text: string; updatedAt: string } | null;
  submittedAt?: string;
}

export interface DrillHistoryData {
  mode: DrillMode;
  score: number;
  totalQuestions: number;
}

export interface HistoryItem {
  id: string;
  timestamp: number;
  topic: string;
  dataType: HistoryDataType; // Enforced field name (NOT 'type')
  data: ScaffoldContent | EssayHistoryData | InspirationHistoryData | DrillHistoryData;
}

export interface DraftFeedback {
  score: number;
  comment: string;
  usedVocabulary: string[];
  suggestions: string[];
  polishedVersion: string;
}

// --- STUDENT AUTH ---
export interface User {
  name: string;
  studentId: string;
  className?: string; // 班级名称
  id?: string;        // Supabase UUID from wc_users table
  role?: 'student' | 'teacher' | 'external_student';
  email?: string;     // 外校用户邮箱
  school?: string;    // 外校用户学校/学院
}

// --- API SETTINGS ---
export type ApiProvider = 'google' | 'deepseek' | 'moonshot' | 'aliyun' | 'zhipu' | 'openai' | 'custom';

export interface ApiConfig {
  provider: ApiProvider;
  apiKey: string;
  baseUrl?: string;
  modelName: string;
}

// --- MODULE 2: ESSAY GRADER TYPES ---

export type IssueSeverity = 'critical' | 'general' | 'minor';
export type CritiqueCategory = 'Content' | 'Organization' | 'Proficiency' | 'Clarity';

export interface SentenceCritique {
  original: string; // The specific error snippet (for highlighting)
  context?: string; // NEW: The full sentence containing the error
  revised: string;
  category: CritiqueCategory; // Renamed from type
  severity: IssueSeverity; // 🟥 🟨 🟩
  explanation: string;
}

// New Interface for Profile Center Diagnostics
export interface AggregatedError {
  original: string;
  context?: string; // NEW
  revised: string;  // NEW: Needed for refinement display
  category: CritiqueCategory;
  explanation: string;
  severity: IssueSeverity;
}

export interface ContrastivePoint {
  category: 'Language Foundation' | 'Logical Reasoning' | 'Strategic Intent' | 'Rhetorical Structure' | 'Story Flow' | 'Narrative Detail' | 'Reflection & Closure'; // Pyramid / narrative learning dimensions
  userContent: string; // [Status Quo] - Must be FULL SENTENCE with context
  polishedContent: string; // [Elevation] - Must be exact substring of polishedEssay
  analysis: string; // [Strategic Analysis] - The 3-part deep dive
}

export interface RetrainingExercise {
  type: 'Academic Upgrade' | 'Logic Bridge' | 'Intent Realization'; // The 3 Core Types
  question: string; // The prompt
  originalContext?: string; // The "Bad" example to fix
  hint: string; // The "Expert Tip" from Step 1
  mandatoryKeywords?: string[]; // Optional: List of keywords the student MUST use
  referenceAnswer: string; // The ideal "Clone" answer
  explanation: string; // Why this works (Score impact)
}

export interface KeyMaterial {
  wordOrPhrase: string;
  definition: string;
  example: string;
}

export interface EssayGradeResult {
  totalScore: number; // 0-15 scale
  subScores: {
    content: number; // 0-4
    organization: number; // 0-3
    proficiency: number; // 0-5
    clarity: number; // 0-3
  };
  modelSubScores?: { // NEW: Perfect scores for the polished essay comparison
    content: number;
    organization: number;
    proficiency: number;
    clarity: number;
  };
  generalComment: string;
  issueOverview: { // New: Step 2 in prompt
    critical: string[]; // Red
    general: string[];  // Yellow
    minor: string[];    // Green
  };
  critiques: SentenceCritique[];
  contrastiveLearning: ContrastivePoint[]; // Step 4
  retraining: {
    exercises: RetrainingExercise[]; // Step 5
    materials: KeyMaterial[]; // Step 5
  };
  polishedEssay: string; // Contains tags like [INTRODUCTION] and <highlight id='0'>...</highlight>
}

// --- MODULE 3: SENTENCE DRILLS TYPES ---

export type DrillMode = 'grammar_doctor' | 'elevation_lab' | 'structure_architect';

export interface AdaptiveContext {
  pastErrors: string[];
  targetVocab: string[];
}

export interface DrillItem {
  id: string;
  mode: DrillMode;
  questionContext: string; // The problem sentence (A)
  highlightText?: string; // Target word for B, or Second sentence for C
  options: string[];
  correctOption: string;
  explanation: string;
  chineseTranslation?: string;
}

// --- NAVIGATION ---
export type Tab = 'coach' | 'grader' | 'drills' | 'profile';
