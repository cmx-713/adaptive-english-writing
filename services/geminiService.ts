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
  thinkingExpansion: string[]; // Layer 2: 基于用户观点的个性化思路拓展（中文）
}

// 将 Google Type schema 转为简化 JSON 示例字符串，帮助非 Google 模型理解输出结构
const schemaToJsonExample = (schema: Schema, depth: number = 0): string => {
  try {
    const indent = '  '.repeat(depth);
    const innerIndent = '  '.repeat(depth + 1);

    if (schema.type === Type.STRING) {
      const desc = (schema as any).description ? ` // ${(schema as any).description}` : '';
      const enumVals = (schema as any).enum;
      if (enumVals) return `"one of: ${enumVals.join(' | ')}"${desc}`;
      return `"string"${desc}`;
    }
    if (schema.type === Type.NUMBER) {
      const desc = (schema as any).description ? ` // ${(schema as any).description}` : '';
      return `0${desc}`;
    }
    if (schema.type === Type.BOOLEAN) return 'false';
    if (schema.type === Type.ARRAY) {
      const items = (schema as any).items;
      if (items) {
        const itemExample = schemaToJsonExample(items, depth + 1);
        return `[\n${innerIndent}${itemExample}\n${indent}]`;
      }
      return '[]';
    }
    if (schema.type === Type.OBJECT) {
      const props = (schema as any).properties;
      if (!props) return '{}';
      const entries = Object.entries(props).map(([key, val]) => {
        const valStr = schemaToJsonExample(val as Schema, depth + 1);
        return `${innerIndent}"${key}": ${valStr}`;
      });
      return `{\n${entries.join(',\n')}\n${indent}}`;
    }
    return '"unknown"';
  } catch {
    return '{}';
  }
};

// 安全的 JSON 解析：如果失败，提供清晰的错误信息
const safeJsonParse = (json: string, context: string = 'API'): any => {
  try {
    return JSON.parse(json);
  } catch (e) {
    console.error(`[${context}] JSON parse failed. Raw (first 500 chars):`, json.substring(0, 500));
    throw new Error(`AI 返回的数据格式异常（${context}），请重试。如果使用自定义 API，请确认模型支持 JSON 输出格式。`);
  }
};

const getFullApiConfig = (): ApiConfig => {
  const stored = localStorage.getItem('cet_api_config');
  if (stored) {
    try {
      const config = JSON.parse(stored) as ApiConfig;
      if (config.apiKey) return config;
    } catch (e) { console.error("Invalid config", e); }
  }
  return {
    provider: 'google',
    apiKey: process.env.API_KEY || '',
    modelName: 'gemini-3-flash-preview'
  };
};

// 向后兼容：部分代码仍使用此函数
const getApiConfig = (): { apiKey: string, model: string } => {
  const config = getFullApiConfig();
  return { apiKey: config.apiKey, model: config.modelName || 'gemini-3-flash-preview' };
};

const getClient = () => {
  const { apiKey } = getApiConfig();
  if (!apiKey) throw new Error("API Key missing. Please check your settings.");
  return new GoogleGenAI({ apiKey });
};

