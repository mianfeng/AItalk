
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { StudyItem, AnalysisResult, DailyQuoteItem, PracticeExercise } from "../types";
import { getLocalContent } from "./localRepository";

const modelName = "gemini-3-flash-preview";
const ttsModelName = "gemini-2.5-flash-preview-tts";

function getClient() {
  const apiKey = process.env.API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({ apiKey });
}

export async function generatePracticeExercises(items: StudyItem[]): Promise<PracticeExercise[]> {
  const client = getClient();
  if (!client) throw new Error("API Key missing");

  // Ensure items are processed in strict chunks of 3
  const wordGroups: string[][] = [];
  for (let i = 0; i < items.length; i += 3) {
    if (i + 2 < items.length) {
      wordGroups.push(items.slice(i, i + 3).map(it => it.text));
    }
  }

  const prompt = `You are an English professor. Create ${wordGroups.length} quiz questions.
  For EACH group of words, follow these steps exactly:
  1. Create ONE natural sentence that contains ALL THREE words.
  2. Translate the sentence to Chinese.
  3. Create a fill-in-the-blank version (____) where the first word in the list is missing.
  4. Provide 4 choices (A, B, C, D).
  5. Provide a detailed Chinese explanation of all three words' usage in this sentence.

  Groups:
  ${wordGroups.map((g, idx) => `Group ${idx + 1}: [${g.join(", ")}]`).join("\n")}

  JSON format only:
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
    const response = await client.models.generateContent({
      model: modelName,
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

    const text = response.text?.trim() || "[]";
    return JSON.parse(text);
  } catch (e) {
    console.error("Critical: Exercise generation failed", e);
    // Return empty array to allow App to handle gracefully without crashing
    throw new Error("生成练习题目失败，请检查网络或重试。");
  }
}

export async function generateSpeech(text: string): Promise<string | null> {
  const client = getClient();
  if (!client) return null;
  try {
    const response = await client.models.generateContent({
      model: ttsModelName,
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

export async function analyzeAudioResponse(audioBase64: string, currentTopic: string, history: {user: string, ai: string}[]): Promise<AnalysisResult> {
  const client = getClient();
  if (!client) throw new Error("Key missing");
  const historyText = history.map(h => `AI: ${h.ai}\nUser: ${h.user}`).join('\n');
  const prompt = `Analyze English speaking: ${currentTopic}\nHistory: ${historyText}`;
  const response = await client.models.generateContent({
    model: modelName,
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
  const client = getClient();
  if (!client) return { score: 0, feedback: "API Key Missing" };
  const prompt = `Rate pronunciation of "${targetText}"`;
  const response = await client.models.generateContent({
    model: modelName,
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

export async function generateInitialTopic(): Promise<string> {
    const topics = ["Ordering Bubble Tea", "Returning a package", "Noisy neighbors", "Planning a trip", "Dream job"];
    return topics[Math.floor(Math.random() * topics.length)];
}

export async function generateTopicFromVocab(items: StudyItem[]): Promise<string> {
  const client = getClient();
  if (!client) return generateInitialTopic();
  const words = items.map(i => i.text).join(", ");
  const prompt = `Short natural scenario title for: [${words}]`;
  const response = await client.models.generateContent({ model: modelName, contents: prompt });
  return response.text?.trim() || "Daily Conversation";
}

export async function generateDailyQuote(): Promise<DailyQuoteItem> {
  const client = getClient();
  if (!client) return { english: "Stay hungry.", chinese: "保持饥渴。", source: "Steve Jobs" };
  const prompt = `Generate ONE inspiring English quote with JSON.`;
  const response = await client.models.generateContent({
    model: modelName,
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
