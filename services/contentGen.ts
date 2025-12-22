
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

/**
 * 后置处理：防止 AI 抽风将多个选项合并成一个字符串
 */
function sanitizeExercises(exercises: any[]): PracticeExercise[] {
    return exercises.map(ex => {
        let options: string[] = [];
        if (Array.isArray(ex.options)) {
            ex.options.forEach((opt: string) => {
                // 如果 AI 返回了 "word1, word2, word3" 这种合并项，强行拆分
                if (typeof opt === 'string' && opt.includes(',') && opt.split(',').length >= 2) {
                    const parts = opt.split(',').map(s => s.trim()).filter(s => s.length > 0);
                    options.push(...parts);
                } else {
                    options.push(opt);
                }
            });
        }
        
        // 去重并确保包含正确答案
        const finalOptions = Array.from(new Set([...options, ...(ex.correctAnswers || [])]));
        
        return {
            ...ex,
            options: finalOptions
        } as PracticeExercise;
    });
}

export async function generatePracticeExercises(items: StudyItem[]): Promise<PracticeExercise[]> {
  let rawExercises: any[] = [];
  if (DEEPSEEK_API_KEY && DEEPSEEK_API_KEY.length > 5) {
    try {
        rawExercises = await generatePracticeExercisesWithDeepSeek(items);
        console.log("成功调用 DeepSeek API - 生成练习");
    } catch (e) {
        console.warn("DeepSeek 失败，切换至 Gemini", e);
        rawExercises = await generatePracticeExercisesWithGemini(items);
    }
  } else {
    rawExercises = await generatePracticeExercisesWithGemini(items);
    console.log("成功调用 Gemini API - 生成练习");
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
  
  CRITICAL RULES FOR CONTENT:
  1. STICK TO THE MEANING: You MUST create the sentence based on the provided "meaning" (Chinese translation).
  2. FLAT OPTIONS ARRAY: The "options" field MUST be a flat array of INDIVIDUAL strings. 
     - WRONG: ["management, label, commercial", "distractor1"]
     - RIGHT: ["management", "label", "commercial", "distractor1", "distractor2"]
     NEVER combine multiple target words into a single option string.
  
  For EACH group, provide:
  1. "targetWords": The original words provided (text field).
  2. "sentence": A natural sentence using those words.
  3. "sentenceZh": Chinese translation.
  4. "quizQuestion": The sentence where the words are replaced by "____".
  5. "correctAnswers": The exact strings for the blanks in order.
  6. "options": A flat array of 6-8 individual items (including the correct answers as separate elements + distractors).
  7. "explanation": Concise Chinese meaning analysis.
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
  const client = getGeminiClient();
  if (!client) return [];

  const wordGroups: string[] = [];
  for (let i = 0; i < items.length; i += 3) {
    const group = items.slice(i, i + 3).map(it => `${it.text}(Meaning: ${it.translation})`).join(", ");
    wordGroups.push(group);
  }

  const prompt = `Create English exercises for: ${JSON.stringify(wordGroups)}. 
  STRICT RULE: The "options" field MUST be an array of SINGLE strings. Do not put multiple words in one option.
  Example options: ["word1", "word2", "word3", "word4"].
  Return JSON array with targetWords, sentence, sentenceZh, quizQuestion, options(at least 6 individual strings), correctAnswers, explanation.`;

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
            }
          }
        } 
      }
    });
    return JSON.parse(response.text || "[]");
  } catch (e) {
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
      temperature: 1.0
    }
  });
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
      temperature: 1.0
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
      config: { responseModalities: [Modality.AUDIO] },
    });
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
    config: { temperature: 1.0 }
  });
  return response.text?.trim() || "Daily Conversation";
}