// OpenAI 兼容接口调用（DeepSeek、Moonshot、Qwen、GLM、OpenAI、Custom）
const callOpenAICompatible = async (
  baseUrl: string,
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  options: { temperature?: number; jsonMode?: boolean } = {}
): Promise<string> => {
  const url = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;

  const body: any = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    temperature: options.temperature !== undefined ? options.temperature : 0.7,
    top_p: 0.95,
    max_tokens: 8192, // 防止复杂响应被截断（DeepSeek 默认仅 4096）
  };

  // JSON 模式：大部分 OpenAI 兼容 API 都支持
  if (options.jsonMode) {
    body.response_format = { type: 'json_object' };
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API 请求失败 (${response.status}): ${errorText.substring(0, 200)}`);
  }

  const data = await response.json();

  // 检测输出是否被截断
  const finishReason = data.choices?.[0]?.finish_reason;
  if (finishReason === 'length') {
    console.warn('[callOpenAICompatible] Response truncated (finish_reason=length). Output may be incomplete.');
  }

  const content = data.choices?.[0]?.message?.content || "";

  if (!content) {
    console.error('[callOpenAICompatible] Empty content. Full response:', JSON.stringify(data).substring(0, 500));
    throw new Error('AI 返回了空内容。请检查 API Key 和模型名称是否正确。');
  }

  return cleanJsonResponse(content);
};

// 清理 AI 返回的 JSON：去除 markdown 代码块、前后多余文本、修复截断
const cleanJsonResponse = (text: string): string => {
  let cleaned = text.trim();

  // 去除 markdown 代码块: ```json ... ``` 或 ``` ... ```
  const codeBlockMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch) {
    cleaned = codeBlockMatch[1].trim();
  }

  // 如果开头不是 { 或 [，尝试找到第一个 JSON 起始位置
  if (!cleaned.startsWith('{') && !cleaned.startsWith('[')) {
    const jsonStart = cleaned.search(/[\[{]/);
    if (jsonStart !== -1) {
      cleaned = cleaned.substring(jsonStart);
    }
  }

  // 如果结尾不是 } 或 ]，截断到最后一个完整闭合处
  if (!cleaned.endsWith('}') && !cleaned.endsWith(']')) {
    const lastBrace = Math.max(cleaned.lastIndexOf('}'), cleaned.lastIndexOf(']'));
    if (lastBrace !== -1) {
      cleaned = cleaned.substring(0, lastBrace + 1);
    }
  }

  // 尝试修复被截断的 JSON（补全未闭合的括号）
  try {
    JSON.parse(cleaned);
    return cleaned; // 已经是合法 JSON，直接返回
  } catch {
    // JSON 不合法，尝试补全
    return tryRepairTruncatedJson(cleaned);
  }
};

// 尝试修复被截断的 JSON：关闭未闭合的字符串、数组、对象
const tryRepairTruncatedJson = (text: string): string => {
  let repaired = text;

  // 1. 如果截断在字符串中间（奇数个未转义引号），关闭字符串
  let inString = false;
  let lastCharBeforeEnd = '';
  for (let i = 0; i < repaired.length; i++) {
    const ch = repaired[i];
    if (ch === '"' && lastCharBeforeEnd !== '\\') {
      inString = !inString;
    }
    lastCharBeforeEnd = ch;
  }
  if (inString) {
    repaired += '"';
  }

  // 2. 去掉尾部不完整的 key-value（如 "key": 或 "key":  "val 截断）
  //    找到最后一个完整的 value 结束位置
  repaired = repaired.replace(/,\s*"[^"]*"\s*:\s*("[^"]*)?$/s, '');
  repaired = repaired.replace(/,\s*$/s, '');

  // 3. 补全未闭合的 [] 和 {}
  const stack: string[] = [];
  let inStr = false;
  let escape = false;
  for (const ch of repaired) {
    if (escape) { escape = false; continue; }
    if (ch === '\\' && inStr) { escape = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === '{') stack.push('}');
    else if (ch === '[') stack.push(']');
    else if (ch === '}' || ch === ']') {
      if (stack.length > 0 && stack[stack.length - 1] === ch) stack.pop();
    }
  }

  // 按倒序关闭未闭合的括号
  while (stack.length > 0) {
    repaired += stack.pop();
  }

  return repaired;
};

const callAI = async (
  systemPrompt: string,
  userPrompt: string,
  responseSchema?: Schema,
  options: { temperature?: number } = {}
): Promise<string> => {
  const fullConfig = getFullApiConfig();
  const isGoogle = fullConfig.provider === 'google';

  // 非 Google 提供商：使用 OpenAI 兼容接口
  if (!isGoogle && fullConfig.baseUrl) {
    // 如果有 JSON schema 要求，在 prompt 中追加 JSON 格式说明 + Schema 结构
    let enhancedSystemPrompt = systemPrompt;
    if (responseSchema) {
      const schemaDesc = schemaToJsonExample(responseSchema);
      enhancedSystemPrompt += `\n\nIMPORTANT: You MUST respond with valid JSON only. No extra text, no markdown code fences, just pure JSON.\n\nRequired JSON structure:\n${schemaDesc}`;
    }

    return callOpenAICompatible(
      fullConfig.baseUrl,
      fullConfig.apiKey,
      fullConfig.modelName,
      enhancedSystemPrompt,
      userPrompt,
      {
        temperature: options.temperature,
        jsonMode: !!responseSchema
      }
    );
  }

  // Google 提供商：使用原生 SDK（支持 structured output / JSON schema）
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
    model: fullConfig.modelName || 'gemini-3-flash-preview',
    config,
    contents: [
      { role: 'user', parts: [{ text: systemPrompt + "\n\n" + userPrompt }] }
    ]
  });

  const text = response.text || "";
  return responseSchema ? cleanJsonResponse(text) : text;
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
        },
        thinkingExpansion: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: "3-4 concrete thinking angles in Chinese for this dimension"
        }
      },
      required: ['id', 'dimension', 'socraticQuestion', 'hint', 'keywords', 'thinkingExpansion']
    }
  };

  const systemPrompt = "You are a CET-4/6 writing coach. Help Chinese students brainstorm. You MUST write the socraticQuestion, hint, and thinkingExpansion fields in Chinese (中文), so that students can easily understand. The dimension field should remain in English.";
  const userPrompt = `Generate 3 distinct inspiration cards for the essay topic: "${topic}". Each card should represent a different perspective (e.g., Economic, Social, Personal). 

IMPORTANT:
- The "socraticQuestion" and "hint" fields MUST be written in Chinese (中文) to help students understand.
- The "thinkingExpansion" field MUST be an array of 3-4 strings in Chinese (中文). Each string is a concrete thinking angle or argument point for this dimension. These help students who have shallow initial ideas by giving them specific sub-points to develop.

Example for topic "科技对教育的影响" with dimension "Economic":
"thinkingExpansion": [
  "在线教育平台降低了学习成本，让偏远地区学生也能获得优质资源",
  "教育科技产业本身创造了大量就业岗位和经济价值",
  "技术培训提升了劳动力素质，间接推动经济增长",
  "数字鸿沟可能加剧教育不平等，影响社会经济流动性"
]

Each point should be a complete、specific argument (not vague), 15-30 Chinese characters, helping students think deeper about this dimension.`;

  const res = await callAI(systemPrompt, userPrompt, schema);
  return safeJsonParse(res, 'fetchInspirationCards');
};

export const validateIdea = async (topic: string, dimension: string, idea: string): Promise<IdeaValidationResult> => {
  const schema: Schema = {
    type: Type.OBJECT,
    properties: {
      status: { type: Type.STRING, enum: ['exceptional', 'valid', 'weak', 'off_topic'] },
      feedbackTitle: { type: Type.STRING },
      analysis: { type: Type.STRING },
      thinkingExpansion: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: "3-4 personalized thinking angles based on the student's specific idea, in Chinese"
      }
    },
    required: ['status', 'feedbackTitle', 'analysis', 'thinkingExpansion']
  };

  const systemPrompt = "You are a strict but helpful writing coach. Evaluate the student's idea relevance. You MUST write the feedbackTitle, analysis, and thinkingExpansion fields in Chinese (中文), so that students can easily understand your feedback.";
  const userPrompt = `Topic: ${topic}\nDimension: ${dimension}\nStudent Idea: ${idea}\nProvide feedback. IMPORTANT: The "feedbackTitle" and "analysis" fields MUST be written in Chinese (中文).

CRITICAL: You must also generate "thinkingExpansion" — an array of 3-4 strings in Chinese (中文). These are PERSONALIZED thinking angles that help the student DEEPEN their specific idea. 

Rules for thinkingExpansion:
- Read the student's idea carefully. Identify the core angle they chose.
- Generate 3-4 sub-points that EXTEND and DEEPEN that specific angle (not generic dimension-level points).
- Each point should be a concrete, specific argument (15-30 Chinese characters).
- If the student's idea is about "数据泄露对企业的影响", the expansion should be about SPECIFIC types of enterprise impact (direct losses, legal penalties, reputation damage), NOT about general economic angles.
- If the student's idea is weak or off-topic, provide angles that could help them find a better direction within this dimension.

Example: 
Student Idea: "数据泄露会对企业造成巨大经济损失"
Good thinkingExpansion: [
  "直接损失：数据恢复成本、系统停机期间的营收损失",
  "法律风险：违反GDPR等数据保护法规可能面临巨额罚款",
  "品牌信任危机：客户流失导致长期收入下降",
  "连锁反应：投资者信心动摇，股价下跌，融资困难"
]
Bad thinkingExpansion (too generic): [
  "信息安全产业创造就业机会",
  "网络安全投入保障基础设施"
]`;

  const res = await callAI(systemPrompt, userPrompt, schema);
  return safeJsonParse(res, 'validateIdea');
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
            usage: { type: Type.STRING },
            usageChinese: { type: Type.STRING }
          },
          required: ['word', 'chinese', 'englishDefinition', 'usage', 'usageChinese']
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

  const systemPrompt = "You are a CET-4/6 writing coach helping Chinese students. Provide vocabulary and sentence frames to help the student expand their idea.";
  const userPrompt = `Topic: ${topic}\nDimension: ${dimension}\nStudent Idea: ${userIdea}\nGenerate scaffolds.

IMPORTANT for the "vocabulary" field: 
- Each vocabulary item must include "usageChinese" (the Chinese translation of the usage example sentence).
- Example format:
  {
    "word": "data leakage",
    "chinese": "数据泄露",
    "englishDefinition": "When training data accidentally contains information from test data",
    "usage": "Avoid data leakage by separating training and test datasets properly.",
    "usageChinese": "通过适当分离训练集和测试集来避免数据泄露。"
  }

IMPORTANT for the "frames" field: Generate 3 sentence frames. Each frame must include:
- "patternName": the English sentence pattern name (e.g., "Not only...but also...")
- "patternNameZh": Chinese translation of the pattern (e.g., "不仅……而且还……")
- "template": a sentence template where blanks are marked by brackets containing CHINESE hints.
- "modelSentence": a complete, well-written reference sentence that fills all the blanks perfectly.

CRITICAL RULE for "template": The text inside square brackets [] MUST be in Chinese (中文), NOT English. These hints tell the student what concept to express in each blank.

CORRECT example: "Not only do these activities [培养什么能力], but they also equip students with [什么样的技能] necessary to [达成什么目标]."
WRONG example: "Not only do these activities [what ability to cultivate], but they also equip students with [what kind of skills] necessary to [what goal to achieve]."

The hints MUST be short Chinese phrases (2-6 Chinese characters) describing what to fill in.`;

  const res = await callAI(systemPrompt, userPrompt, schema);
  return safeJsonParse(res, 'fetchScaffolds');
};

export const fetchDimensionKeywords = async (dimension: string, topic?: string): Promise<{ en: string, zh: string }[]> => {
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
  return safeJsonParse(res, 'fetchDimensionKeywords');
};

export const validateSentence = async (sentence: string, topic: string): Promise<{ isValid: boolean, feedback: string, suggestion: string }> => {
  const schema: Schema = {
    type: Type.OBJECT,
    properties: {
      isValid: { type: Type.BOOLEAN },
      feedback: { type: Type.STRING },
      suggestion: { type: Type.STRING }
    },
    required: ['isValid', 'feedback', 'suggestion']
  };

  const systemPrompt = "You are a CET-4/6 writing coach helping Chinese students. Evaluate the student's sentence completion. You MUST write feedback and suggestion in Chinese (中文).";
  const userPrompt = `Topic: "${topic}"\nStudent's sentence: "${sentence}"\n\nEvaluate this sentence and provide:\n- "isValid": true if the sentence is grammatically correct and makes sense, false otherwise.\n- "feedback": 用中文给出具体反馈，指出语法是否正确、表达是否地道、内容是否切题。如果有错误，明确指出哪里有问题。(2-3句话)\n- "suggestion": 用中文给出一条改进建议，告诉学生如何让表达更好。如果已经很好，给出一个更高级的替代表达。(1句话)`;

  const res = await callAI(systemPrompt, userPrompt, schema);
  return safeJsonParse(res, 'validateSentence');
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

  const systemPrompt = `You are a CET-4/6 writing coach. Generate SHORT collocations (word combinations), NOT full sentences.

**CRITICAL RULES:**
1. Each collocation must be **2-5 words only** (e.g., "foster social connections", "stimulate economic growth")
2. Do NOT generate full sentences or clauses
3. Focus on verb+noun, adjective+noun, or adverb+verb patterns
4. Each item should be a reusable building block the student can insert into their OWN sentences

**CORRECT examples:** "enhance group cohesion", "promote interpersonal communication", "facilitate cultural exchange"
**WRONG examples (too long):** "Going to the cinema fosters communal engagement, allowing individuals to exchange perspectives" — this is a SENTENCE, not a collocation!

Generate collocations that are useful for academic/CET writing on the given topic.`;
  const userPrompt = `Topic: ${topic}\nStudent's Idea: ${userIdea}\nGenerate 6 more SHORT collocations (2-5 words each). These must be phrase-level word combinations, NOT sentences.`;

  const res = await callAI(systemPrompt, userPrompt, schema);
  return safeJsonParse(res, 'fetchMoreCollocations');
};

