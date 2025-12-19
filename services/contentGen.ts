
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { StudyItem, AnalysisResult, DailyQuoteItem, PracticeExercise } from "../types";
import { getLocalContent } from "./localRepository";

// Using recommended model for text tasks
const modelName = "gemini-3-flash-preview";
const ttsModelName = "gemini-2.5-flash-preview-tts";

function getClient() {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    console.warn("API_KEY is not set. Content generation will fail.");
    return null;
  }
  return new GoogleGenAI({ apiKey });
}

// --- Generate Consolidation Exercises ---
export async function generatePracticeExercises(items: StudyItem[]): Promise<PracticeExercise[]> {
  const client = getClient();
  if (!client) throw new Error("API Key missing");

  const wordList = items.map(i => i.text).join(", ");
  const prompt = `You are an English teacher. I just learned these items: [${wordList}]. 
  For EACH item, create a high-quality practice exercise.
  
  Format for each item:
  1. A natural example sentence showing how to use the word.
  2. A Chinese translation of that sentence.
  3. A fill-in-the-blank version of that sentence (use "____" for the blank).
  4. 4 multiple-choice options (one correct, three plausible distractors).
  5. A brief explanation in Chinese.

  Return an ARRAY of JSON objects matching this schema:
  {
    "word": "the word",
    "sentence": "Full example sentence.",
    "sentenceZh": "中文翻译",
    "quizQuestion": "The sentence with ____.",
    "options": ["A", "B", "C", "D"],
    "correctAnswer": "The correct option string",
    "explanation": "中文解析"
  }`;

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
              sentence: { type: Type.STRING },
              sentenceZh: { type: Type.STRING },
              quizQuestion: { type: Type.STRING },
              options: { type: Type.ARRAY, items: { type: Type.STRING } },
              correctAnswer: { type: Type.STRING },
              explanation: { type: Type.STRING }
            },
            required: ["word", "sentence", "sentenceZh", "quizQuestion", "options", "correctAnswer", "explanation"]
          }
        }
      }
    });

    if (response.text) {
      return JSON.parse(response.text.trim());
    }
    throw new Error("Empty AI response");
  } catch (e) {
    console.error("Exercise generation failed", e);
    throw e;
  }
}

// ... keep existing generateSpeech, generateDailyContent, etc.
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
  const wordCount = Math.floor(count * 0.66);
  const sentenceCount = count - wordCount;
  const newWords = getLocalContent(wordCount, existingSet, 'word');
  newWords.forEach(w => existingSet.add(w.text));
  const newSentences = getLocalContent(sentenceCount, existingSet, 'sentence');
  const needed = count - (newWords.length + newSentences.length);
  let fillers: StudyItem[] = [];
  if (needed > 0) {
      newSentences.forEach(s => existingSet.add(s.text));
      fillers = getLocalContent(needed, existingSet);
  }
  const combined = [...newWords, ...newSentences, ...fillers];
  return combined.sort(() => 0.5 - Math.random());
}

export async function analyzeAudioResponse(audioBase64: string, currentTopic: string, history: {user: string, ai: string}[]): Promise<AnalysisResult> {
  const client = getClient();
  if (!client) throw new Error("Key missing");
  const historyText = history.map(h => `AI: ${h.ai}\nUser: ${h.user}`).join('\n');
  const prompt = `Analyze English speaking: ${currentTopic}\nHistory: ${historyText}`;
  try {
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
  } catch (error) {
    throw error;
  }
}

export async function evaluatePronunciation(audioBase64: string, targetText: string): Promise<{ score: number; feedback: string }> {
  const client = getClient();
  if (!client) return { score: 0, feedback: "API Key Missing" };
  const prompt = `Rate pronunciation of "${targetText}"`;
  try {
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
  } catch (error) {
    return { score: 0, feedback: "Error" };
  }
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
  try {
    const response = await client.models.generateContent({ model: modelName, contents: prompt });
    return response.text?.trim() || "Daily Conversation";
  } catch (e) {
    return "Daily Practice";
  }
}

export async function generateDailyQuote(): Promise<DailyQuoteItem> {
  const client = getClient();
  if (!client) return { english: "Stay hungry.", chinese: "保持饥渴。", source: "Steve Jobs" };
  const prompt = `Generate ONE inspiring English quote with JSON.`;
  try {
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
  } catch (e) {
    return { english: "Keep going.", chinese: "继续前进。", source: "Proverb" };
  }
}
