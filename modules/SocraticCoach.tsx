
import React, { useState, useEffect, useRef } from 'react';
import InputSection from '../components/InputSection';
import PhaseOneCards from '../components/PhaseOneCards';
import ResultsDisplay from '../components/ResultsDisplay';
import HistoryModal from '../components/HistoryModal';
import UiIcon from '../components/UiIcon';
import { fetchInspirationCards, fetchLanguageScaffolds, fetchNarrativePlanningCards, fetchNarrativeLanguageScaffolds, generateEssayIntroConclusion, analyzeCtrlScore, analyzeArgumentativeCtrlScoreV2 } from '../services/geminiService';
import { getHistory, deleteFromHistory, saveToHistory, checkIsSaved, updateHistoryItemData } from '../services/storageService';
import { saveScaffoldToSupabase, saveInspirationToSupabase, updateScaffoldDraft, saveAssembledEssayToSupabase, logAgentUsage, createThinkingProcess, updateThinkingProcess, updateThinkingProcessDraft, saveCtrlScore, saveArgumentativeCtrlScoreV2, upsertVocabularyBank, upsertCollocationBank, getLatestUnfinishedThinkingProcess, getThinkingProcessByUser } from '../services/supabaseDataService';
import { UserInput, InspirationCard, ScaffoldContent, FlowState, HistoryItem, InspirationHistoryData, DimensionDraft, WritingMode } from '../types';
import { IdeaValidationResult } from '../services/geminiService';
import type { ArgumentReflection } from '../services/argumentativeCtrlRubric';

interface SocraticCoachProps {
  onSendToGrader?: (topic: string, essay: string, writingMode?: WritingMode) => void;
  supabaseUserId?: string;
}