export const analyzeDraft = async (topic: string, dimension: string, draft: string, vocabulary: VocabularyItem[]): Promise<DraftFeedback> => {
  const schema: Schema = {
    type: Type.OBJECT,
    properties: {
      score: { type: Type.NUMBER, description: "Score from 0 to 10 (integer). MUST be between 0 and 10." },
      comment: { type: Type.STRING },
      usedVocabulary: { type: Type.ARRAY, items: { type: Type.STRING } },
      suggestions: { type: Type.ARRAY, items: { type: Type.STRING } },
      polishedVersion: { type: Type.STRING }
    },
    required: ['score', 'comment', 'suggestions', 'polishedVersion']
  };

  const vocabList = vocabulary.map(v => v.word).join(', ');
  const systemPrompt = `You are a **warm and supportive CET-4/6 writing coach** helping Chinese students. 

**Scoring Philosophy:**
- Be **accurate but encouraging**: always acknowledge efforts before pointing out issues
- Use the **full scoring range** — do NOT default to 5-6 for everything
- Follow the rubric below STRICTLY

**10-Point Scoring Rubric:**

| Score | Standard |
|-------|----------|
| **9-10** | Near-native expression, uses target vocabulary naturally and accurately, clear logic, sophisticated sentence structures, minor or no errors |
| **7-8** | Clear ideas with good structure, uses some target vocabulary correctly, has a few grammatical errors but meaning is clear, shows attempt at complex sentences |
| **5-6** | Basic and readable, limited vocabulary usage, several grammatical errors, ideas are simple but on-topic |
| **3-4** | Partially understandable, major grammar issues, barely uses target vocabulary, ideas are underdeveloped |
| **1-2** | Mostly unintelligible, severe errors, no vocabulary integration |

**Score Modifiers (apply AFTER base score):**
- Uses 3+ target vocabulary words correctly → **+1 point**
- Attempts complex sentence structures (even if imperfect) → **+0.5 point**
- Includes specific examples or data → **+0.5 point**
- Uses appropriate transition words → **+0.5 point**
- Has spelling errors that are "near misses" → **minimal deduction**

**IMPORTANT:** A draft that is well-structured, uses target vocabulary, and has only minor errors MUST score 7 or above. DO NOT give 6 to a clearly competent piece of writing.

You MUST write the comment and suggestions fields in Chinese (中文) to help students understand your feedback. The polishedVersion field should remain in English as it is a model English paragraph.`;
  const userPrompt = `Topic: ${topic}\nDimension: ${dimension}\nDraft: "${draft}"\nTarget Vocab: ${vocabList}\nAnalyze the draft.\n\nSCORING RULE: The "score" field MUST be an integer from 0 to 10. Follow the rubric in your instructions. A well-written draft with target vocabulary and clear structure should score 7-8+.\n\nIMPORTANT: The "comment" field MUST be in Chinese (中文), using the "sandwich" structure: praise → areas for improvement → encouragement. The "suggestions" array MUST contain Chinese suggestions (中文建议) telling the student how to improve. The "polishedVersion" should be a polished English paragraph.`;

  const res = await callAI(systemPrompt, userPrompt, schema);
  return safeJsonParse(res, 'analyzeDraft');
};

