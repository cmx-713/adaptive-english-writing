
import { GoogleGenAI, Type, Schema } from "@google/genai";
import { 
  InspirationCard, 
  ScaffoldContent, 
  VocabularyItem, 
  CollocationItem, 
  DraftFeedback,
  EssayGradeResult,
  DrillItem,
  DrillMode,
  AdaptiveContext,
  ApiConfig,
  ContrastivePoint
} from "../types";

// Define the IdeaValidationResult type locally and export it as it is used by components
export interface IdeaValidationResult {
  status: 'exceptional' | 'valid' | 'weak' | 'off_topic';
  feedbackTitle: string;
  analysis: string;
}

const getApiConfig = (): { apiKey: string, model: string } => {
  const stored = localStorage.getItem('cet_api_config');
  if (stored) {
    try {
      const config = JSON.parse(stored) as ApiConfig;
      if (config.apiKey) {
        return { 
          apiKey: config.apiKey, 
          model: config.modelName || 'gemini-3-flash-preview' 
        };
      }
    } catch (e) { console.error("Invalid config", e); }
  }
  return { apiKey: process.env.API_KEY || '', model: 'gemini-3-flash-preview' };
};

const getClient = () => {
  const { apiKey } = getApiConfig();
  if (!apiKey) throw new Error("API Key missing. Please check your settings.");
  return new GoogleGenAI({ apiKey });
};

const callAI = async(
  systemPrompt: string, 
  userPrompt: string, 
  responseSchema?: Schema,
  options: { temperature?: number } = {}
  ):Promise<string> => {
  const { model } = getApiConfig();
  const ai = getClient();
  
  const config: any = {
    temperature: options.temperature !== undefined ? options.temperature : 0.7,
    topK: 40,
    topP: 0.95,
  };

  if (responseSchema) {
    config.responseMimeType = "application/json";
    config.responseSchema = responseSchema;
  }

  const response = await ai.models.generateContent({
    model: model,
    config,
    contents: [
      { role: 'user', parts: [{ text: systemPrompt + "\n\n" + userPrompt }] }
    ]
  });

  return response.text || "";
};

// --- Module 1: Socratic Coach Functions ---

export const fetchInspirationCards = async (topic: string): Promise<InspirationCard[]> => {
  const schema: Schema = {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: {
        id: { type: Type.STRING },
        dimension: { type: Type.STRING },
        socraticQuestion: { type: Type.STRING },
        hint: { type: Type.STRING },
        keywords: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              en: { type: Type.STRING },
              zh: { type: Type.STRING }
            },
            required: ['en', 'zh']
          }
        }
      },
      required: ['id', 'dimension', 'socraticQuestion', 'hint', 'keywords']
    }
  };

  const systemPrompt = "You are a CET-4/6 writing coach. Help Chinese students brainstorm. You MUST write the socraticQuestion and hint fields in Chinese (中文), so that students can easily understand. The dimension field should remain in English."
  const userPrompt = `Generate 3 distinct inspiration cards for the essay topic: "${topic}". Each card should represent a different perspective (e.g., Economic, Social, Personal). IMPORTANT: The "socraticQuestion" and "hint" fields MUST be written in Chinese (中文) to help students understand.`;
  
  const res = await callAI(systemPrompt, userPrompt, schema);
  return JSON.parse(res);
};

export const validateIdea = async (topic: string, dimension: string, idea: string): Promise<IdeaValidationResult> => {
  const schema: Schema = {
    type: Type.OBJECT,
    properties: {
      status: { type: Type.STRING, enum: ['exceptional', 'valid', 'weak', 'off_topic'] },
      feedbackTitle: { type: Type.STRING },
      analysis: { type: Type.STRING }
    },
    required: ['status', 'feedbackTitle', 'analysis']
  };

  const systemPrompt = "You are a strict but helpful writing coach. Evaluate the student's idea relevance. You MUST write the feedbackTitle and analysis fields in Chinese, so that students can easily understand your feedback.";
  const userPrompt = `Topic: ${topic}\nDimension: ${dimension}\nStudent Idea: ${idea}\nProvide feedback. IMPORTANT: The "feedbackTitle" and "analysis" fields MUST be written in Chinese.`;
  
  const res = await callAI(systemPrompt, userPrompt, schema);
  return JSON.parse(res);
};