const SocraticCoach: React.FC<SocraticCoachProps> = ({ onSendToGrader, supabaseUserId }) => {
  const [flowState, setFlowState] = useState<FlowState>('input_topic');
  const [currentTopic, setCurrentTopic] = useState<string>('');
  const [writingMode, setWritingMode] = useState<WritingMode>('argumentative');

  // Data State
  const [cards, setCards] = useState<InspirationCard[]>([]);
  const [addingDimension, setAddingDimension] = useState<string | null>(null);
  const [activeCard, setActiveCard] = useState<InspirationCard | null>(null);
  const [scaffoldData, setScaffoldData] = useState<ScaffoldContent | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Phase 1 State (Lifted)
  const [step1Inputs, setStep1Inputs] = useState<Record<string, string>>({});

  // 维度草稿管理
  const [dimensionDrafts, setDimensionDrafts] = useState<Record<string, DimensionDraft>>({});
  const [resumeCandidate, setResumeCandidate] = useState<any | null>(null);
  const [restoredValidationResults, setRestoredValidationResults] = useState<Record<string, IdeaValidationResult>>({});
  const currentDraftRef = useRef<string>(''); // 用ref追踪实时草稿，避免频繁setState
  const draftSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 个性化思路拓展（Layer 2）：cardId -> string[]
  const [personalizedExpansions, setPersonalizedExpansions] = useState<Record<string, string[]>>({});

  // 组合成文状态
  const [assembledEssay, setAssembledEssay] = useState<{ introduction: string; bodyParagraphs: { dimension: string; draft: string }[]; conclusion: string } | null>(null);
  const [argumentReflection, setArgumentReflection] = useState<ArgumentReflection | null>(null);
  const [sendingToGrader, setSendingToGrader] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const submittedRef = useRef(false);
  const [isAssembling, setIsAssembling] = useState(false);

  // AI 范例（按需生成，点击才触发）
  const [aiReference, setAiReference] = useState<{ introduction: string; conclusion: string } | null>(null);
  const [isLoadingReference, setIsLoadingReference] = useState(false);
  const [showIntroRef, setShowIntroRef] = useState(false);
  const [showConclusionRef, setShowConclusionRef] = useState(false);

  // History State
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);
  const localThinkingHistoryIdRef = useRef<string | null>(null);

  // 会话计时
  const sessionStartRef = useRef<number>(Date.now());

  // 思维过程记录 ID（用于后续更新同一条记录）
  const thinkingProcessIdRef = useRef<string | null>(null);
  const coachingTurnsRef = useRef<Record<string, any[]>>({});

  // Load history on mount
  const refreshHistory = () => {
    const scaffolds = getHistory('scaffold');
    const inspirations = getHistory('inspiration');
    setHistoryItems([...scaffolds, ...inspirations].sort((a, b) => b.timestamp - a.timestamp));
  };

  useEffect(() => {
    const historyId = localThinkingHistoryIdRef.current;
    if (!historyId || flowState === 'input_topic' || flowState === 'loading_cards') return;
    const timer = setTimeout(() => {
      updateHistoryItemData(historyId, {
        cards,
        userInputs: step1Inputs,
        writingMode,
        dimensionDrafts,
        validationResults: restoredValidationResults,
        personalizedExpansions,
        assembledEssay,
        argumentReflection,
      });
    }, 250);
    return () => clearTimeout(timer);
  }, [cards, step1Inputs, writingMode, dimensionDrafts, restoredValidationResults, personalizedExpansions, assembledEssay, argumentReflection, flowState]);

  useEffect(() => {
    if (isHistoryOpen) refreshHistory();
  }, [isHistoryOpen]);

  // 登录后检查是否有未提交的云端草稿。只展示最近一条，避免把学生带回旧任务。
  useEffect(() => {
    if (!supabaseUserId) {
      setResumeCandidate(null);
      return;
    }
    getLatestUnfinishedThinkingProcess(supabaseUserId)
      .then(({ data, error }) => {
        if (error) {
          console.warn('[ThinkingProcess] 检查未完成草稿失败:', error.message);
          return;
        }
        setResumeCandidate(data || null);
      })
      .catch(err => console.warn('[ThinkingProcess] 检查未完成草稿异常:', err));
  }, [supabaseUserId]);

  const resumeProcess = (process: any) => {
    const mode: WritingMode = process.writing_mode === 'narrative' ? 'narrative' : 'argumentative';
    const restoredCards = Array.isArray(process.inspiration_cards) ? process.inspiration_cards : [];
    const restoredDrafts = process.dimension_drafts && typeof process.dimension_drafts === 'object'
      ? process.dimension_drafts
      : {};
    const restoredResults = process.validation_results && typeof process.validation_results === 'object'
      ? process.validation_results
      : {};

    setCurrentTopic(process.topic || '');
    setWritingMode(mode);
    setCards(restoredCards);
    setStep1Inputs(process.user_ideas && typeof process.user_ideas === 'object' ? process.user_ideas : {});
    setDimensionDrafts(restoredDrafts);
    setRestoredValidationResults(restoredResults);
    setPersonalizedExpansions(process.personalized_expansions || {});
    setAssembledEssay(process.assembled_essay || null);
    setArgumentReflection(mode === 'argumentative' ? process.argument_reflection || null : null);
    submittedRef.current = false;
    setSubmissionError(null);
    setScaffoldData(null);
    setActiveCard(null);
    setError(null);
    thinkingProcessIdRef.current = process.id || null;
    validationResultsRef.current = restoredResults;
    coachingTurnsRef.current = process.coaching_turns || {};
    setResumeCandidate(null);
    setFlowState(process.assembled_essay ? 'assembling_essay' : 'selecting_card');
  };

  // Step 1: Handle Topic Input -> Fetch Cards
  const handleTopicSubmit = async (input: UserInput) => {
    setFlowState('loading_cards');
    setCurrentTopic(input.topic);
    const selectedWritingMode = writingMode;
    setWritingMode(selectedWritingMode);
    setError(null);
    sessionStartRef.current = Date.now(); // 重置会话计时
    setActiveCard(null);
    setAddingDimension(null);
    setStep1Inputs({});
    setDimensionDrafts({}); // 新topic清空草稿
    setArgumentReflection(null);
    submittedRef.current = false;
    setSubmissionError(null);
    setRestoredValidationResults({});
    setResumeCandidate(null);
    setPersonalizedExpansions({}); // 清空个性化拓展
    validationResultsRef.current = {}; // 清空累积验证结果
    coachingTurnsRef.current = {};
    thinkingProcessIdRef.current = null; // 清空旧记录 ID

    try {
      const fetchedCards = selectedWritingMode === 'narrative'
        ? await fetchNarrativePlanningCards(input.topic)
        : await fetchInspirationCards(input.topic);
      setCards(fetchedCards);

      const historyData: InspirationHistoryData = {
        cards: fetchedCards,
        userInputs: {},
        writingMode: selectedWritingMode
      };
      const historyRecord = saveToHistory(input.topic, historyData, 'inspiration');
      localThinkingHistoryIdRef.current = historyRecord.id;
      // Supabase 双写（异步，不阻断前端）
      if (supabaseUserId) {
        saveInspirationToSupabase(supabaseUserId, input.topic, fetchedCards, {}, selectedWritingMode).catch(() => { });
        // 创建思维过程记录
        console.log('[ThinkingProcess] 正在创建, userId:', supabaseUserId, 'topic:', input.topic);
        createThinkingProcess(supabaseUserId, input.topic, fetchedCards, selectedWritingMode)
          .then(({ id, error }) => {
            if (id) {
              thinkingProcessIdRef.current = id;
              console.log('[ThinkingProcess] ✅ 创建成功, id:', id);
            } else {
              console.error('[ThinkingProcess] ❌ 创建失败, id 为 null, error:', error);
            }
          })
          .catch((err) => { console.error('[ThinkingProcess] ❌ 创建异常:', err); });
      } else {
        console.warn('[ThinkingProcess] ⚠️ supabaseUserId 为空，跳过创建');
      }

      setFlowState('selecting_card');
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to generate inspiration cards. Please try again.");
      setFlowState('error');
    }
  };

  // 防抖定时器（用于 user_ideas 同步）
  const ideaSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Handle Input Changes in Step 1
  const handleStep1InputChange = (id: string, value: string) => {
    setStep1Inputs(prev => {
      const next = { ...prev, [id]: value };
      // 防抖同步学生观点到 Supabase（1秒内无新输入才同步）
      if (thinkingProcessIdRef.current && supabaseUserId) {
        if (ideaSyncTimerRef.current) clearTimeout(ideaSyncTimerRef.current);
        ideaSyncTimerRef.current = setTimeout(() => {
          if (thinkingProcessIdRef.current) {
            updateThinkingProcess(thinkingProcessIdRef.current, { user_ideas: next }).catch(() => { });
          }
        }, 1000);
      }
      return next;
    });

  };

  // Step 2: Handle Card Selection + Idea -> Fetch Scaffolds
  const handleCardSelect = async (card: InspirationCard, userIdea: string) => {
    setFlowState('loading_scaffold');
    setError(null);
    setActiveCard(card);

    // 如果该维度已有scaffold数据，直接使用
    const existingDraft = dimensionDrafts[card.id];
    if (existingDraft?.scaffoldData) {
      setScaffoldData(existingDraft.scaffoldData);
      currentDraftRef.current = existingDraft.draft;
      setFlowState('showing_result');
      return;
    }

    try {
      const result = writingMode === 'narrative'
        ? await fetchNarrativeLanguageScaffolds(currentTopic, card.dimension, userIdea)
        : await fetchLanguageScaffolds(currentTopic, card.dimension, userIdea);
      setScaffoldData(result);
      currentDraftRef.current = '';
      saveToHistory(currentTopic, result, 'scaffold');
      // Supabase 双写（异步，不阻断前端）
      if (supabaseUserId) {
        saveScaffoldToSupabase(supabaseUserId, currentTopic, result, writingMode).catch(() => { });
        // 词汇银行：自动将本次 scaffold 词汇入库
        if (result.vocabulary && result.vocabulary.length > 0) {
          upsertVocabularyBank(supabaseUserId, result.vocabulary, currentTopic).catch(() => { });
        }
        // 搭配银行：自动将本次 scaffold 地道搭配入库
        if (result.collocations && result.collocations.length > 0) {
          upsertCollocationBank(supabaseUserId, result.collocations, currentTopic).catch(() => { });
        }
      }
      // 同步维度草稿数据到思维过程记录
      if (thinkingProcessIdRef.current) {
        const draftEntry = {
          cardId: card.id,
          dimension: card.dimension,
          userIdea: userIdea,
          draft: '',
          scaffoldData: result
        };
        setDimensionDrafts(prev => {
          // 这里不用 setState 更新，只是读取当前值来同步
          const updatedDrafts = { ...prev, [card.id]: draftEntry };
          updateThinkingProcess(thinkingProcessIdRef.current!, { dimension_drafts: updatedDrafts }).catch(() => { });
          return prev; // 不实际改变 state，避免影响原有逻辑
        });
      }
      setFlowState('showing_result');
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to generate language scaffolds. Please try again.");
      setFlowState('selecting_card');
    }
  };

  // 草稿实时更新回调
  const handleDraftChange = (draft: string) => {
    currentDraftRef.current = draft;
    if (!activeCard || !thinkingProcessIdRef.current) return;
    if (draftSyncTimerRef.current) clearTimeout(draftSyncTimerRef.current);
    draftSyncTimerRef.current = setTimeout(() => {
      if (!thinkingProcessIdRef.current || !activeCard) return;
      setDimensionDrafts(prev => {
        const next = {
          ...prev,
          [activeCard.id]: {
            ...(prev[activeCard.id] || {}),
            cardId: activeCard.id,
            dimension: activeCard.dimension,
            userIdea: step1Inputs[activeCard.id] || '',
            draft,
            scaffoldData: scaffoldData || prev[activeCard.id]?.scaffoldData,
          }
        };
        updateThinkingProcess(thinkingProcessIdRef.current!, { dimension_drafts: next }).catch(() => { });
        return next;
      });
    }, 800);
  };

  // 累积的验证结果（用于合并后发送到 Supabase）
  const validationResultsRef = useRef<Record<string, IdeaValidationResult>>({});

  // 观点验证完成回调（从 PhaseOneCards 接收验证结果）
  const handleValidationComplete = (cardId: string, result: IdeaValidationResult) => {
    const resultWithMode = { ...result, writingMode };
    // PhaseOneCards unmounts while the student writes in the scaffold view.
    // Keep its coaching transcript in parent state so it can be restored on return.
    setRestoredValidationResults(prev => ({ ...prev, [cardId]: resultWithMode }));
    // 合并到累积结果中
    validationResultsRef.current = { ...validationResultsRef.current, [cardId]: resultWithMode };
    coachingTurnsRef.current = {
      ...coachingTurnsRef.current,
      [cardId]: resultWithMode.conversation || []
    };
    if (thinkingProcessIdRef.current) {
      updateThinkingProcess(thinkingProcessIdRef.current, {
        writing_mode: writingMode,
        validation_results: validationResultsRef.current,
        coaching_turns: coachingTurnsRef.current
      }).catch(() => { });
    }
  };

  // 根据学生选择的额外视角生成一张新的思维卡片，复用现有卡片流程
  const handleAddDimension = async (dimension: string) => {
    if (addingDimension || cards.some(card => card.dimension.toLowerCase() === dimension.toLowerCase())) return;

    setAddingDimension(dimension);
    setError(null);
    try {
      const newCards = await fetchInspirationCards(currentTopic, [dimension]);
      const newCard = newCards[0];
      if (!newCard) throw new Error('未能生成该维度，请稍后重试。');

      setCards(prev => {
        const next = [...prev, newCard];
        if (thinkingProcessIdRef.current) {
          updateThinkingProcess(thinkingProcessIdRef.current, { inspiration_cards: next }).catch(() => { });
        }
        return next;
      });
    } catch (err: any) {
      console.error(err);
      setError(err.message || '新增维度失败，请重试。');
    } finally {
      setAddingDimension(null);
    }
  };

  // 返回维度选择页面，同时保存当前草稿
  const handleBackToDimensions = () => {
    // 保存当前维度的草稿
    if (activeCard && currentDraftRef.current.trim()) {
      setDimensionDrafts(prev => ({
        ...prev,
        [activeCard.id]: {
          cardId: activeCard.id,
          dimension: activeCard.dimension,
          userIdea: step1Inputs[activeCard.id] || '',
          draft: currentDraftRef.current,
          scaffoldData: scaffoldData || undefined
        }
      }));
      // Supabase: 更新该维度的草稿
      if (supabaseUserId) {
        updateScaffoldDraft(supabaseUserId, currentTopic, activeCard.dimension, currentDraftRef.current).catch(() => { });
        // 记录使用日志（含时长）
        const duration = Math.round((Date.now() - sessionStartRef.current) / 1000);
        logAgentUsage(supabaseUserId, '审辨写作训练', 'writing_system', duration).catch(() => { });
      }
      // 同步草稿到思维过程记录
      if (thinkingProcessIdRef.current) {
        const updatedDrafts = {
          ...dimensionDrafts,
          [activeCard.id]: {
            cardId: activeCard.id,
            dimension: activeCard.dimension,
            userIdea: step1Inputs[activeCard.id] || '',
            draft: currentDraftRef.current,
            scaffoldData: scaffoldData || undefined
          }
        };
        updateThinkingProcess(thinkingProcessIdRef.current, { dimension_drafts: updatedDrafts }).catch(() => { });
      }
    }

    setFlowState('selecting_card');
    setScaffoldData(null);
  };

  // 组合成文（不调用AI，直接进入编辑界面）
  const handleAssembleEssay = () => {
    const bodyParagraphs = cards
      .filter(card => dimensionDrafts[card.id])
      .map(card => ({
        dimension: card.dimension,
        draft: dimensionDrafts[card.id].draft
      }));

    setAssembledEssay({
      introduction: '',
      bodyParagraphs,
      conclusion: ''
    });
    setAiReference(null);
    setShowIntroRef(false);
    setShowConclusionRef(false);
    setFlowState('assembling_essay');

    // 同步组合成文状态到思维过程记录
    if (thinkingProcessIdRef.current) {
      updateThinkingProcess(thinkingProcessIdRef.current, {
        assembled_essay: { introduction: '', bodyParagraphs, conclusion: '' },
        status: 'completed'
      }).catch(() => { });

    }
  };

  // 组合成文阶段也持续保存，学生刷新页面或稍后回来时可从原位置继续编辑。
  useEffect(() => {
    if (!assembledEssay || !thinkingProcessIdRef.current || submittedRef.current) return;
    const processId = thinkingProcessIdRef.current;
    const timer = setTimeout(() => {
      if (submittedRef.current) return;
      updateThinkingProcessDraft(processId, {
        assembled_essay: assembledEssay,
        status: 'completed'
      }).catch(() => { });
    }, 800);
    return () => clearTimeout(timer);
  }, [assembledEssay]);

  useEffect(() => {
    if (writingMode !== 'argumentative' || !thinkingProcessIdRef.current || submittedRef.current) return;
    const processId = thinkingProcessIdRef.current;
    const timer = setTimeout(() => {
      if (submittedRef.current) return;
      updateThinkingProcessDraft(processId, { argument_reflection: argumentReflection }).catch(() => { });
    }, 800);
    return () => clearTimeout(timer);
  }, [argumentReflection, writingMode]);

  // 按需生成 AI 范例（点击"看看AI范例"时触发）
  const handleLoadAiReference = async (section: 'intro' | 'conclusion') => {
    // 如果已有缓存，直接展示
    if (aiReference) {
      if (section === 'intro') setShowIntroRef(true);
      if (section === 'conclusion') setShowConclusionRef(true);
      return;
    }

    // 首次请求：生成两段范例并缓存
    setIsLoadingReference(true);
    try {
      const bodyParagraphs = assembledEssay?.bodyParagraphs || [];
      const { introduction, conclusion } = await generateEssayIntroConclusion(currentTopic, bodyParagraphs, writingMode);
      setAiReference({ introduction, conclusion });
      if (section === 'intro') setShowIntroRef(true);
      if (section === 'conclusion') setShowConclusionRef(true);
    } catch (err: any) {
      console.error(err);
    } finally {
      setIsLoadingReference(false);
    }
  };

  // 发送到作文批改
  const handleSendToGrader = async () => {
    if (!assembledEssay || !onSendToGrader || sendingToGrader) return;
    setSendingToGrader(true);
    setSubmissionError(null);

    const fullEssay = [
      assembledEssay.introduction,
      ...assembledEssay.bodyParagraphs.map(p => p.draft),
      assembledEssay.conclusion
    ].filter(p => p.trim()).join('\n\n');

    const processId = thinkingProcessIdRef.current;
    if (writingMode === 'argumentative' && processId) {
      submittedRef.current = true;
      const { error } = await updateThinkingProcess(processId, {
        assembled_essay: assembledEssay,
        argument_reflection: argumentReflection,
        status: 'sent_to_grader',
      });
      if (error) {
        submittedRef.current = false;
        setSendingToGrader(false);
        setSubmissionError('写作过程保存失败，请检查网络后重试提交。');
        return;
      }
    }

    if (localThinkingHistoryIdRef.current) {
      updateHistoryItemData(localThinkingHistoryIdRef.current, {
        cards,
        userInputs: step1Inputs,
        writingMode,
        dimensionDrafts,
        validationResults: restoredValidationResults,
        personalizedExpansions,
        assembledEssay,
        argumentReflection,
        submittedAt: new Date().toISOString(),
      });
    }

    // Supabase: 保存组合成文
    if (supabaseUserId && fullEssay.trim()) {
      saveAssembledEssayToSupabase(supabaseUserId, currentTopic, fullEssay, writingMode).catch(() => { });
      // 记录使用日志（含时长）
      const duration = Math.round((Date.now() - sessionStartRef.current) / 1000);
      logAgentUsage(supabaseUserId, '审辨写作训练', 'writing_system', duration).catch(() => { });
    }

    onSendToGrader(currentTopic, fullEssay, writingMode);

    if (writingMode === 'argumentative' && processId && fullEssay.trim()) {
      analyzeArgumentativeCtrlScoreV2({
        topic: currentTopic,
        inspirationCards: cards,
        userIdeas: step1Inputs,
        validationResults: validationResultsRef.current,
        dimensionDrafts,
        assembledEssay,
        argumentReflection,
      }).then(result => saveArgumentativeCtrlScoreV2(processId, result))
        .then(({ error }) => { if (error) console.error('[ArgumentativeCtrlV2] 保存失败，可在教师端重评:', error); })
        .catch(err => console.error('[ArgumentativeCtrlV2] 分析失败，可在教师端重评:', err));
    }

    if (writingMode === 'narrative' && thinkingProcessIdRef.current && fullEssay.trim()) {
      const processId = thinkingProcessIdRef.current;
      analyzeCtrlScore({
        topic: currentTopic,
        inspirationCards: cards,
        userIdeas: step1Inputs,
        validationResults: validationResultsRef.current,
        personalizedExpansions,
        dimensionDrafts,
        assembledEssay,
        writingMode,
      }).then(result => {
        saveCtrlScore(processId, { ...result, source: 'auto', reviewed: false });
      }).catch(() => { /* 静默处理，不影响提交流程 */ });
    }

    // 同步组合成文内容和状态到思维过程记录
    if (writingMode === 'narrative' && processId) {
      updateThinkingProcess(processId, {
        assembled_essay: assembledEssay,
        status: 'sent_to_grader'
      }).catch(() => { });
    }
    setSendingToGrader(false);
  };

  const resetApp = () => {
    setFlowState('input_topic');
    setCards([]);
    setAddingDimension(null);
    setScaffoldData(null);
    setCurrentTopic('');
    setWritingMode('argumentative');
    setArgumentReflection(null);
    setSubmissionError(null);
    setSendingToGrader(false);
    submittedRef.current = false;
    setActiveCard(null);
    setStep1Inputs({});
    setDimensionDrafts({});
    setRestoredValidationResults({});
    setResumeCandidate(null);
    setPersonalizedExpansions({});
    setAssembledEssay(null);
    setAiReference(null);
    setShowIntroRef(false);
    setShowConclusionRef(false);
    currentDraftRef.current = '';
    validationResultsRef.current = {};
    thinkingProcessIdRef.current = null;
    localThinkingHistoryIdRef.current = null;
  };

  // History Handlers
  const findRelatedThinkingProcess = async (historyRecord?: HistoryItem) => {
    if (!supabaseUserId || !historyRecord) return null;
    try {
      const { data } = await getThinkingProcessByUser(supabaseUserId);
      const recordMode = historyRecord.dataType === 'inspiration'
        ? (historyRecord.data as InspirationHistoryData).writingMode
        : (historyRecord.data as ScaffoldContent).writingMode;
      const candidates = (data || []).filter((process: any) => {
        if (process.topic !== historyRecord.topic) return false;
        if (!recordMode) return true;
        const processMode = process.writing_mode === 'narrative'
          || (Array.isArray(process.inspiration_cards) && process.inspiration_cards.some((card: any) => !!card?.narrativeRole))
          ? 'narrative'
          : 'argumentative';
        return processMode === recordMode;
      });
      if (!candidates.length) return null;
      return candidates.sort((a: any, b: any) => {
        const recordTime = historyRecord.timestamp;
        const timeA = Math.abs(new Date(a.created_at).getTime() - recordTime);
        const timeB = Math.abs(new Date(b.created_at).getTime() - recordTime);
        return timeA - timeB;
      })[0];
    } catch (err) {
      console.warn('[ThinkingHistory] 恢复云端写作过程失败，改用本地记录:', err);
      return null;
    }
  };

  const handleSelectHistoryItem = async (item: HistoryItem) => {
    if (item.dataType === 'scaffold') {
      const scaffold = item.data as ScaffoldContent;
      const relatedInspiration = historyItems
        .filter(historyItem => historyItem.dataType === 'inspiration' && historyItem.topic === item.topic)
        .sort((a, b) => Math.abs(a.timestamp - item.timestamp) - Math.abs(b.timestamp - item.timestamp))[0];
      const cloudProcess = await findRelatedThinkingProcess(relatedInspiration || item);
      const localInspiration = relatedInspiration?.data as InspirationHistoryData | undefined;
      const inspiration = cloudProcess ? {
        cards: Array.isArray(cloudProcess.inspiration_cards) ? cloudProcess.inspiration_cards : localInspiration?.cards,
        userInputs: cloudProcess.user_ideas || localInspiration?.userInputs,
        writingMode: cloudProcess.writing_mode || localInspiration?.writingMode,
        dimensionDrafts: cloudProcess.dimension_drafts && Object.keys(cloudProcess.dimension_drafts).length ? cloudProcess.dimension_drafts : localInspiration?.dimensionDrafts,
        validationResults: cloudProcess.validation_results || localInspiration?.validationResults,
        personalizedExpansions: cloudProcess.personalized_expansions || localInspiration?.personalizedExpansions,
        assembledEssay: cloudProcess.assembled_essay || localInspiration?.assembledEssay,
        argumentReflection: cloudProcess.argument_reflection || localInspiration?.argumentReflection,
      } as InspirationHistoryData : localInspiration;
      const restoredCards = Array.isArray(inspiration?.cards)
        ? inspiration.cards
        : currentTopic === item.topic ? cards : [];
      const matchingCard = restoredCards.find(card =>
        card.dimension.trim().toLowerCase() === scaffold.selectedDimension.trim().toLowerCase()
      ) || null;
      const restoredInputs = inspiration?.userInputs && typeof inspiration.userInputs === 'object'
        ? { ...inspiration.userInputs }
        : {};
      const restoredDrafts: Record<string, DimensionDraft> = inspiration?.dimensionDrafts && typeof inspiration.dimensionDrafts === 'object'
        ? inspiration.dimensionDrafts
        : {};
      const localScaffolds = historyItems
        .filter(historyItem => historyItem.dataType === 'scaffold' && historyItem.topic === item.topic)
        .map(historyItem => ({ item: historyItem, data: historyItem.data as ScaffoldContent }));
      restoredCards.forEach(card => {
        const localScaffold = localScaffolds
          .filter(entry => entry.data.selectedDimension.trim().toLowerCase() === card.dimension.trim().toLowerCase())
          .sort((a, b) => Math.abs(a.item.timestamp - (relatedInspiration?.timestamp || item.timestamp)) - Math.abs(b.item.timestamp - (relatedInspiration?.timestamp || item.timestamp)))[0]?.data;
        if (localScaffold && !restoredInputs[card.id]) restoredInputs[card.id] = localScaffold.userIdea || '';
      });
      const restoredValidations = inspiration?.validationResults && typeof inspiration.validationResults === 'object'
        ? inspiration.validationResults as Record<string, IdeaValidationResult>
        : {};

      setCurrentTopic(item.topic);
      setScaffoldData(restoredDrafts[matchingCard?.id || '']?.scaffoldData || scaffold);
      setWritingMode(scaffold.writingMode || inspiration?.writingMode || 'argumentative');
      setCards(restoredCards);
      setDimensionDrafts(restoredDrafts);
      setRestoredValidationResults(restoredValidations);
      validationResultsRef.current = restoredValidations;
      coachingTurnsRef.current = Object.fromEntries(Object.entries(restoredValidations).map(([id, result]) => [id, result.conversation || []]));
      setPersonalizedExpansions(inspiration?.personalizedExpansions || {});
      setAssembledEssay(inspiration?.assembledEssay || null);
      setArgumentReflection(scaffold.writingMode === 'narrative' ? null : inspiration?.argumentReflection || null);
      submittedRef.current = false;
      thinkingProcessIdRef.current = cloudProcess?.id || null;
      localThinkingHistoryIdRef.current = relatedInspiration?.id || null;
      if (matchingCard && !restoredInputs[matchingCard.id]) {
        restoredInputs[matchingCard.id] = scaffold.userIdea || '';
      }
      setStep1Inputs(restoredInputs);
      setActiveCard(matchingCard);
      currentDraftRef.current = restoredDrafts[matchingCard?.id || '']?.draft || '';
      setFlowState('showing_result');
      setIsHistoryOpen(false);
    } else if (item.dataType === 'inspiration') {
      const localData = item.data as Partial<InspirationHistoryData>;
      const cloudProcess = await findRelatedThinkingProcess(item);
      const data: Partial<InspirationHistoryData> = cloudProcess ? {
        cards: Array.isArray(cloudProcess.inspiration_cards) ? cloudProcess.inspiration_cards : localData.cards,
        userInputs: cloudProcess.user_ideas || localData.userInputs,
        writingMode: cloudProcess.writing_mode || localData.writingMode,
        dimensionDrafts: cloudProcess.dimension_drafts && Object.keys(cloudProcess.dimension_drafts).length ? cloudProcess.dimension_drafts : localData.dimensionDrafts,
        validationResults: cloudProcess.validation_results || localData.validationResults,
        personalizedExpansions: cloudProcess.personalized_expansions || localData.personalizedExpansions,
        assembledEssay: cloudProcess.assembled_essay || localData.assembledEssay,
        argumentReflection: cloudProcess.argument_reflection || localData.argumentReflection,
      } : localData;
      const restoredCards = Array.isArray(data.cards) ? data.cards : [];
      const restoredInputs = data.userInputs && typeof data.userInputs === 'object' ? { ...data.userInputs } : {};
      const restoredDrafts: Record<string, DimensionDraft> = data.dimensionDrafts && typeof data.dimensionDrafts === 'object'
        ? { ...data.dimensionDrafts }
        : {};
      const localScaffolds = historyItems
        .filter(historyItem => historyItem.dataType === 'scaffold' && historyItem.topic === item.topic)
        .map(historyItem => ({ item: historyItem, data: historyItem.data as ScaffoldContent }));
      restoredCards.forEach(card => {
        const localScaffold = localScaffolds
          .filter(entry => entry.data.selectedDimension.trim().toLowerCase() === card.dimension.trim().toLowerCase())
          .sort((a, b) => Math.abs(a.item.timestamp - item.timestamp) - Math.abs(b.item.timestamp - item.timestamp))[0]?.data;
        if (localScaffold && !restoredInputs[card.id]) restoredInputs[card.id] = localScaffold.userIdea || '';
      });
      setCurrentTopic(item.topic);
      setWritingMode(data.writingMode || 'argumentative');
      setCards(restoredCards);
      setStep1Inputs(restoredInputs);
      setDimensionDrafts(restoredDrafts);
      const validations = data.validationResults && typeof data.validationResults === 'object'
        ? data.validationResults as Record<string, IdeaValidationResult>
        : {};
      setRestoredValidationResults(validations);
      validationResultsRef.current = validations;
      coachingTurnsRef.current = Object.fromEntries(Object.entries(validations).map(([id, result]) => [id, result.conversation || []]));
      setPersonalizedExpansions(data.personalizedExpansions || {});
      setAssembledEssay(data.assembledEssay || null);
      setArgumentReflection(data.writingMode === 'narrative' ? null : data.argumentReflection || null);
      submittedRef.current = false;
      setScaffoldData(null);
      setActiveCard(null);
      currentDraftRef.current = '';
      thinkingProcessIdRef.current = cloudProcess?.id || null;
      localThinkingHistoryIdRef.current = item.id;
      setFlowState('selecting_card');
      setIsHistoryOpen(false);
    }
  };

  const handleDeleteHistoryItem = (id: string) => {
    deleteFromHistory(id);
    refreshHistory();
  };

  return (
    <div className="animate-fade-in-up">
      {/* Module Toolbar */}
      <div className="flex justify-end gap-3 mb-6 no-print">
        <button
          onClick={() => setIsHistoryOpen(true)}
          className="text-sm font-medium text-slate-500 hover:text-blue-900 transition-colors flex items-center gap-1 bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-sm"
        >
          <UiIcon name="folder" size={16} />历史记录
        </button>
        <button onClick={resetApp} className="text-sm font-medium text-white bg-blue-900 px-3 py-1.5 rounded-lg hover:bg-blue-950 transition-colors shadow-sm">
          + 新题目
        </button>
      </div>

      {/* Intro Text (Only show at start) */}
      {flowState === 'input_topic' && (
        <div className="text-center mb-10 max-w-2xl mx-auto animate-fade-in-up no-print">
          <h2 className="text-3xl font-bold text-slate-800 mb-4">
            写作构思与表达
          </h2>
          <p className="text-slate-600 text-base leading-relaxed mb-8">
            先完善构思，再使用语言支架展开表达。
          </p>
        </div>
      )}

      {/* --- Flow Controller --- */}

      {/* 1. Input Section */}
      {flowState === 'input_topic' && (
        <>
          {resumeCandidate && (
          <div className="max-w-2xl mx-auto mb-6 rounded-lg border border-emerald-200 bg-emerald-50 p-5 shadow-sm no-print animate-fade-in-up">
              <div className="flex items-start gap-3">
                <span className="text-2xl" aria-hidden="true">💾</span>
                <div className="flex-1">
                  <h3 className="font-bold text-emerald-900">发现未完成的写作草稿</h3>
                  <p className="mt-1 text-sm leading-relaxed text-emerald-800">
                    “{resumeCandidate.topic || '未命名主题'}” 已保存到云端，可以继续上次的维度构思、导师追问或组合成文。
                  </p>
                  <div className="mt-4 flex flex-wrap gap-3">
                    <button
                      onClick={() => resumeProcess(resumeCandidate)}
                      className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition-colors hover:bg-emerald-700"
                    >
                      继续上次写作
                    </button>
                    <button
                      onClick={() => setResumeCandidate(null)}
                      className="rounded-lg border border-emerald-300 bg-white px-4 py-2 text-sm font-medium text-emerald-800 transition-colors hover:bg-emerald-100"
                    >
                      开始新主题
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
          <InputSection
            onSubmit={handleTopicSubmit}
            isLoading={false}
            writingMode={writingMode}
            onWritingModeChange={setWritingMode}
          />
        </>
      )}

      {/* 2. Loading Cards Animation */}
      {flowState === 'loading_cards' && (
        <div className="text-center py-20 animate-pulse no-print">
          <div className="inline-block p-4 rounded-full bg-white shadow-lg mb-6">
          <UiIcon name="refresh" size={28} className="animate-spin text-blue-700" />
          </div>
          <h3 className="text-xl font-bold text-slate-800 mb-2">{writingMode === 'narrative' ? '正在生成故事构思卡...' : '正在抽取盲盒维度...'}</h3>
          <p className="text-slate-500">思维导师正在设计启发性问题</p>
        </div>
      )}

      {/* 3. Phase 1: Card Selection */}
      {(flowState === 'selecting_card' || flowState === 'loading_scaffold') && (
        <div className="no-print">
          <PhaseOneCards
            topic={currentTopic}
            writingMode={writingMode}
            cards={cards}
            inputs={step1Inputs}
            onInputChange={handleStep1InputChange}
            onSelect={handleCardSelect}
            isLoading={flowState === 'loading_scaffold'}
            dimensionDrafts={dimensionDrafts}
            onAssembleEssay={handleAssembleEssay}
            onValidationComplete={handleValidationComplete}
            initialValidationResults={restoredValidationResults}
            onAddDimension={handleAddDimension}
            addingDimension={addingDimension}
          />
        </div>
      )}

      {/* 4. Phase 2: Results Display (with draft support) */}
      {flowState === 'showing_result' && scaffoldData && (
        <ResultsDisplay
          data={scaffoldData}
          topic={currentTopic}
          writingMode={writingMode}
          onBack={handleBackToDimensions}
          initialDraft={activeCard ? (dimensionDrafts[activeCard.id]?.draft || '') : ''}
          onDraftChange={handleDraftChange}
        />
      )}

      {/* 5. Essay Assembly View */}
      {flowState === 'assembling_essay' && assembledEssay && (
        <div className="max-w-4xl mx-auto animate-fade-in-up">
          <div className="space-y-6">
            {/* Header */}
            <div className="text-center mb-8">
              <h2 className="text-3xl font-serif font-bold text-slate-800 mb-2">
                <UiIcon name="essay" className="mr-2 inline-block align-[-3px] text-emerald-700" /><span className="text-emerald-700">{writingMode === 'narrative' ? '整理完整故事' : '组合成文'}</span>
              </h2>
              <p className="text-slate-500">{writingMode === 'narrative' ? '按事件顺序整理场景、行动与结果，完成后可一键发送到叙事写作批改' : '写好引言和结论，完成后可一键发送到作文批改'}</p>
              <div className="mt-3 bg-white border border-slate-200 rounded-lg p-3 shadow-sm inline-flex items-center gap-3">
                <span className="bg-brand-50 text-brand-700 text-[10px] font-bold px-2 py-1 rounded border border-brand-100 uppercase tracking-wider whitespace-nowrap">
                  Topic
                </span>
                <span className="font-bold text-slate-800 text-lg">{currentTopic}</span>
              </div>
            </div>

            {/* Essay Sections */}
            <div className="bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden">

              {/* Argumentative writing uses separate introduction and conclusion sections. */}
              {writingMode !== 'narrative' && <div className="border-b border-slate-100">
                <div className="bg-blue-50 px-6 py-3 border-b border-blue-200">
                  <div className="flex items-center gap-2">
                    <span className="text-blue-700 text-sm">🏁</span>
                    <span className="text-xs font-bold text-blue-900 uppercase tracking-wider">引言 (Introduction)</span>
                    <span className="text-[10px] text-blue-600 ml-auto">请自己尝试写作</span>
                  </div>
                </div>
                <div className="p-6 space-y-3">
                  {/* 写作提示 */}
                  <div className="bg-blue-50/50 rounded-lg p-3 border border-blue-100">
                    <p className="text-xs font-bold text-blue-700 mb-1.5">写作提示</p>
                    <ul className="text-xs text-blue-900/80 space-y-1 list-disc list-inside">
                      <li>用 1-2 句话引出话题（可用提问、现象描述或名言引入）</li>
                      <li>简要说明你将讨论哪几个方面，为正文做铺垫</li>
                    </ul>
                  </div>

                  <textarea
                    value={assembledEssay.introduction}
                    onChange={(e) => setAssembledEssay(prev => prev ? { ...prev, introduction: e.target.value } : null)}
                    className="w-full p-4 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none resize-none text-slate-700 leading-relaxed text-sm min-h-[100px]"
                    placeholder="Try writing your introduction here..."
                  />

                  {/* AI 范例按钮 */}
                  {!showIntroRef ? (
                    <button
                      onClick={() => handleLoadAiReference('intro')}
                      disabled={isLoadingReference}
                      className="text-xs text-blue-600 hover:text-blue-800 underline decoration-blue-200 hover:decoration-blue-400 transition-colors flex items-center gap-1"
                    >
                      {isLoadingReference ? '正在生成范例...' : '查看引言范例'}
                    </button>
                  ) : aiReference && (
                    <div className="bg-blue-50 rounded-lg p-3 border border-blue-200 animate-fade-in-up">
                      <div className="flex items-center justify-between mb-1.5">
                        <p className="text-[10px] font-bold text-blue-700 uppercase tracking-wider">📖 AI 参考范例</p>
                        <button onClick={() => setShowIntroRef(false)} className="text-[10px] text-blue-600 hover:text-blue-800 underline">收起</button>
                      </div>
                      <p className="text-xs text-blue-900 leading-relaxed italic">"{aiReference.introduction}"</p>
                      <p className="text-[10px] text-blue-600 mt-2">提示：请参考思路和结构，用自己的话重新表达</p>
                    </div>
                  )}
                </div>
              </div>}

              {/* === Body Paragraphs === */}
              {assembledEssay.bodyParagraphs.map((para, i) => (
                <div key={i} className="border-b border-slate-100">
                  <div className="bg-slate-100 px-6 py-3 border-b border-slate-200">
                    <div className="flex items-center gap-2">
                      <span className="text-slate-600 text-sm">📖</span>
                      <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                        {writingMode === 'narrative' ? `故事环节 ${i + 1} — ${para.dimension}` : `正文段落 ${i + 1} — ${para.dimension}`}
                      </span>
                      <span className="text-[10px] text-slate-500 ml-auto">你的原创段落</span>
                    </div>
                  </div>
                  <div className="p-6">
                    <textarea
                      value={para.draft}
                      onChange={(e) => {
                        setAssembledEssay(prev => {
                          if (!prev) return null;
                          const newBody = [...prev.bodyParagraphs];
                          newBody[i] = { ...newBody[i], draft: e.target.value };
                          return { ...prev, bodyParagraphs: newBody };
                        });
                      }}
                      className="w-full p-4 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none resize-none text-slate-700 leading-relaxed text-sm min-h-[120px]"
                    />
                  </div>
                </div>
              ))}

              {writingMode !== 'narrative' && <div>
                <div className="bg-blue-50 px-6 py-3 border-b border-blue-200">
                  <div className="flex items-center gap-2">
                    <span className="text-blue-700 text-sm">🎯</span>
                    <span className="text-xs font-bold text-blue-900 uppercase tracking-wider">结论 (Conclusion)</span>
                    <span className="text-[10px] text-blue-600 ml-auto">请自己尝试写作</span>
                  </div>
                </div>
                <div className="p-6 space-y-3">
                  {/* 写作提示 */}
                  <div className="bg-blue-50/50 rounded-lg p-3 border border-blue-100">
                    <p className="text-xs font-bold text-blue-700 mb-1.5">写作提示</p>
                    <ul className="text-xs text-blue-900/80 space-y-1 list-disc list-inside">
                      <li>用 1 句话总结以上论点的核心观点</li>
                      <li>给出你的最终立场、建议或展望</li>
                    </ul>
                  </div>

                  <textarea
                    value={assembledEssay.conclusion}
                    onChange={(e) => setAssembledEssay(prev => prev ? { ...prev, conclusion: e.target.value } : null)}
                    className="w-full p-4 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none resize-none text-slate-700 leading-relaxed text-sm min-h-[100px]"
                    placeholder="Try writing your conclusion here..."
                  />

                  {/* AI 范例按钮 */}
                  {!showConclusionRef ? (
                    <button
                      onClick={() => handleLoadAiReference('conclusion')}
                      disabled={isLoadingReference}
                      className="text-xs text-blue-600 hover:text-blue-800 underline decoration-blue-200 hover:decoration-blue-400 transition-colors flex items-center gap-1"
                    >
                      {isLoadingReference ? '正在生成范例...' : '查看结论范例'}
                    </button>
                  ) : aiReference && (
                    <div className="bg-blue-50 rounded-lg p-3 border border-blue-200 animate-fade-in-up">
                      <div className="flex items-center justify-between mb-1.5">
                        <p className="text-[10px] font-bold text-blue-700 uppercase tracking-wider">📖 AI 参考范例</p>
                        <button onClick={() => setShowConclusionRef(false)} className="text-[10px] text-blue-600 hover:text-blue-800 underline">收起</button>
                      </div>
                      <p className="text-xs text-blue-900 leading-relaxed italic">"{aiReference.conclusion}"</p>
                      <p className="text-[10px] text-blue-600 mt-2">提示：请参考思路和结构，用自己的话重新表达</p>
                    </div>
                  )}
                </div>
              </div>}
            </div>

            {writingMode === 'argumentative' && (
              <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-5">
                <label htmlFor="argument-reflection" className="block text-sm font-bold text-blue-900 mb-1">
                  提交前自检（可选）
                </label>
                <p className="text-xs text-blue-800/80 mb-3">这次你补充、调整或保留了什么判断？依据是什么？请用自己的话记录，供审辨思维评价参考。</p>
                <textarea
                  id="argument-reflection"
                  value={argumentReflection?.text || ''}
                  onChange={event => setArgumentReflection({ text: event.target.value, updatedAt: new Date().toISOString() })}
                  className="w-full min-h-[86px] rounded-lg border border-blue-200 bg-white p-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  placeholder="例如：我保留了原观点，因为……；我补充了……，因为原来的依据不足以说明……"
                />
              </div>
            )}

            {/* Word Count & Actions */}
            <div className="flex items-center justify-between bg-white rounded-xl p-4 border border-slate-100 shadow-sm">
              <div className="text-sm text-slate-500">
                总字数：<span className="font-bold text-slate-800">
                  {(writingMode === 'narrative'
                    ? assembledEssay.bodyParagraphs.map(p => p.draft)
                    : [assembledEssay.introduction, ...assembledEssay.bodyParagraphs.map(p => p.draft), assembledEssay.conclusion])
                    .join(' ').split(/\s+/).filter(w => w).length}
                </span> words
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setFlowState('selecting_card')}
                  className="px-4 py-2 rounded-lg text-sm font-bold text-slate-500 bg-slate-100 hover:bg-slate-200 transition-colors"
                >
                  ← 返回编辑
                </button>

                {onSendToGrader && (
                  <button
                    onClick={handleSendToGrader}
                    disabled={sendingToGrader}
                    className="px-6 py-3 bg-blue-900 hover:bg-blue-950 disabled:opacity-50 text-white rounded-xl font-bold text-sm shadow-md transition-colors flex items-center gap-2"
                  >
                    <UiIcon name="arrowRight" size={18} />{sendingToGrader ? '正在保存写作过程...' : '发送到作文批改'}
                  </button>
                )}
              </div>
            </div>
            {submissionError && <p role="alert" className="text-sm text-rose-700">{submissionError}</p>}
          </div>
        </div>
      )}

      {/* Error State */}
      {(flowState === 'error' || error) && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center text-red-600 max-w-2xl mx-auto mt-8 no-print">
          <p className="font-bold text-lg mb-2">Something went wrong</p>
          <p>{error}</p>
          {error?.includes("API Key") && (
            <p className="text-xs mt-2 text-slate-500">
              请检查右上角设置中的 API Key，或联系管理员在 Netlify 后台配置环境变量。
            </p>
          )}
          <button onClick={resetApp} className="mt-4 underline font-bold hover:text-red-800">Try Again</button>
        </div>
      )}

      {/* History Modal */}
      <HistoryModal
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        history={historyItems}
        onSelect={handleSelectHistoryItem}
        onDelete={handleDeleteHistoryItem}
        title="Thinking History"
      />
    </div>
  );
};

export default SocraticCoach;
