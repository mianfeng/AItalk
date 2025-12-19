import { GoogleGenAI, Type, Modality } from "@google/genai";
import { StudyItem, AnalysisResult, DailyQuoteItem, PracticeExercise } from "../types";
import { getLocalContent } from "./localRepository";

// 1. Gemini 配置
const GENERAL_MODEL_NAME = "gemini-3-flash-preview";
const SPEECH_MODEL_NAME = "gemini-2.5-flash-preview-tts";

// 2. DeepSeek 配置 (从环境变量获取)
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || ""; 
const DEEPSEEK_BASE_URL = "https://api.deepseek.com/chat/completions";

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
    console.warn("DeepSeek API Key missing in environment, falling back to Gemini...");
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

  const prompt = `You are an expert English Language Professor. Create ${wordGroups.length} vocabulary exercises.
  For EACH group of three words, you MUST write ONE natural English sentence using ALL THREE words.
  
  Input Groups:
  ${wordGroups.map((g, idx) => `Group ${idx + 1}: [${g.join(", ")}]`).join("\n")}

  Respond with a JSON object containing an "exercises" array. Each exercise needs:
  - "word": the first word of the group (to be blanked).
  - "targetWords": all 3 words.
  - "sentence": the full sentence.
  - "sentenceZh": Chinese translation.
  - "quizQuestion": the sentence with the "word" replaced by "____".
  - "options": 4 distractor options including the correct word.
  - "correctAnswer": the correct word.
  - "explanation": clear Chinese explanation of all three words' usage.`;

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
          { role: "system", content: "You are a helpful assistant that only outputs JSON." },
          { role: "user", content: prompt }
        ],
        // 开启 JSON 模式，确保返回有效的 JSON 对象
        response_format: { type: 'json_object' },
        temperature: 0.7
      })
    });

    // 核心修复：先获取文本内容，避免直接 response.json() 导致的 Unexpected end of input
    const responseText = await response.text();
    
    if (!response.ok) {
      console.error(`DeepSeek API Error (${response.status}):`, responseText);
      throw new Error(`DS API Failed: ${response.status}`);
    }

    const data = JSON.parse(responseText);
    const content = data.choices?.[0]?.message?.content;
    
    if (!content) throw new Error("DeepSeek returned empty message content");

    const parsed = JSON.parse(content);
    // 兼容返回数组或包含 exercises 键的对象
    const exercises = Array.isArray(parsed) ? parsed : (parsed.exercises || []);
    
    if (exercises.length === 0) {
        throw new Error("No exercises found in AI response");
    }

    return exercises;
    
  } catch (e) {
    console.error("DeepSeek Process Failed, falling back to Gemini:", e);
    return generatePracticeExercisesWithGemini(items);
  }
}

/**
 * 每日巩固 - Gemini 备选/兜底逻辑
 */
async function generatePracticeExercisesWithGemini(items: StudyItem[]): Promise<PracticeExercise[]> {
  const client = getGeminiClient();
  if (!client) {
    console.error("Gemini API Key also missing!");
    return [];
  }

  const wordGroups: string[][] = [];
  for (let i = 0; i < items.length; i += 3) {
    if (i + 2 < items.length) {
      wordGroups.push(items.slice(i, i + 3).map(it => it.text));
    }
  }

  const prompt = `Create ${wordGroups.length} English exercises in JSON array for: ${JSON.stringify(wordGroups)}. 
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
    console.error("Gemini Fallback Failed:", e);
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
        // Fixed typo: changed responseModalities to responseModalities
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