export const fetchLanguageScaffolds = async (topic: string, dimension: string, userIdea: string): Promise<ScaffoldContent> => {
  const schema: Schema = {
    type: Type.OBJECT,
    properties: {
      selectedDimension: { type: Type.STRING },
      userIdea: { type: Type.STRING },
      vocabulary: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            word: { type: Type.STRING },
            chinese: { type: Type.STRING },
            englishDefinition: { type: Type.STRING },
            usage: { type: Type.STRING }
          },
          required: ['word', 'chinese', 'englishDefinition', 'usage']
        }
      },
      collocations: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            en: { type: Type.STRING },
            zh: { type: Type.STRING }
          },
          required: ['en', 'zh']
        }
      },

      frames: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            patternName: { type: Type.STRING },
            patternNameZh: { type: Type.STRING },
            template: { type: Type.STRING },
            modelSentence: { type: Type.STRING }
          },
          required: ['patternName', 'patternNameZh', 'template', 'modelSentence']
        }
      } 
    },
    required: ['selectedDimension', 'userIdea', 'vocabulary', 'collocations', 'frames']
  };

  const systemPrompt = "You are a writing coach. Provide vocabulary and sentence frames to help the student expand their idea.";
  const userPrompt = `Topic: ${topic}\nDimension: ${dimension}\nStudent Idea: ${userIdea}\nGenerate scaffolds.\n\nIMPORTANT for the "frames" field: Generate 3 sentence frames. Each frame must include:\n- "patternName": the English sentence pattern name (e.g., "Not only...but also...")\n- "patternNameZh": Chinese translation of the pattern (e.g., "不仅……而且还……")\n- "template": a sentence template where blanks are marked by brackets containing CHINESE hints.\n- "modelSentence": a complete, well-written reference sentence that fills all the blanks perfectly.\n\nCRITICAL RULE for "template": The text inside square brackets [] MUST be in Chinese (中文), NOT English. These hints tell the student what concept to express in each blank.\n\nCORRECT example: "Not only do these activities [培养什么能力], but they also equip students with [什么样的技能] necessary to [达成什么目标]."\nWRONG example: "Not only do these activities [what ability to cultivate], but they also equip students with [what kind of skills] necessary to [what goal to achieve]."\n\nThe hints MUST be short Chinese phrases (2-6 Chinese characters) describing what to fill in.`;
  
  const res = await callAI(systemPrompt, userPrompt, schema);
  return JSON.parse(res);
};

export const fetchDimensionKeywords = async (dimension: string, topic?: string): Promise<{en: string, zh: string}[]> => {
  const schema: Schema = {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: {
        en: { type: Type.STRING },
        zh: { type: Type.STRING }
      },
      required: ['en', 'zh']
    }
  };

  const systemPrompt = "Generate related keywords.";
  const userPrompt = `Dimension: ${dimension}\nTopic: ${topic || 'General'}\nGenerate 8 relevant keywords.`;
  
  const res = await callAI(systemPrompt, userPrompt, schema);
  return JSON.parse(res);
};

export const validateSentence = async (sentence: string, topic: string): Promise<{ isValid: boolean, feedback: string, suggestion: string }> => {
  const schema: Schema = {
    type: Type.OBJECT,
    properties: {
      isValid: { type: Type.BOOLEAN },
      message: { type: Type.STRING },
      feedback: { type: Type.STRING },
      suggestion: { type: Type.STRING }
    },
    required: ['isValid', 'feedback', 'suggestion']
  };

  const systemPrompt = "You are a CET-4/6 writing coach helping Chinese students. Evaluate the student's sentence completion. You MUST write feedback and suggestion in Chinese (中文).";
  const userPrompt = `Topic: "${topic}"\nStudent's sentence: "${sentence}"\n\nEvaluate this sentence and provide:\n- "isValid": true if the sentence is grammatically correct and makes sense, false otherwise.\n- "feedback": 用中文给出具体反馈，指出语法是否正确、表达是否地道、内容是否切题。如果有错误，明确指出哪里有问题。(2-3句话)\n- "suggestion": 用中文给出一条改进建议，告诉学生如何让表达更好。如果已经很好，给出一个更高级的替代表达。(1句话)`;
  
  const res = await callAI(systemPrompt, userPrompt, schema);
  return JSON.parse(res);
};

