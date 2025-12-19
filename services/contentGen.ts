
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { StudyItem, AnalysisResult, DailyQuoteItem, PracticeExercise } from "../types";
import { getLocalContent } from "./localRepository";

// 1. Gemini 配置
const GENERAL_MODEL_NAME = "gemini-3-flash-preview";
const SPEECH_MODEL_NAME = "gemini-2.5-flash-preview-tts";

// 2. DeepSeek 配置 (尝试从环境变量获取)
// 兼容不同环境下的变量读取
const DEEPSEEK_API_KEY = (process.env.DEEPSEEK_API_KEY) || ""; 
const DEEPSEEK_BASE_URL = "https://api.deepseek.com/chat/completions";

function getGeminiClient() {
  const apiKey = process.env.API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({ apiKey });
}

/**
 * 每日巩固 - 核心生成函数
 */
export async function generatePracticeExercises(items: StudyItem[]): Promise<PracticeExercise[]> {
  // 如果没有配置 DeepSeek Key，直接使用 Gemini 生成，不再打印警告
  if (!DEEPSEEK_API_KEY || DEEPSEEK_API_KEY.length < 5) {
    return generatePracticeExercisesWithGemini(items);
  }

  const wordGroups: string[][] = [];
  for (let i = 0; i < items.length; i += 3) {
    if (i + 2 < items.length) {
      wordGroups.push(items.slice(i, i + 3).map(it => it.text));
    }
  }

  if (wordGroups.length === 0) return [];

  const prompt = `You are an expert English Professor. Create ${wordGroups.length} vocabulary exercises.
  Input Groups: ${wordGroups.map((g, idx) => `Group ${idx + 1}: [${g.join(", ")}]`).join("\n")}
  
  Respond with a JSON object containing an "exercises" array. Each:
  {
    "word": "first word",
    "targetWords": ["word1", "word2", "word3"],
    "sentence": "full sentence using all three words",
    "sentenceZh": "中文翻译",
    "quizQuestion": "sentence with ____",
    "options": ["A", "B", "C", "D"],
    "correctAnswer": "word",
    "explanation": "中文解析"
  }`;

  try {
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
        temperature: 0.7
      })
    });

    // 健壮性修复：如果返回失败，读取 body 一次并抛出
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`DeepSeek API Error (${response.status}):`, errorText);
      throw new Error(`API_STATUS_${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("EMPTY_CONTENT");

    const parsed = JSON.parse(content);
    return Array.isArray(parsed) ? parsed : (parsed.exercises || []);
    
  } catch (e) {
    // 捕获所有错误（包括网络、鉴权、解析），无缝降级到 Gemini
    console.info("DeepSeek unavailable, using Gemini fallback.");
    return generatePracticeExercisesWithGemini(items);
  }
}

/**
 * 每日巩固 - Gemini 兜底逻辑
 */
async function generatePracticeExercisesWithGemini(items: StudyItem[]): Promise<PracticeExercise[]> {
  const client = getGeminiClient();
  if (!client) return [];

  const wordGroups: string[][] = [];
  for (let i = 0; i < items.length; i += 3) {
    if (i + 2 < items.length) {
      wordGroups.push(items.slice(i, i + 3).map(it => it.text));
    }
  }

  const prompt = `Create ${wordGroups.length} English exercises in JSON array for these word groups: ${JSON.stringify(wordGroups)}. 
  Each object needs: word, targetWords, sentence, sentenceZh, quizQuestion, options, correctAnswer, explanation.`;

  try {
    const response = await client.models.generateContent({
      model: GENERAL_MODEL_NAME,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              word: { type: Type.STRING },
              targetWords: { type: Type.ARRAY, items: { type: Type.STRING } },
              sentence: { type: Type.STRING },
              sentenceZh: { type: Type.STRING },
              quizQuestion: { type: Type.STRING },
              options: { type: Type.ARRAY, items: { type: Type.STRING } },
              correctAnswer: { type: Type.STRING },
              explanation: { type: Type.STRING }
            },
            required: ["word", "targetWords", "sentence", "sentenceZh", "quizQuestion", "options", "correctAnswer", "explanation"]
          }
        }
      }
    });

    return JSON.parse(response.text?.trim() || "[]");
  } catch (e) {
    console.error("Critical Failure: Both AI providers failed.", e);
    return []; 
  }
}

/**
 * 其他功能继续使用 Gemini 保持实时性
 */
export async function analyzeAudioResponse(audioBase64: string, currentTopic: string, history: {user: string, ai: string}[]): Promise<AnalysisResult> {
  const client = getGeminiClient();
  if (!client) throw new Error("Key missing");
  const historyText = history.map(h => `AI: ${h.ai}\nUser: ${h.user}`).join('\n');
  const prompt = `Analyze English speaking: ${currentTopic}\nHistory: ${historyText}`;
  const response = await client.models.generateContent({
    model: GENERAL_MODEL_NAME,
    contents: [{ text: prompt }, { inlineData: { mimeType: "audio/webm", data: audioBase64 } }],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          userTranscript: { type: Type.STRING },
          betterVersion: { type: Type.STRING },
          analysis: { type: Type.STRING },
          pronunciation: { type: Type.STRING },
          chunks: { type: Type.ARRAY, items: { type: Type.STRING } },
          score: { type: Type.NUMBER },
          replyText: { type: Type.STRING }
        }
      }
    }
  });
  return JSON.parse(response.text.trim());
}

export async function evaluatePronunciation(audioBase64: string, targetText: string): Promise<{ score: number; feedback: string }> {
  const client = getGeminiClient();
  if (!client) return { score: 0, feedback: "API Key Missing" };
  const prompt = `Rate pronunciation of "${targetText}"`;
  const response = await client.models.generateContent({
    model: GENERAL_MODEL_NAME,
    contents: [{ text: prompt }, { inlineData: { mimeType: "audio/webm", data: audioBase64 } }],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: { score: { type: Type.NUMBER }, feedback: { type: Type.STRING } }
      }
    }
  });
  return JSON.parse(response.text.trim());
}

export async function generateDailyQuote(): Promise<DailyQuoteItem> {
  const client = getGeminiClient();
  if (!client) return { english: "Stay hungry.", chinese: "保持饥渴。", source: "Steve Jobs" };
  const prompt = `Generate ONE inspiring English quote with JSON.`;
  const response = await client.models.generateContent({
    model: GENERAL_MODEL_NAME,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: { english: { type: Type.STRING }, chinese: { type: Type.STRING }, source: { type: Type.STRING } }
      }
    }
  });
  return JSON.parse(response.text.trim());
}

export async function generateSpeech(text: string): Promise<string | null> {
  const client = getGeminiClient();
  if (!client) return null;
  try {
    const response = await client.models.generateContent({
      model: SPEECH_MODEL_NAME,
      contents: { parts: [{ text }] },
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Puck' } 
          },
        },
      },
    });
    return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || null;
  } catch (error) {
    return null;
  }
}

export async function generateDailyContent(count: number = 15, currentVocabList: { text: string }[] = []): Promise<StudyItem[]> {
  const existingSet = new Set(currentVocabList.map(v => v.text));
  return getLocalContent(count, existingSet, 'word');
}

export async function generateInitialTopic(): Promise<string> {
    const topics = ["Ordering Bubble Tea", "Returning a package", "Noisy neighbors", "Planning a trip", "Dream job"];
    return topics[Math.floor(Math.random() * topics.length)];
}

export async function generateTopicFromVocab(items: StudyItem[]): Promise<string> {
  const client = getGeminiClient();
  if (!client) return generateInitialTopic();
  const words = items.map(i => i.text).join(", ");
  const prompt = `Short natural scenario title for: [${words}]`;
  const response = await client.models.generateContent({ model: GENERAL_MODEL_NAME, contents: prompt });
  return response.text?.trim() || "Daily Conversation";
}
