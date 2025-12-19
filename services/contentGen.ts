
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { StudyItem, AnalysisResult, DailyQuoteItem, PracticeExercise } from "../types";
import { getLocalContent } from "./localRepository";

// 1. Gemini 配置
// Switching to gemini-2.0-flash-exp which is reliable and widely available
const GENERAL_MODEL_NAME = "gemini-2.0-flash-exp";
// TTS model as per instructions
const SPEECH_MODEL_NAME = "gemini-2.5-flash-preview-tts"; 
// Audio dialog analysis
const CONVERSATION_MODEL_NAME = "gemini-2.0-flash-exp"; 
const PRACTICE_MODEL_NAME = "gemini-2.0-flash-exp";

// 2. DeepSeek 配置 (尝试从环境变量获取)
const DEEPSEEK_API_KEY = (process.env.DEEPSEEK_API_KEY) || "sk-9dae334615f14782b2e43d1b5776006b"; 
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
  // 如果配置了 DeepSeek Key，尝试使用
  if (DEEPSEEK_API_KEY && DEEPSEEK_API_KEY.length > 5) {
    try {
        const result = await generatePracticeExercisesWithDeepSeek(items);
        return result;
    } catch (e) {
        console.warn("DeepSeek generation failed, falling back to Gemini.", e);
        // Fallback proceeds below
    }
  }
  return generatePracticeExercisesWithGemini(items);
}

async function generatePracticeExercisesWithDeepSeek(items: StudyItem[]): Promise<PracticeExercise[]> {
  const wordGroups: string[][] = [];
  for (let i = 0; i < items.length; i += 3) {
    if (i + 2 < items.length) {
      wordGroups.push(items.slice(i, i + 3).map(it => it.text));
    }
  }

  if (wordGroups.length === 0) return [];

  const prompt = `You are an expert English Professor. Create ${wordGroups.length} vocabulary exercises.
  Input Groups: ${wordGroups.map((g, idx) => `Group ${idx + 1}: [${g.join(", ")}]`).join("\n")}
  
  For EACH group, write ONE sentence that naturally includes ALL 3 words.
  Create a "quizQuestion" where these 3 words are replaced by "____".
  Provide "correctAnswers" as an ordered array of the 3 words.
  Provide "options" containing the 3 target words plus 3-4 distractor words (total 6-7 options).

  Respond with a JSON object containing an "exercises" array. Format:
  {
    "exercises": [
      {
        "targetWords": ["word1", "word2", "word3"],
        "sentence": "The full sentence with word1, word2 and word3.",
        "sentenceZh": "Chinese translation",
        "quizQuestion": "The full sentence with ____, ____ and ____.",
        "correctAnswers": ["word1", "word2", "word3"], 
        "options": ["word1", "word2", "word3", "distractor1", "distractor2", "distractor3"],
        "explanation": "Brief explanation in Chinese."
      }
    ]
  }`;

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

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`DeepSeek API Error (${response.status}):`, errorText);
    throw new Error(`API_STATUS_${response.status}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("EMPTY_CONTENT");

  const parsed = JSON.parse(content);
  
  // 成功调用日志
  console.log("成功调用 DeepSeek API");

  return Array.isArray(parsed) ? parsed : (parsed.exercises || []);
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

  if (wordGroups.length === 0) return [];

  const prompt = `Create ${wordGroups.length} vocabulary exercises based on these word groups: ${JSON.stringify(wordGroups)}.
  
  For EACH group, create ONE exercise object where:
  - You write a sentence containing ALL 3 target words.
  - "quizQuestion": replace the 3 target words with "____".
  - "correctAnswers": an array of the 3 target words in their correct order in the sentence.
  - "options": an array of 6 words (the 3 target words + 3 distractors).
  - "explanation": brief Chinese explanation.

  RETURN A JSON ARRAY.`;

  try {
    const response = await client.models.generateContent({
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
            },
            required: ["targetWords", "sentence", "sentenceZh", "quizQuestion", "options", "correctAnswers", "explanation"]
          }
        } 
      }
    });

    const text = response.text?.trim() || "[]";
    const jsonStr = text.replace(/```json/g, '').replace(/```/g, '');
    const parsed = JSON.parse(jsonStr);

    // 成功调用日志
    console.log("成功调用 Gemini API");

    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error("Practice Generation Failed:", e);
    return [];
  }
}

/**
 * 情景对话 - 分析
 */
export async function analyzeAudioResponse(audioBase64: string, currentTopic: string, history: {user: string, ai: string}[]): Promise<AnalysisResult> {
  const client = getGeminiClient();
  if (!client) throw new Error("Key missing");
  
  const historyText = history.map(h => `AI: ${h.ai}\nUser: ${h.user}`).join('\n');
  const prompt = `Analyze English speaking based on topic: ${currentTopic}\nHistory: ${historyText}\n
  Provide a JSON response with: userTranscript, betterVersion, analysis, pronunciation, chunks, score (0-100), replyText (conversational response).`;
  
  const response = await client.models.generateContent({
    model: CONVERSATION_MODEL_NAME,
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
    console.warn("TTS generation failed, falling back to browser TTS", error);
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