export const fetchMoreCollocations = async (topic: string, dimension: string, userIdea: string): Promise<CollocationItem[]> => {
  const schema: Schema = {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: {
        en: { type: Type.STRING },
        zh: { type: Type.STRING }
      },
      required: ['en', 'zh']
    }
  };
  
  const res = await callAI("Writing assistant", `Generate 6 more advanced collocations for Idea: ${userIdea} (Topic: ${topic})`, schema);
  return JSON.parse(res);
};

export const analyzeDraft = async (topic: string, dimension: string, draft: string, vocabulary: VocabularyItem[]): Promise<DraftFeedback> => {
  const schema: Schema = {
    type: Type.OBJECT,
    properties: {
      score: { type: Type.NUMBER },
      comment: { type: Type.STRING },
      usedVocabulary: { type: Type.ARRAY, items: { type: Type.STRING } },
      suggestions: { type: Type.ARRAY, items: { type: Type.STRING } },
      polishedVersion: { type: Type.STRING }
    },
    required: ['score', 'comment', 'suggestions', 'polishedVersion']
  };

  const vocabList = vocabulary.map(v => v.word).join(', ');
  const systemPrompt = "You are a CET-4/6 writing coach helping Chinese students. You MUST write the comment and suggestions fields in Chinese (中文) to help students understand your feedback. The polishedVersion field should remain in English as it is a model English paragraph.";
  
  const userPrompt = `Topic: ${topic}\nDimension: ${dimension}\nDraft: "${draft}"\nTarget Vocab: ${vocabList}\nAnalyze the draft.\n\nIMPORTANT: The "comment" field MUST be in Chinese (中文), giving specific feedback on grammar, content, and vocabulary usage. The "suggestions" array MUST contain Chinese suggestions (中文建议) telling the student how to improve. The "polishedVersion" should be a polished English paragraph.`;

  const res = await callAI("Writing coach", userPrompt, schema);
  return JSON.parse(res);
};

export const generateEssayIntroConclusion = async (
  topic: string, 
  bodyParagraphs: { dimension: string; draft: string }[]
): Promise<{ introduction: string; conclusion: string }> => {
  const schema: Schema = {
    type: Type.OBJECT,
    properties: {
      introduction: { type: Type.STRING },
      conclusion: { type: Type.STRING }
    },
    required: ['introduction', 'conclusion']
  };

  const bodyText = bodyParagraphs.map((p, i) => `[Dimension ${i + 1}: ${p.dimension}]\n${p.draft}`).join('\n\n');

  const systemPrompt = "You are a CET-4/6 writing coach. Generate an introduction and conclusion paragraph for a student's essay. Match the language level of the student's body paragraphs - do NOT write at a level far above the student's actual writing. Keep both paragraphs concise (2-3 sentences each).";
  const userPrompt = `Topic: "${topic}"\n\nThe student has written the following body paragraphs:\n\n${bodyText}\n\nGenerate:\n- "introduction": An opening paragraph that introduces the topic and previews the main points. Match the student's writing level.\n- "conclusion": A closing paragraph that summarizes the key arguments and provides a final thought. Match the student's writing level.\n\nBoth paragraphs should be in English, concise, and appropriate for CET-4/6 level.`;

  const res = await callAI(systemPrompt, userPrompt, schema);
  return JSON.parse(res);
};



// --- Module 2: Essay Grader ---

