
import { HistoryItem, ScaffoldContent, EssayHistoryData, HistoryDataType, InspirationHistoryData, DrillHistoryData, AggregatedError, VocabularyItem } from "../types";

const STORAGE_KEY = "cet_writing_history_v2";

export const saveToHistory = (
  topic: string,
  data: ScaffoldContent | EssayHistoryData | InspirationHistoryData | DrillHistoryData,
  dataType: HistoryDataType // Mandatory: Enforce explicit type passing
): HistoryItem => {

  // Strict Validation for dataType
  const validTypes: HistoryDataType[] = ['scaffold', 'essay_grade', 'inspiration', 'drill'];
  if (!validTypes.includes(dataType)) {
    console.warn(`saveToHistory: Invalid dataType "${dataType}" detected. Defaulting to "scaffold".`);
    dataType = 'scaffold';
  }

  const history = getHistory();

  // Create new item with explicit dataType
  const newItem: HistoryItem = {
    id: Date.now().toString(),
    timestamp: Date.now(),
    topic,
    dataType, // Field name must be dataType, not type
    data
  };

  // Add to beginning, limit to 30 items
  const newHistory = [newItem, ...history].slice(0, 30);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(newHistory));
  return newItem;
};

export const getHistory = (typeFilter?: HistoryDataType): HistoryItem[] => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    let items: any[] = stored ? JSON.parse(stored) : [];

    // Migration & Cleanup Logic:
    // Ensure every item has a valid `dataType` field.
    // Handle legacy data where `type` might have been used instead of `dataType`.
    items = items.map(item => {
      const migratedItem = { ...item };

      // 1. Migrate 'type' to 'dataType' if needed
      if (migratedItem.type && !migratedItem.dataType) {
        migratedItem.dataType = migratedItem.type;
        delete migratedItem.type;
      }

      // 2. Default to 'scaffold' if completely missing
      if (!migratedItem.dataType) {
        migratedItem.dataType = 'scaffold';
      }

      return migratedItem as HistoryItem;
    });

    if (typeFilter) {
      return items.filter(item => item.dataType === typeFilter);
    }
    return items as HistoryItem[];
  } catch (e) {
    console.error("Failed to parse history", e);
    return [];
  }
};

export const deleteFromHistory = (id: string): HistoryItem[] => {
  const history = getHistory();
  const newHistory = history.filter(item => item.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(newHistory));
  return newHistory;
};

export const checkIsSaved = (topic: string, contentIdentifier: string, type: HistoryDataType = 'scaffold'): boolean => {
  const history = getHistory(type);

  if (type === 'scaffold') {
    return history.some(item =>
      item.topic === topic &&
      (item.data as ScaffoldContent).userIdea === contentIdentifier
    );
  } else if (type === 'essay_grade') {
    // For essays, check if the same essay text exists for the topic
    return history.some(item =>
      item.topic === topic &&
      (item.data as EssayHistoryData).essay === contentIdentifier
    );
  } else if (type === 'inspiration') {
    // For inspiration (Step 1), check if topic exists to prevent duplicate saves
    return history.some(item => item.topic === topic);
  }
  // No strict duplicate check for drills yet
  return false;
};

// --- Statistics Aggregation ---

export interface LearningStats {
  socraticCount: number;
  graderCount: number;
  drillCount: number;
}

export const getAllLearningStats = (): LearningStats => {
  const history = getHistory();

  return history.reduce((stats, item) => {
    // 1. Socratic Thinking: Counts both Phase 1 (Inspiration) and Phase 2 (Scaffold) saves
    if (item.dataType === 'inspiration' || item.dataType === 'scaffold') {
      stats.socraticCount += 1;
    }
    // 2. Essay Grading
    else if (item.dataType === 'essay_grade') {
      stats.graderCount += 1;
    }
    // 3. Drills
    else if (item.dataType === 'drill') {
      stats.drillCount += 1;
    }

    return stats;
  }, { socraticCount: 0, graderCount: 0, drillCount: 0 } as LearningStats);
};

// --- Adaptive Data Extraction ---

export const getAggregatedUserErrors = (limit: number = 10): AggregatedError[] => {
  const history = getHistory('essay_grade');
  const allErrors: AggregatedError[] = [];

  history.forEach(item => {
    const data = item.data as EssayHistoryData;
    // Filter for Critical and General issues, ignoring minor ones
    if (data.result && data.result.critiques) {
      const severeIssues = data.result.critiques
        .filter(c => c.severity === 'critical' || c.severity === 'general')
        .map(c => ({
          original: c.original,
          context: c.context, // Map full sentence context
          revised: c.revised, // Map revised version
          category: c.category,
          explanation: c.explanation,
          severity: c.severity
        }));

      allErrors.push(...severeIssues);
    }
  });

  // Shuffle and take top N to ensure variety
  return allErrors.sort(() => 0.5 - Math.random()).slice(0, limit);
};

export const getAggregatedUserVocab = (limit: number = 10): VocabularyItem[] => {
  const history = getHistory('scaffold');
  const vocabMap = new Map<string, VocabularyItem>(); // 使用Map去重

  history.forEach(item => {
    const data = item.data as ScaffoldContent;
    if (data.vocabulary) {
      data.vocabulary.forEach(vocab => {
        // 只保留第一次出现的词汇（或最新的，取决于需求）
        if (!vocabMap.has(vocab.word.toLowerCase())) {
          vocabMap.set(vocab.word.toLowerCase(), vocab);
        }
      });
    }
  });

  // 转换为数组，打乱顺序，取前N个
  const allVocab = Array.from(vocabMap.values());
  return allVocab.sort(() => 0.5 - Math.random()).slice(0, limit);
};

export const getAggregatedUserCollocations = (limit: number = 15): { en: string; zh: string; topic: string; date: string }[] => {
  const history = getHistory('scaffold');
  const collocationMap = new Map<string, { en: string; zh: string; topic: string; date: string }>(); // 使用Map去重

  history.forEach(item => {
    const data = item.data as ScaffoldContent;
    if (data.collocations) {
      data.collocations.forEach(col => {
        // 只保留第一次出现的搭配
        if (!collocationMap.has(col.en.toLowerCase())) {
          collocationMap.set(col.en.toLowerCase(), {
            en: col.en,
            zh: col.zh,
            topic: item.topic,
            date: String(item.timestamp)
          });
        }
      });
    }
  });

  // 转换为数组，打乱顺序，取前N个
  const allCollocations = Array.from(collocationMap.values());
  return allCollocations.sort(() => 0.5 - Math.random()).slice(0, limit);
};
