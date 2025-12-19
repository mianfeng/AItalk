
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { StudyItem, AnalysisResult, DailyQuoteItem, PracticeExercise } from "../types";
import { getLocalContent } from "./localRepository";

// 1. Gemini 配置
const GENERAL_MODEL_NAME = "gemini-3-flash-preview";
const SPEECH_MODEL_NAME = "gemini-2.5-flash-preview-tts";

// 2. DeepSeek 配置 (用于每日巩固以节省用量)
// 注意：环境变量需预先在运行环境中配置 DEEPSEEK_API_KEY
const DEEPSEEK_API_KEY = (process.env as any).DEEPSEEK_API_KEY || "sk-9dae334615f14782b2e43d1b5776006b"; 
const DEEPSEEK_BASE_URL = "https://api.deepseek.com/v1";

function getGeminiClient() {
  const apiKey = process.env.API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({ apiKey });
}

/**
 * 每日巩固 - 使用 DeepSeek API 调用 (节省成本)
 */
export async function generatePracticeExercises(items: StudyItem[]): Promise<PracticeExercise[]> {
  if (!DEEPSEEK_API_KEY) {
    console.warn("DeepSeek API Key missing, falling back to Gemini for exercises...");
    return generatePracticeExercisesWithGemini(items);
  }

  // 将单词按 3 个一组切分
  const wordGroups: string[][] = [];
  for (let i = 0; i < items.length; i += 3) {
    if (i + 2 < items.length) {
      wordGroups.push(items.slice(i, i + 3).map(it => it.text));
    }
  }

  if (wordGroups.length === 0) return [];

  const prompt = `You are an English Language Professor. Create ${wordGroups.length} vocabulary exercises.
  For EACH group of three words, you MUST:
  1. Write ONE natural English sentence using ALL THREE words.
  2. Provide a Chinese translation.
  3. Create a blank (____) replacing the FIRST word.
  4. Provide 4 options (A, B, C, D).
  5. Provide a Chinese explanation of all three words.

  Input Groups:
  ${wordGroups.map((g, idx) => `Group ${idx + 1}: [${g.join(", ")}]`).join("\n")}

  Return ONLY a strict JSON array:
  [{
    "word": "word-in-blank",
    "targetWords": ["word1", "word2", "word3"],
    "sentence": "full sentence",
    "sentenceZh": "中文翻译",
    "quizQuestion": "sentence with ____",
    "options": ["A", "B", "C", "D"],
    "correctAnswer": "A",
    "explanation": "解析内容"
  }]`;

  try {
    const response = await fetch(DEEPSEEK_BASE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: "You are a helpful assistant that outputs only JSON." },
          { role: "user", content: prompt }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.7
      })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || "DeepSeek API Error");
    
    // DeepSeek 返回的内容在 choices[0].message.content 中
    const content = data.choices[0].message.content;
    const parsed = JSON.parse(content);
    
    // 处理 DeepSeek 可能包裹在对象里的情况 (有些模型会返回 { "exercises": [...] })
    return Array.isArray(parsed) ? parsed : (parsed.exercises || []);
  } catch (e) {
    console.error("DeepSeek Call Failed:", e);
    // 最后的防线：如果 DeepSeek 失败，尝试用 Gemini 兜底，确保用户体验
    return generatePracticeExercisesWithGemini(items);
  }
}

/**
 * 每日巩固 - Gemini 备选/兜底逻辑
 */
async function generatePracticeExercisesWithGemini(items: StudyItem[]): Promise<PracticeExercise[]> {
  const client = getGeminiClient();
  if (!client) throw new Error("API Key missing");

  const wordGroups: string[][] = [];
  for (let i = 0; i < items.length; i += 3) {
    if (i + 2 < items.length) {
      wordGroups.push(items.slice(i, i + 3).map(it => it.text));
    }
  }

  const prompt = `Create ${wordGroups.length} English exercises in JSON format for these word groups: ${JSON.stringify(wordGroups)}. Each must have: word, targetWords, sentence, sentenceZh, quizQuestion, options, correctAnswer, explanation.`;

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