export const gradeEssay = async (topic: string, essayText: string): Promise<EssayGradeResult> => {
  // Step 1: Grade and Critique
  const step1Schema: Schema = {
    type: Type.OBJECT,
    properties: {
      totalScore: { type: Type.NUMBER },
      subScores: {
        type: Type.OBJECT,
        properties: {
          content: { type: Type.NUMBER },
          organization: { type: Type.NUMBER },
          proficiency: { type: Type.NUMBER },
          clarity: { type: Type.NUMBER }
        },
        required: ['content', 'organization', 'proficiency', 'clarity']
      },
      modelSubScores: {
        type: Type.OBJECT,
        properties: {
          content: { type: Type.NUMBER },
          organization: { type: Type.NUMBER },
          proficiency: { type: Type.NUMBER },
          clarity: { type: Type.NUMBER }
        },
        required: ['content', 'organization', 'proficiency', 'clarity']
      },
      generalComment: { type: Type.STRING, description: "Comprehensive review in Chinese (Professor tone)." },
      issueOverview: {
        type: Type.OBJECT,
        properties: {
          critical: { type: Type.ARRAY, items: { type: Type.STRING }, description: "List of major issues in Chinese" },
          general: { type: Type.ARRAY, items: { type: Type.STRING }, description: "List of moderate issues in Chinese" },
          minor: { type: Type.ARRAY, items: { type: Type.STRING }, description: "List of minor issues in Chinese" }
        },
        required: ['critical', 'general', 'minor']
      },
      critiques: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            original: { type: Type.STRING, description: "The EXACT English text snippet from the student's essay. Do NOT translate. Do NOT summarize."},
            context: { type: Type.STRING, description: "The FULL sentence containing the error. Essential for display." }, 
            revised: { type: Type.STRING },
            category: { type: Type.STRING, enum: ['Content', 'Organization', 'Proficiency', 'Clarity'] },
            severity: { type: Type.STRING, enum: ['critical', 'general', 'minor'] },
            explanation: { type: Type.STRING, description: "Deep diagnostic explanation in CHINESE." }
          },
          required: ['original', 'context', 'revised', 'category', 'severity', 'explanation']
        }
      },
      contrastiveLearning: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            category: { type: Type.STRING, enum: ['Language Foundation', 'Logical Reasoning', 'Strategic Intent'] },
            userContent: { type: Type.STRING },
            polishedContent: { type: Type.STRING },
            analysis: { type: Type.STRING, description: "Strategic analysis in Chinese" }
          },
          required: ['category', 'userContent', 'polishedContent', 'analysis']
        }
      },
      polishedEssay: { type: Type.STRING }
    },
    required: ['totalScore', 'subScores', 'generalComment', 'issueOverview', 'critiques', 'contrastiveLearning', 'polishedEssay']
  };

  const step1SystemPrompt = `You are a distinguished Professor of English Writing (CET-4/6 Authority).
  
  STRICT SCORING RUBRIC (Max 15 Points):
  - Content (0-4), Organization (0-3), Proficiency (0-5), Clarity (0-3). Sum must equal totalScore.

  TASK 1: FULL SPECTRUM AUDIT (全量深度审计)
  - You must scan the *entire* essay. Identify **ALL** issues that negatively impact Content, Organization, Proficiency, or Clarity.
  - Do not limit to 3-5 errors. If there are 15 errors, list all 15.
  - The \`context\` field MUST contain the COMPLETE SENTENCE where the error occurred.

  TASK 2: The "Contrastive Logic" Engine
  You are not just correcting grammar; you are teaching LOGIC and STRUCTURE. 
  When generating the \`contrastiveLearning\` array and the \`polishedEssay\`, you MUST follow this strict protocol:

  1. STRATEGIC COVERAGE (Must generate 5-6 points):
  Do NOT just pick random vocabulary words. You must identify specific gaps in the student's logic and map them to the model essay. You must include:
  - Point 0 (Introduction): Compare how the student opens vs. the Model's "Hook + Thesis" strategy.
  - Point 1 & 2 (Body Paragraphs): Focus on "Topic Sentences" (Topic + Controlling Idea) or "Logical Cohesion" (Connectors).
  - Point 3 (Argumentation): Focus on "Evidence/Example" depth vs. student's shallow assertions.
  - Point 4 (Conclusion): Focus on "Elevation/Call to Action" vs. simple repetition.
  - Point 5 (Vocabulary/Tone): Only then, focus on academic lexical resource.

  2. INTERACTIVE ANCHORING (CRITICAL FOR UI):
  - You MUST modify the \`polishedEssay\` text to include highlight tags that match the \`contrastiveLearning\` array index.
  - Syntax: Wrap the EXACT sentence or phrase in the \`polishedEssay\` that corresponds to the strategy with \`<highlight id='N'>...</highlight>\`.
  - Rule: If \`contrastiveLearning[0]\` discusses the Introduction, the best sentence in the Model's introduction MUST be wrapped in \`<highlight id='0'>...</highlight>\`.
  - Constraint: Every item in \`contrastiveLearning\` must have a corresponding \`<highlight>\` tag in \`polishedEssay\`.

  3. DATA FORMAT Rules:
  - \`generalComment\`, \`issueOverview\`, \`critiques.explanation\`, and \`contrastiveLearning.analysis\` MUST be in SIMPLIFIED CHINESE.
  - \`contrastiveLearning.category\` must be one of: 'Strategic Intent' (Introduction/Conclusion goals), 'Logical Reasoning' (Cohesion/Argumentation), 'Language Foundation' (Vocabulary/Grammar).
  - \`contrastiveLearning.userContent\`: The student's original weak sentence/phrase.
  - \`contrastiveLearning.polishedContent\`: The specific upgraded phrase from the model.
  - \`contrastiveLearning.analysis\`: Explain the LOGIC gap (e.g., "原句逻辑跳跃，范文通过'In strictly logic terms'建立了因果链条...").

  Structure Tags for Polished Essay:
  - Mark sections clearly with: [INTRODUCTION], [BODY_PARA_1], [BODY_PARA_2], [CONCLUSION].
  `;

  const step1UserPrompt = `Topic: ${topic || 'General Essay'}\nEssay: "${essayText}"`;
  
  const step1Json = await callAI(step1SystemPrompt, step1UserPrompt, step1Schema, { temperature: 0.1 });
  const step1Data = JSON.parse(step1Json);

  // Prepare context for Step 2
  const contrastiveContext = step1Data.contrastiveLearning
    .map((c: ContrastivePoint, i: number) => `Point ${i + 1} (${c.category}): User wrote "${c.userContent}" -> Polished to "${c.polishedContent}". Analysis: ${c.analysis}`)
    .join('\n');
  const polishedWordsContext = step1Data.polishedEssay.substring(0, 1000); // Truncate if too long

  // 5. CALL STEP 2: Retraining Generation (INTEGRATED LEARNING)
  const step2SystemPrompt = `
      Role: CET-4/6 Writing Coach.
      Task: Generate 'Retraining' exercises to help the student *clone* the expert strategies identified in the previous step.
      
      **Core Principle: Integrated Learning (学练一体化)**
      You must NOT generate generic grammar questions. 
      You MUST look at the [Expert Strategy / 高手决策逻辑] provided in the context below, and create exercises that force the student to apply that specific logic to a *new* context.

      **Strict Language Requirement**:
      - **Instruction (question)**: MUST be in **Chinese**. You must explicitly mention the strategy name being cloned (e.g., "请运用范文中使用的【名词化结构】技巧...").
      - **Hint**: MUST be in **Chinese**. Guide the student on *how* to clone the strategy.
      - **Explanation**: MUST be in **Chinese**. Explain why the reference answer is better based on the strategy.

      **Input Context (From Step 1):**
      ${contrastiveContext}

      **Required Exercise Types (Generate 3 Distinct Exercises):**
      
      1. **[Academic Upgrade]** (Focus on 'Language Foundation'):
         - Scenario: Give a simple/oral sentence (Chinglish).
         - Task: Ask the student to rewrite it using specific academic words/structures found in the model essay.
         - Instruction Format: "请模仿范文中的【(Strategy Name/Key Word)】用法，将以下口语化句子改写得更显学术专业："
      
      2. **[Logic Bridge]** (Focus on 'Logical Reasoning'):
         - Scenario: Give two isolated ideas/sentences.
         - Task: Ask the student to connect them using a specific logical transition or cohesive device found in the model essay.
         - Instruction Format: "请运用范文中的【(Strategy Name)】逻辑连接手法，将以下两个松散的分句整合成一个紧密的逻辑整体："
      
      3. **[Intent Realization]** (Focus on 'Strategic Intent'):
         - Scenario: Describe a specific writing goal (e.g., "You want to concede a point to strengthen your argument").
         - Task: Ask the student to write a sentence achieving this goal using the strategy found in the model.
         - Instruction Format: "请参考范文中的【(Strategy Name)】策略，写一个句子来实现以下特定的写作意图："

      **Output Constraints:**
      - \`question\`: The specific instruction in CHINESE following the formats above.
      - \`originalContext\`: The "bad" example, simple sentence, or context description to be improved.
      - \`hint\`: A specific "Expert Tip" pointing back to the model essay's technique (in CHINESE).
      - \`mandatoryKeywords\`: List of 2-3 English keywords/phrases that strictly force the use of the strategy (e.g., ["Admittedly", "However"]).
      - \`referenceAnswer\`: A perfect C1-level answer (English).
      - \`explanation\`: Explain *why* this answer is better (e.g., "通过使用此技巧，你成功避免了...，提升了...") (in CHINESE).
      - \`materials\`: Extract 3-5 key phrases/words from the provided *polished essay context*: "${polishedWordsContext}".
    `;

  const step2Schema: Schema = {
    type: Type.OBJECT,
    properties: {
      retraining: {
          type: Type.OBJECT,
          properties: {
          exercises: {
              type: Type.ARRAY,
              items: {
              type: Type.OBJECT,
              properties: {
                  type: { type: Type.STRING, enum: ['Academic Upgrade', 'Logic Bridge', 'Intent Realization'] },
                  question: { type: Type.STRING },
                  originalContext: { type: Type.STRING, description: "The starting sentence or context to improve." },
                  hint: { type: Type.STRING, description: "Pointer to the model strategy (Chinese)." },
                  mandatoryKeywords: { 
                    type: Type.ARRAY, 
                    items: { type: Type.STRING },
                    description: "Required keywords for the student to use"
                  },
                  referenceAnswer: { type: Type.STRING },
                  explanation: { type: Type.STRING, description: "Explanation in Chinese." }
              },
              required: ["type", "question", "originalContext", "hint", "mandatoryKeywords", "referenceAnswer", "explanation"]
              }
          },
          materials: {
              type: Type.ARRAY,
              items: {
              type: Type.OBJECT,
              properties: {
                  wordOrPhrase: { type: Type.STRING },
                  definition: { type: Type.STRING, description: "Chinese definition" },
                  example: { type: Type.STRING }
              },
              required: ["wordOrPhrase", "definition", "example"]
              }
          }
          },
          required: ["exercises", "materials"]
      }
    },
    required: ["retraining"]
  };

  const step2Json = await callAI(step2SystemPrompt, "Generate Integrated Retraining Exercises.", step2Schema, { temperature: 0.3 });
  const step2Data = JSON.parse(step2Json);

  // 6. Merge and Return
  return { ...step1Data, retraining: step2Data.retraining };
};

