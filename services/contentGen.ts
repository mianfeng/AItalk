
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { StudyItem, AnalysisResult, DailyQuoteItem, PracticeExercise } from "../types";
import { getLocalContent } from "./localRepository";

const GENERAL_MODEL_NAME = "gemini-2.0-flash-exp";
const SPEECH_MODEL_NAME = "gemini-2.5-flash-preview-tts"; 
const CONVERSATION_MODEL_NAME = "gemini-2.0-flash-exp"; 
const PRACTICE_MODEL_NAME = "gemini-2.0-flash-exp";

const DEEPSEEK_API_KEY = (process.env.DEEPSEEK_API_KEY) || "sk-9dae334615f14782b2e43d1b5776006b"; 
const DEEPSEEK_BASE_URL = "https://api.deepseek.com/chat/completions";

function getGeminiClient() {
  const apiKey = process.env.API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({ apiKey });
}

export async function generatePracticeExercises(items: StudyItem[]): Promise<PracticeExercise[]> {
  if (DEEPSEEK_API_KEY && DEEPSEEK_API_KEY.length > 5) {
    try {
        const result = await generatePracticeExercisesWithDeepSeek(items);
        console.log("成功调用 DeepSeek API - 生成练习");
        return result;
    } catch (e) {
        console.warn("DeepSeek 失败，切换至 Gemini", e);
    }
  }
  const result = await generatePracticeExercisesWithGemini(items);
  console.log("成功调用 Gemini API - 生成练习");
  return result;
}

async function generatePracticeExercisesWithDeepSeek(items: StudyItem[]): Promise<PracticeExercise[]> {
  const wordGroups: string[][] = [];
  for (let i = 0; i < items.length; i += 3) {
    if (i + 2 < items.length) {
      wordGroups.push(items.slice(i, i + 3).map(it => it.text));
    }
  }

  if (wordGroups.length === 0) return [];

  const prompt = `You are an expert English Professor. Create vocabulary exercises for these groups: ${JSON.stringify(wordGroups)}.
  For EACH group, provide:
  1. "targetWords": The 3 words in this group as an array.
  2. "sentence": A natural sentence using all 3 words.
  3. "sentenceZh": Chinese translation.
  4. "quizQuestion": The sentence where the 3 words are replaced by "____".
  5. "correctAnswers": The 3 words in correct order.
  6. "options": The 3 correct words plus 3 distractors.
  7. "explanation": Chinese analysis.
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
      temperature: 1.3
    })
  });

  if (!response.ok) throw new Error(`DeepSeek API Error: ${response.status}`);
  const data = await response.json();
  const parsed = JSON.parse(data.choices?.[0]?.message?.content || "{}");
  return parsed.exercises || [];
}

async function generatePracticeExercisesWithGemini(items: StudyItem[]): Promise<PracticeExercise[]> {
  const client = getGeminiClient();
  if (!client) return [];

  const wordGroups: string[][] = [];
  for (let i = 0; i < items.length; i += 3) {
    if (i + 2 < items.length) {
      wordGroups.push(items.slice(i, i + 3).map(it => it.text));
    }
  }

  const prompt = `Create exercises for: ${JSON.stringify(wordGroups)}. Return JSON array of objects with targetWords, sentence, sentenceZh, quizQuestion(with 3 ____), options(6 words), correctAnswers(ordered), explanation(Chinese).`;

  try {
    const response = await client.models.generateContent({
      model: PRACTICE_MODEL_NAME,
      contents: prompt,
      config: {
        temperature: 1.25,
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
    console.error("Gemini 练习生成失败", e);
    return [];
  }
}

export async function analyzeAudioResponse(audioBase64: string, currentTopic: string, history: {user: string, ai: string}[]): Promise<AnalysisResult> {
  const client = getGeminiClient();
  if (!client) throw new Error("Key missing");
  const prompt = `Analyze: Topic ${currentTopic}. History ${JSON.stringify(history)}. Output JSON.`;
  const response = await client.models.generateContent({
    model: CONVERSATION_MODEL_NAME,
    contents: [{ text: prompt }, { inlineData: { mimeType: "audio/webm", data: audioBase64 } }],
    config: { 
      responseMimeType: "application/json",
      temperature: 1.1
    }
  });
  console.log("成功调用 Gemini API - 语音分析");
  return JSON.parse(response.text.trim());
}

export async function evaluatePronunciation(audioBase64: string, targetText: string): Promise<{ score: number; feedback: string }> {
  const client = getGeminiClient();
  if (!client) return { score: 0, feedback: "API Key Missing" };
  const response = await client.models.generateContent({
    model: GENERAL_MODEL_NAME,
    contents: [{ text: `Rate pronunciation of "${targetText}"` }, { inlineData: { mimeType: "audio/webm", data: audioBase64 } }],
    config: { responseMimeType: "application/json" }
  });
  console.log("成功调用 Gemini API - 发音评估");
  return JSON.parse(response.text.trim());
}

export async function generateDailyQuote(): Promise<DailyQuoteItem> {
  const client = getGeminiClient();
  if (!client) return { english: "Stay hungry.", chinese: "保持饥渴。", source: "Steve Jobs" };
  const response = await client.models.generateContent({
    model: GENERAL_MODEL_NAME,
    contents: `Generate Inspiring Quote JSON`,
    config: { 
      responseMimeType: "application/json",
      temperature: 1.2
    }
  });
  console.log("成功调用 Gemini API - 每日金句");
  return JSON.parse(response.text.trim());
}

export async function generateSpeech(text: string): Promise<string | null> {
  const client = getGeminiClient();
  if (!client) return null;
  try {
    const response = await client.models.generateContent({
      model: SPEECH_MODEL_NAME,
      contents: { parts: [{ text }] },
      config: { responseModalities: [Modality.AUDIO] },
    });
    console.log("成功调用 Gemini API - TTS语音合成");
    return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || null;
  } catch (error) {
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
  const client = getGeminiClient();
  if (!client) return generateInitialTopic();
  const response = await client.models.generateContent({ 
    model: GENERAL_MODEL_NAME, 
    contents: `Short natural scenario title for words: ${items.map(i => i.text).join(",")}`,
    config: { temperature: 1.2 }
  });
  console.log("成功调用 Gemini API - 生成对话主题");
  return response.text?.trim() || "Daily Conversation";
}
