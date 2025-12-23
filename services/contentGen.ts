
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { StudyItem, AnalysisResult, DailyQuoteItem, PracticeExercise } from "../types";
import { getLocalContent } from "./localRepository";

// 更换为更经济的 Flash-Lite 系列模型
const GENERAL_MODEL_NAME = "gemini-flash-lite-latest"; // 基础任务与翻译
const SPEECH_MODEL_NAME = "gemini-2.5-flash-preview-tts"; // TTS 专用模型 (不可更换为 Lite)
const CONVERSATION_MODEL_NAME = "gemini-flash-lite-latest"; // 英语对话逻辑分析
const PRACTICE_MODEL_NAME = "gemini-flash-lite-latest"; // JSON 练习题生成

const DEEPSEEK_API_KEY = (process.env.DEEPSEEK_API_KEY) || ""; 
const DEEPSEEK_BASE_URL = "https://api.deepseek.com/chat/completions";

function getGeminiClient() {
  const apiKey = process.env.API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({ apiKey });
}

/**
 * 后置处理：防止 AI 抽风将多个选项合并成一个字符串
 */
function sanitizeExercises(exercises: any[]): PracticeExercise[] {
    return exercises.map(ex => {
        let options: string[] = [];
        if (Array.isArray(ex.options)) {
            ex.options.forEach((opt: string) => {
                if (typeof opt === 'string' && opt.includes(',') && opt.split(',').length >= 2) {
                    const parts = opt.split(',').map(s => s.trim()).filter(s => s.length > 0);
                    options.push(...parts);
                } else {
                    options.push(opt);
                }
            });
        }
        
        const finalOptions = Array.from(new Set([...options, ...(ex.correctAnswers || [])]));
        
        return {
            ...ex,
            options: finalOptions
        } as PracticeExercise;
    });
}

/**
 * 核心逻辑：优先调用 Google Gemini (Lite 系列以节省成本)，DeepSeek 作为备选
 */
export async function generatePracticeExercises(items: StudyItem[]): Promise<PracticeExercise[]> {
  let rawExercises: any[] = [];
  
  try {
    const client = getGeminiClient();
    if (client) {
        rawExercises = await generatePracticeExercisesWithGemini(items);
        if (rawExercises && rawExercises.length > 0) {
            console.log(`成功调用 Google Gemini (${PRACTICE_MODEL_NAME}) - 生成练习`);
            return sanitizeExercises(rawExercises);
        }
    }
  } catch (e) {
    console.warn("Google Gemini 失败，正在切换至备选方案 DeepSeek...", e);
  }

  if (DEEPSEEK_API_KEY && DEEPSEEK_API_KEY.length > 5) {
    try {
        rawExercises = await generatePracticeExercisesWithDeepSeek(items);
        console.log("成功调用 DeepSeek API - 生成练习 (备选)");
    } catch (e) {
        console.error("所有 API 均已失败", e);
    }
  }
  
  return sanitizeExercises(rawExercises);
}