// --- Module 3: Sentence Drills ---

export const fetchDrillItems = async (topic: string, mode: DrillMode, context: AdaptiveContext): Promise<DrillItem[]> => {
  const schema: Schema = {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: {
        id: { type: Type.STRING },
        mode: { type: Type.STRING },
        questionContext: { type: Type.STRING },
        highlightText: { type: Type.STRING },
        options: { type: Type.ARRAY, items: { type: Type.STRING } },
        correctOption: { type: Type.STRING },
        explanation: { type: Type.STRING }
      },
      required: ['id', 'mode', 'questionContext', 'options', 'correctOption', 'explanation']
    }
  };

  let specificPrompt = "";
  if (mode === 'grammar_doctor') {
    specificPrompt = `Focus on grammar errors. Context errors: ${context.pastErrors.join(', ')}. Generate error correction drills.`;
  } else if (mode === 'elevation_lab') {
    specificPrompt = `Focus on vocabulary upgrade. Target vocab: ${context.targetVocab.join(', ')}. Generate sentence upgrade drills.`;
  } else {
    specificPrompt = `Focus on sentence structure combining. Generate sentence combining drills.`;
  }

  const userPrompt = `Topic: ${topic}
  Mode: ${mode}
  ${specificPrompt}
  Generate 5 drill items.

  STRICT LANGUAGE RULES:
  1. The \`explanation\` field MUST be in SIMPLIFIED CHINESE (简体中文) to help students understand the logic.
  2. Keep \`questionContext\`, \`highlightText\`, and \`options\` in English.`;
  const res = await callAI("Drill generator", userPrompt, schema);
  return JSON.parse(res);
};

// services/geminiService.ts

export const evaluateRetrainingAttempt = async (
  question: string, 
  strategyHint: string, 
  userAnswer: string
): Promise<{ status: 'pass' | 'partial' | 'fail', feedback: string }> => {
  
  const schema: Schema = {
    type: Type.OBJECT,
    properties: {
      status: { type: Type.STRING, enum: ['pass', 'partial', 'fail'] },
      feedback: { type: Type.STRING }
    },
    required: ['status', 'feedback']
  };

  const systemPrompt = `You are a strict Writing Coach. 
  The student is practicing a specific writing strategy: "${strategyHint}".
  The question was: "${question}".
  
  Evaluate the student's answer: "${userAnswer}".
  
  Rules:
  1. If they successfully applied the strategy and grammar is correct -> 'pass'.
  2. If they tried the strategy but made grammar errors or used it weakly -> 'partial'.
  3. If they ignored the strategy or wrote gibberish -> 'fail'.
  
  Feedback must be in SIMPLIFIED CHINESE, brief (1 sentence), addressing the strategy application.`;

  const res = await callAI(systemPrompt, "Evaluate Answer", schema);
  return JSON.parse(res);
};