// --- Essay Assembly: Generate Introduction and Conclusion ---

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
  return safeJsonParse(res, 'generateIntroConclusion');
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
        description: "EXHAUSTIVE list of ALL issues found in the essay. You MUST identify EVERY error, awkward expression, and improvement opportunity — do NOT skip or summarize. Aim for at least 8-15 critique items for a typical 150-word essay. Cover ALL four categories.",
        items: {
          type: Type.OBJECT,
          properties: {
            original: { type: Type.STRING, description: "The EXACT English text snippet from the student's essay. Do NOT translate. Do NOT summarize." },
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
        description: "Generate 5-8 contrast points covering all 4 categories (at least 1 per category). Each polishedContent MUST be an EXACT excerpt (copy-paste) from polishedEssay.",
        items: {
          type: Type.OBJECT,
          properties: {
            category: { type: Type.STRING, enum: ['Language Foundation', 'Logical Reasoning', 'Strategic Intent', 'Rhetorical Structure'] },
            userContent: { type: Type.STRING, description: "The EXACT problematic text from the student's essay (copy-paste, do NOT paraphrase)." },
            polishedContent: { type: Type.STRING, description: "The EXACT corresponding improved text from polishedEssay (must be copy-pasted from polishedEssay, character-for-character identical)." },
            analysis: { type: Type.STRING, description: "In CHINESE. Must follow 3-part structure: (1) 问题诊断：具体指出学生表达的语言学/逻辑/策略层面缺陷 (2) 高手技法：命名并解释范文使用的具体写作技巧（如'名词化升级'、'让步-转折逻辑链'、'因果归因策略'等），引用范文原文示例 (3) 学生行动指南：给出可复制的改写公式或模板，让学生能在下一篇作文中立即运用" }
          },
          required: ['category', 'userContent', 'polishedContent', 'analysis']
        }
      },
      polishedEssay: { type: Type.STRING, description: "A Band 14-15 model essay rewriting the student's essay. IMPORTANT: You MUST wrap the text that corresponds to each contrastiveLearning point with <highlight id='N'>...</highlight> tags, where N is the 0-based index of the contrastiveLearning item. Use section tags [INTRODUCTION], [BODY_PARA_1], [BODY_PARA_2], [CONCLUSION] to structure the essay." }
    },
    required: ['totalScore', 'subScores', 'generalComment', 'issueOverview', 'critiques', 'contrastiveLearning', 'polishedEssay']
  };

  const step1SystemPrompt = `You are a **warm and supportive writing mentor**, not a cold scoring machine. Your mission is to balance three goals:
1. **Accurately assess** the essay's true level (this is the foundation)
2. **Protect the student's motivation** to write (this is your使命)
3. **Provide constructive guidance** for improvement (this is your value)

【Grading Philosophy】
- Be **firm but not harsh**: always acknowledge efforts before pointing out issues
- Be **accurate but not discouraging**: when in doubt between two score bands, choose the higher one but clearly explain how to reach the next level
- Follow the **"sandwich principle"**: strengths + areas for improvement + actionable advice

---

## 【Core Tolerance Rules】

### 1. Task Fulfillment (Topic Relevance)
| Situation | Handling |
|-----------|----------|
| Completely off-topic (e.g., writing about "online shopping" for a "time management" prompt) | **4-6 points (Band 5)** |
| Partially off-topic (e.g., only discusses "starting a business" but not "working for a company" in a comparison prompt) | **7 points allowed (Band 5 upper limit / Band 8 lower limit)** |
| Topic-related but narrowly interpreted (e.g., defines "well-rounded person" only as "being a good listener") | **7-8 points allowed, with guidance to broaden perspective** |

### 2. Language Errors (Leniency Rules)
| Error Type | Handling |
|------------|----------|
| ≥5 serious errors BUT **student clearly tried to express complete ideas** | Can give **6-7 points** (Band 5 upper limit / Band 8 lower limit), with encouraging error feedback |
| ≥5 serious errors AND **sentences are fragmented/unintelligible** | Give **4-5 points** (Band 5) |
| Attempted complex sentences (even if failed) | **+0.5 to language score** |
| Spelling errors that are **visually close to correct** (e.g., daliy→daily, konwn→know) | **Point them out gently, minimal deduction** |

### 3. Content Development
| Situation | Handling |
|-----------|----------|
| Any attempt to give examples (even if simple/childish) | **Content score base ≥1.5 points** |
| Any original opinion (not just memorized template phrases) | **Content score base ≥1.5 points** |
| Meets minimum word count (120 for CET-4, 150 for CET-6) | **+0.5 to language score** |
| Shows improvement from previous feedback | **Highlight and praise in comments** |

---

## 【Five-Step Grading Process (Student-Friendly Version)】

**Step 1: Topic Relevance Check**
- Is the essay completely off-topic? → If yes, Band 5
- Is it partially relevant? → Allow Band 8 lower limit (7 points)
- Does it show understanding of the prompt? → **Acknowledge this effort**

**Step 2: Language Error Scan**
- Count serious errors, but **distinguish between error types**
- Did the student attempt complex structures? → **Give credit for trying**
- Are most errors "near misses" (daliy) or "conceptual failures"? → **Be lenient with near misses**

**Step 3: Content Development Check**
- Look for **"effort traces"**: examples, personal opinions, adequate length
- If any effort trace exists → **Content score ≥1.5**

**Step 4: Structure and Logic Check**
- Is there a basic intro-body-conclusion framework? → **Don't penalize imperfect transitions**
- Are there clear paragraph divisions? → **Recognize structural awareness**

**Step 5: Final Scoring**
- When between two bands, **choose the higher one** but clearly explain how to reach the next level
- Ensure final score matches the band description (Band 8 = 7-9, Band 11 = 10-12)

---

## 【Four-Dimension Scoring Criteria (Balanced Edition)】

### 1. Content & Critical Thinking (0-4 points)

| Score | Standard |
|-------|----------|
| **4** | Original insights, multiple layers of argument, well-developed points with examples and explanations |
| **3** | Clear ideas, basic explanations, attempts to give examples (even if simple) |
| **2** | Ideas are relevant but only stated as slogans, no development |
| **1** | At least one point related to the topic is made |
| **0** | Completely off-topic or no meaningful content |

**Special Rules:**
- Any attempt at examples → **+0.5 to content score**
- Any original personal opinion → **content score base ≥1.5**
- Shows understanding of the prompt → **acknowledge in comments**

---

### 2. Organization & Logic (0-4 points)

| Score | Standard |
|-------|----------|
| **4** | Sophisticated structure, smooth transitions, logical progression, powerful conclusion |
| **3** | Clear structure, reasonable paragraphing, mostly coherent |
| **2** | Basic intro-body-conclusion framework exists, but transitions are awkward and logic is loose |
| **1** | Attempts to organize but structure is confusing |
| **0** | No recognizable structure |

**Special Rules:**
- Any attempt at paragraph division → **recognize this effort**
- If conclusion is generic but present → **minimal deduction**
- If transition words are misused (e.g., "On the one hand... On the other hand" for listing) → **point out but don't over-penalize**

---

### 3. Language Proficiency (0-4 points)

**First, count serious errors:**

| Serious Errors | Score Range |
|----------------|-------------|
| 0 | 3.5-4 |
| 1-2 | 3-3.5 |
| 3-4 | 2-2.5 |
| 5-6 | 1-1.5 |
| ≥7 | 0-1 |

**Then apply modifiers:**

| Positive Effort | Score Bonus |
|-----------------|-------------|
| Attempted complex sentences (even if flawed) | +0.5 |
| Met minimum word count | +0.5 |
| Spelling errors are "near misses" | Minimal deduction |
| Shows improvement from previous work | +0.5 (and special praise) |

**Types of Serious Errors to Identify:**
- Subject-verb disagreement: "Learning... assist us" → should be "assists"
- Missing verb: "online shopping instead of..." → needs a verb
- Verb stacking: "is create" / "will starting"
- Sentence fragments: "Completing your plan step by step." (no subject)
- Basic vocabulary misspelled: daliy, konwn, benificial

---

### 4. Clarity & Communication (0-4 points)

| Score | Standard |
|-------|----------|
| **4** | Reader understands all ideas and details effortlessly |
| **3** | Reader grasps main ideas clearly, minor details may need inference |
| **2** | Main ideas are recognizable, but many details are lost |
| **1** | Reader can only guess the general topic |
| **0** | Completely unintelligible |

**Special Rules:**
- If student completed the full essay → **recognize this effort**
- If there are 1-2 completely incomprehensible sentences → **clarity score ≤2, but praise completion**
- If the essay is off-topic but well-written → **clarity can be high, but content score is low**

---

## 【Feedback Template (Mandatory "Sandwich" Structure)】
【Strengths to Celebrate】

Point 1: (specific, genuine praise)

Point 2: (specific, genuine praise)

【Areas to Grow】

Point 1: (most critical issue, phrased as "It would be even better if...")

Point 2: (second most critical issue, if needed)

【Actionable Next Steps】

One concrete example of how to improve (show, don't just tell)

One simple practice suggestion for next time

【Encouraging Closing】

"You're doing great! Keep practicing and you'll see even more progress."

---

## 【Band Determination Guidelines (Lenient Edition)】

| Situation | Recommended Handling |
|-----------|---------------------|
| Borderline between Band 5 and Band 8 (5 serious errors but clear effort) | **Give 7 points (Band 8 lower limit)** and encourage in comments |
| Borderline between Band 8 and Band 11 (ideas are solid but language has errors) | **Give 9 points (Band 8 upper limit)** and explain how to reach Band 11 |
| Borderline between Band 11 and Band 14 (great ideas, minor language mistakes) | **Give 12 points (Band 11 upper limit)** and praise content quality |

**Golden Rule:** When uncertain between two bands, **choose the higher one but clearly articulate the path to the next level.**

> Example comment: "Your essay is right between Band 8 and Band 11. I'm giving you the higher end (9 points) because your ideas are clear and you attempted examples. If you check your spelling next time, you'll consistently be in Band 11!"

---

## 【Special Encouragement Rules】

1. **If the student wrote something** → acknowledge the effort of completing the task
2. **If the student attempted examples** → praise this attempt specifically
3. **If the student used any transition words** → recognize structural awareness
4. **If the student met the word count** → mention this as a strength
5. **If the student has a clear personal opinion** → celebrate this authentic voice
6. **If this is a revision showing improvement** → highlight the progress explicitly

---

## 【Summary: Your Mindset as a Mentor】

You are not just assigning a score—you are **guiding a learner on their writing journey**. Your feedback should leave the student feeling:

- Seen (their effort is recognized)
- Encouraged (they can improve)
- Guided (they know what to do next)

Every score must be accompanied by a warm, specific, and actionable comment that makes the student want to write again.

---

## 【Official CET-4/6 Scoring Bands (For Reference)】

| Band | Score Range | Description |
|------|-------------|-------------|
| **Band 14** | 13-15 | Fully relevant, clear ideas, logical, well-developed, almost no language errors |
| **Band 11** | 10-12 | Relevant, clear ideas, coherent, a few language errors not affecting understanding |
| **Band 8** | 7-9 | Basically relevant, somewhat clear ideas, barely coherent, many language errors |
| **Band 5** | 4-6 | Somewhat relevant but unclear, vague ideas, poor coherence, many serious errors |
| **Band 2** | 1-3 | Mostly irrelevant, chaotic thinking, broken language |
| **Band 0** | 0 | Blank, completely off-topic, or only isolated words |

---

## 【CRITICAL: Exhaustive Critique Requirement】

The \`critiques\` array must be **EXHAUSTIVE**. You must:
1. Go through the essay **sentence by sentence** and identify EVERY issue
2. Include ALL grammar errors, vocabulary misuses, awkward expressions, logic gaps, and content weaknesses
3. Generate **at least 8 critique items** for a typical 150-word essay
4. Cover **all 4 categories** (Content, Organization, Proficiency, Clarity) — do not over-focus on just one category
5. Even minor issues (spelling, punctuation, word choice) should be included with severity "minor"
6. Do NOT summarize multiple errors into one critique — each error gets its own entry
7. The \`original\` field must be the EXACT text from the student's essay (copy-paste, do not paraphrase)

---

## 【CRITICAL: Contrastive Learning & Polished Essay Integration】

The \`contrastiveLearning\` and \`polishedEssay\` fields must work TOGETHER for an interactive UI:

### polishedEssay Requirements:
1. Structure with section tags: \`[INTRODUCTION]\`, \`[BODY_PARA_1]\`, \`[BODY_PARA_2]\`, \`[CONCLUSION]\`
2. **MUST embed** \`<highlight id='N'>...text...</highlight>\` tags at positions corresponding to each \`contrastiveLearning\` point (N = 0-based index)
3. Example: If contrastiveLearning[0].polishedContent is "Furthermore, the proliferation of...", then polishedEssay must contain: \`<highlight id='0'>Furthermore, the proliferation of...</highlight>\`

### contrastiveLearning Requirements:
1. Generate **5-8 points** across all **4 categories** (at least 1 per category)
2. \`polishedContent\` must be the EXACT text inside the corresponding \`<highlight>\` tag in polishedEssay (character-for-character match)
3. \`userContent\` must be the EXACT text from the student's essay (copy-paste)
4. \`analysis\` must follow this 3-part Chinese structure:
   - **【问题诊断】** 用具体的语言学/逻辑/修辞学术语指出学生表达的核心缺陷（不要说"表达不够好"这种空话）
   - **【高手技法】** 命名范文使用的具体技巧（如"名词化升级"、"让步-转折逻辑链"、"因果归因策略"、"钩子式开篇"、"数据论证法"等），并引用范文原文解释
   - **【行动指南】** 给出可复制的改写公式（如"想说X时，可以用: Y structure + Z vocabulary"），让学生在下次写作中能直接套用

### 4 Categories Explained (You MUST cover all 4):

**1. Language Foundation (语言地基)**: Word-level and grammar-level upgrades. E.g., replacing informal words with academic alternatives, fixing grammatical errors, upgrading simple sentences to complex/compound ones.

**2. Logical Reasoning (逻辑链条)**: Sentence-to-sentence logical connections. E.g., using concession-rebuttal (Admittedly...However...), cause-effect chains, comparison-contrast structures.

**3. Strategic Intent (写作意图)**: Rhetorical purpose at the discourse level. E.g., using hedging language for academic tone, employing stance markers to signal the writer's position.

**4. Rhetorical Structure (篇章技法)**: Paragraph-level and essay-level writing strategies. This is MANDATORY. Examples:
   - **Introduction**: How the model essay opens — is it a hook (provocative question, striking statistic, vivid scenario)? How does it funnel from general to specific? How does it present the thesis statement?
   - **Body paragraphs**: How arguments are structured — topic sentence → supporting evidence (data, examples, expert quotes) → analysis → linking sentence. How does the model essay strengthen persuasiveness through concrete evidence?
   - **Conclusion**: How the model essay closes — does it restate the thesis in new words? Does it broaden the perspective? Does it end with a call to action or thought-provoking statement?
   - Compare the student's structural approach vs. the model's and explain the strategic advantage

**Your warm, encouraging tone applies to generalComment and issueOverview. But the critiques array must be THOROUGH and COMPLETE — this is the student's primary learning tool.**

---`;
  const step1UserPrompt = `Topic: ${topic || 'General Essay'}\nEssay: "${essayText}"`;

  const step1Json = await callAI(step1SystemPrompt, step1UserPrompt, step1Schema, { temperature: 0.1 });

  let step1Data: any;
  try {
    step1Data = JSON.parse(step1Json);
  } catch (parseError) {
    console.error('Step 1 JSON parse failed. Raw response:', step1Json.substring(0, 500));
    throw new Error('AI 返回的评分数据格式异常，请重试。如果使用自定义 API，请确认模型支持 JSON 输出。');
  }

  // 数据校验：确保关键字段存在，提供默认值
  step1Data.totalScore = typeof step1Data.totalScore === 'number' ? step1Data.totalScore : 0;
  step1Data.subScores = step1Data.subScores || { content: 0, organization: 0, proficiency: 0, clarity: 0 };
  step1Data.generalComment = step1Data.generalComment || '暂无评语';
  step1Data.issueOverview = step1Data.issueOverview || { critical: [], general: [], minor: [] };
  step1Data.critiques = Array.isArray(step1Data.critiques) ? step1Data.critiques : [];
  step1Data.contrastiveLearning = Array.isArray(step1Data.contrastiveLearning) ? step1Data.contrastiveLearning : [];
  step1Data.polishedEssay = step1Data.polishedEssay || essayText;

  // 分数规范化：仅做边界与求和校验，不做人为抬分/模板重写
  const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
  const roundHalf = (v: number) => Math.round(v * 2) / 2;
  const c = roundHalf(clamp(Number(step1Data.subScores.content || 0), 0, 4));
  const o = roundHalf(clamp(Number(step1Data.subScores.organization || 0), 0, 3));
  const p = roundHalf(clamp(Number(step1Data.subScores.proficiency || 0), 0, 5));
  const cl = roundHalf(clamp(Number(step1Data.subScores.clarity || 0), 0, 3));
  step1Data.subScores = { content: c, organization: o, proficiency: p, clarity: cl };
  step1Data.totalScore = roundHalf(c + o + p + cl);

  // 轻度校准：与主流评阅模型普遍偏差约1分时，对中高段作文做 +1 温和补偿
  // 规则：仅在可读且非重灾情况下触发；总分最高不超过15
  const criticalCount = Array.isArray(step1Data.issueOverview?.critical) ? step1Data.issueOverview.critical.length : 0;
  if (step1Data.totalScore >= 6 && step1Data.totalScore <= 14 && criticalCount <= 2) {
    let bonus = 1.0;
    const dims = ['content', 'organization', 'proficiency', 'clarity'] as const;
    const max: Record<(typeof dims)[number], number> = { content: 4, organization: 3, proficiency: 5, clarity: 3 };
    const order = [...dims].sort((a, b) => {
      const roomA = max[a] - step1Data.subScores[a];
      const roomB = max[b] - step1Data.subScores[b];
      if (roomB !== roomA) return roomB - roomA;
      return step1Data.subScores[a] - step1Data.subScores[b];
    });

    for (const d of order) {
      if (bonus <= 0) break;
      const room = roundHalf(max[d] - step1Data.subScores[d]);
      const add = Math.min(room, bonus, 0.5);
      if (add > 0) {
        step1Data.subScores[d] = roundHalf(step1Data.subScores[d] + add);
        bonus = roundHalf(bonus - add);
      }
    }
    if (bonus > 0) {
      for (const d of order) {
        if (bonus <= 0) break;
        const room = roundHalf(max[d] - step1Data.subScores[d]);
        const add = Math.min(room, bonus, 0.5);
        if (add > 0) {
          step1Data.subScores[d] = roundHalf(step1Data.subScores[d] + add);
          bonus = roundHalf(bonus - add);
        }
      }
    }

    step1Data.totalScore = roundHalf(
      step1Data.subScores.content +
      step1Data.subScores.organization +
      step1Data.subScores.proficiency +
      step1Data.subScores.clarity
    );
  }

  // Prepare context for Step 2
  const contrastiveContext = step1Data.contrastiveLearning
    .map((c: ContrastivePoint, i: number) => `Point ${i + 1} (${c.category || 'General'}): User wrote "${c.userContent || ''}" -> Polished to "${c.polishedContent || ''}". Analysis: ${c.analysis || ''}`)
    .join('\n');
  const polishedWordsContext = (step1Data.polishedEssay || '').substring(0, 1000);

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

  let step2Data: any;
  try {
    step2Data = JSON.parse(step2Json);
  } catch (parseError) {
    console.error('Step 2 JSON parse failed. Raw response:', step2Json.substring(0, 500));
    // Step 2 失败不应阻断整个批改流程，返回空的 retraining
    step2Data = { retraining: { exercises: [], materials: [] } };
  }

  // 确保 retraining 结构完整
  const retraining = step2Data.retraining || { exercises: [], materials: [] };
  retraining.exercises = Array.isArray(retraining.exercises) ? retraining.exercises : [];
  retraining.materials = Array.isArray(retraining.materials) ? retraining.materials : [];

  // 6. Merge and Return
  return { ...step1Data, retraining };
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
  return safeJsonParse(res, 'fetchDrillItems');
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
  return safeJsonParse(res, 'evaluateRetrainingAttempt');
};