async function generatePracticeExercisesWithDeepSeek(items: StudyItem[]): Promise<PracticeExercise[]> {
  const wordGroups: {text: string, meaning: string}[][] = [];
  for (let i = 0; i < items.length; i += 3) {
    wordGroups.push(items.slice(i, i + 3).map(it => ({
        text: it.text,
        meaning: it.translation
    })));
  }

  if (wordGroups.length === 0) return [];

  const prompt = `You are an expert English Professor. Create vocabulary exercises for these groups: ${JSON.stringify(wordGroups)}.
  
  CRITICAL RULES:
  1. STICK TO THE MEANING: You MUST create the sentence based on the provided "meaning".
  2. FLAT OPTIONS ARRAY: The "options" field MUST be a flat array of INDIVIDUAL strings. 
  
  Output JSON format: {"exercises": [...]}`;

  const response = await fetch(DEEPSEEK_BASE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${DEEPSEEK_API_KEY.trim()}`
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages: [
        { role: "system", content: "You are a professional English tutor that only outputs JSON." },
        { role: "user", content: prompt }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.6
    })
  });

  if (!response.ok) throw new Error(`DeepSeek Error: ${response.status}`);
  const data = await response.json();
  const parsed = JSON.parse(data.choices?.[0]?.message?.content || "{}");
  return parsed.exercises || [];
}

async function generatePracticeExercisesWithGemini(items: StudyItem[]): Promise<any[]> {
  const ai = getGeminiClient();
  if (!ai) return [];

  const wordGroups: string[] = [];
  for (let i = 0; i < items.length; i += 3) {
    const group = items.slice(i, i + 3).map(it => `${it.text}(Meaning: ${it.translation})`).join(", ");
    wordGroups.push(group);
  }

  const prompt = `Create English exercises for: ${JSON.stringify(wordGroups)}. 
  STRICT RULE: The "options" field MUST be an array of SINGLE strings. 
  Return JSON array with targetWords, sentence, sentenceZh, quizQuestion, options(at least 6 individual strings), correctAnswers, explanation.`;

  try {
    const response = await ai.models.generateContent({
      model: PRACTICE_MODEL_NAME,
      contents: prompt,
      config: {
        temperature: 0.7,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              targetWords: { type: Type.ARRAY, items: { type: Type.STRING } },
              sentence: { type: Type.STRING },
              sentenceZh: { type: Type.STRING },
              quizQuestion: { type: Type.STRING },
              options: { type: Type.ARRAY, items: { type: Type.STRING } },
              correctAnswers: { type: Type.ARRAY, items: { type: Type.STRING } },
              explanation: { type: Type.STRING }
            }
          }
        } 
      }
    });
    return JSON.parse(response.text || "[]");
  } catch (e) {
    console.error("Gemini Content Gen Error:", e);
    return [];
  }
}

export async function analyzeAudioResponse(audioBase64: string, currentTopic: string, history: {user: string, ai: string}[]): Promise<AnalysisResult> {
  const ai = getGeminiClient();
  if (!ai) throw new Error("Key missing");
  
  const prompt = `Analyze user's audio response. Topic: ${currentTopic}. History: ${JSON.stringify(history)}. 
  Evaluate pronunciation, grammar, and provide a better version. Output JSON.`;

  const response = await ai.models.generateContent({
    model: CONVERSATION_MODEL_NAME,
    contents: [
      { text: prompt }, 
      { inlineData: { mimeType: "audio/webm", data: audioBase64 } }
    ],
    config: { 
      responseMimeType: "application/json",
      temperature: 1.0
    }
  });
  return JSON.parse(response.text.trim());
}

export async function evaluatePronunciation(audioBase64: string, targetText: string): Promise<{ score: number; feedback: string }> {
  const ai = getGeminiClient();
  if (!ai) return { score: 0, feedback: "API Key Missing" };
  
  const response = await ai.models.generateContent({
    model: GENERAL_MODEL_NAME,
    contents: [
      { text: `Evaluate the pronunciation accuracy of the user saying: "${targetText}". Be encouraging.` }, 
      { inlineData: { mimeType: "audio/webm", data: audioBase64 } }
    ],
    config: { 
        responseMimeType: "application/json" 
    }
  });
  return JSON.parse(response.text.trim());
}

export async function generateDailyQuote(): Promise<DailyQuoteItem> {
  const ai = getGeminiClient();
  if (!ai) return { english: "Stay hungry.", chinese: "保持饥渴。", source: "Steve Jobs" };
  
  const response = await ai.models.generateContent({
    model: GENERAL_MODEL_NAME,
    contents: `Generate an inspiring quote about learning or growth in JSON format.`,
    config: { 
      responseMimeType: "application/json",
      temperature: 1.0
    }
  });
  return JSON.parse(response.text.trim());
}

export async function generateSpeech(text: string): Promise<string | null> {
  const ai = getGeminiClient();
  if (!ai) return null;
  try {
    const response = await ai.models.generateContent({
      model: SPEECH_MODEL_NAME,
      contents: [{ parts: [{ text }] }],
      config: { 
        responseModalities: [Modality.AUDIO],
        speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Kore' },
            },
        },
      },
    });
    return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || null;
  } catch (error) {
    console.error("TTS Error:", error);
    return null;
  }
}

export async function generateDailyContent(count: number = 15, currentVocabList: { text: string }[] = []): Promise<StudyItem[]> {
  return getLocalContent(count, new Set(currentVocabList.map(v => v.text)), 'word');
}

export async function generateInitialTopic(): Promise<string> {
    const topics = ["Ordering Bubble Tea", "Returning a package", "Noisy neighbors", "Planning a trip", "Dream job"];
    return topics[Math.floor(Math.random() * topics.length)];
}

export async function generateTopicFromVocab(items: StudyItem[]): Promise<string> {
  const ai = getGeminiClient();
  if (!ai) return generateInitialTopic();
  const response = await ai.models.generateContent({ 
    model: GENERAL_MODEL_NAME, 
    contents: `Based on these English words: ${items.map(i => i.text).join(",")}, generate a short, natural conversation scenario title in English.`,
    config: { temperature: 1.0 }
  });
  return response.text?.trim() || "Daily Conversation";
}
