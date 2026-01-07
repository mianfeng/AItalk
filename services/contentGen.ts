
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { StudyItem, AnalysisResult, DailyQuoteItem, PracticeExercise, VocabularyItem } from "../types";
import { getLocalContent } from "./localRepository";

// Using correct model identifiers based on official mapping
// Using correct model identifiers based on official mapping
const GENERAL_MODEL_NAME = "gemini-flash-latest"; 
const SPEECH_MODEL_NAME = "gemini-2.5-flash-preview-tts"; 
const CONVERSATION_MODEL_NAME = "gemini-flash-latest"; 
const PRACTICE_MODEL_NAME = "gemini-flash-latest"; 

const DEEPSEEK_API_KEY = (process.env.DEEPSEEK_API_KEY) || ""; 
const DEEPSEEK_BASE_URL = "https://api.deepseek.com/chat/completions";

/**
 * Initializes the Google GenAI client using the environment variable API_KEY.
 */
function getGeminiClient() {
  const apiKey = process.env.API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({ apiKey });
}

/**
 * Generates daily study items by fetching from local repository.
 */
export async function generateDailyContent(count: number, existingVocab: VocabularyItem[]): Promise<StudyItem[]> {
  const existingTexts = new Set(existingVocab.map(v => v.text.toLowerCase()));
  return getLocalContent(count, existingTexts);
}

/**
 * Generates an initial conversation topic using Gemini.
 */
export async function generateInitialTopic(): Promise<string> {
  const ai = getGeminiClient();
  if (!ai) return "Let's talk about your daily routine.";
  
  const response = await ai.models.generateContent({
    model: GENERAL_MODEL_NAME,
    contents: "Suggest a friendly, engaging conversation topic for an English language learner. Keep it under 15 words.",
  });
  
  return response.text || "What is your favorite travel destination?";
}

/**
 * Generates a conversation topic based on specific vocabulary words.
 */
export async function generateTopicFromVocab(vocab: VocabularyItem[]): Promise<string> {
  const ai = getGeminiClient();
  if (!ai) return "Let's practice some new vocabulary.";
  
  const words = vocab.map(v => v.text).join(", ");
  const response = await ai.models.generateContent({
    model: GENERAL_MODEL_NAME,
    contents: `Suggest a short conversation scenario or question that naturally uses these English words: ${words}. Keep it brief.`,
  });
  
  return response.text || `Can you tell me about a situation where you might use the word '${vocab[0]?.text}'?`;
}

/**
 * Generates a daily inspiring quote with translation and source.
 */
export async function generateDailyQuote(): Promise<DailyQuoteItem> {
  const ai = getGeminiClient();
  if (!ai) return { english: "Stay hungry, stay foolish.", chinese: "求知若饥，虚心若愚。", source: "Steve Jobs" };
  
  const response = await ai.models.generateContent({
    model: GENERAL_MODEL_NAME,
    contents: "Provide an inspiring quote in English with its Chinese translation and the author/source. Return in JSON format.",
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          english: { type: Type.STRING },
          chinese: { type: Type.STRING },
          source: { type: Type.STRING }
        },
        required: ["english", "chinese", "source"]
      }
    }
  });
  
  try {
    return JSON.parse(response.text || "");
  } catch (e) {
    return { english: "The journey is the reward.", chinese: "旅程本身就是回报。", source: "Steve Jobs" };
  }
}

/**
 * Generates high-quality speech using Gemini TTS model.
 */
export async function generateSpeech(text: string): Promise<string | undefined> {
  const ai = getGeminiClient();
  if (!ai) return undefined;

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

  return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
}

/**
 * Post-processing for exercise generation.
 */
function sanitizeExercises(exercises: any[]): PracticeExercise[] {
    if (!Array.isArray(exercises)) return [];
    
    return exercises.map(ex => {
        const targetWords = Array.isArray(ex.targetWords) ? ex.targetWords : (ex.word ? [ex.word] : []);
        const correctAnswers = Array.isArray(ex.correctAnswers) ? ex.correctAnswers : (ex.correctAnswer ? [ex.correctAnswer] : []);
        const targetWordPronunciations = Array.isArray(ex.targetWordPronunciations) ? ex.targetWordPronunciations : [];

        let options: string[] = [];
        if (Array.isArray(ex.options)) {
            ex.options.forEach((opt: any) => {
                if (typeof opt === 'string' && opt.includes(',') && opt.split(',').length >= 2) {
                    const parts = opt.split(',').map((s: string) => s.trim()).filter((s: string) => s.length > 0);
                    options.push(...parts);
                } else if (typeof opt === 'string') {
                    options.push(opt);
                }
            });
        }
        
        // Ensure options include the correct answers
        const finalOptions = Array.from(new Set([...options, ...correctAnswers]));
        
        return {
            targetWords,
            targetWordPronunciations,
            sentence: ex.sentence || "",
            sentenceZh: ex.sentenceZh || "",
            quizQuestion: ex.quizQuestion || ex.sentence?.replace(new RegExp(correctAnswers.join('|'), 'gi'), '____') || "Error: Missing Question",
            options: finalOptions,
            correctAnswers,
            explanation: ex.explanation || ""
        } as PracticeExercise;
    }).filter(ex => ex.targetWords.length > 0 && ex.quizQuestion.includes('____'));
}

/**
 * Generates practice exercises from study items.
 */
export async function generatePracticeExercises(items: StudyItem[]): Promise<PracticeExercise[]> {
  let rawExercises: any[] = [];
  
  try {
    const client = getGeminiClient();
    if (client) {
        rawExercises = await generatePracticeExercisesWithGemini(items);
        if (rawExercises && rawExercises.length > 0) {
            const sanitized = sanitizeExercises(rawExercises);
            if (sanitized.length > 0) {
                console.log(`成功调用 Google Gemini (${PRACTICE_MODEL_NAME}) - 生成练习`);
                return sanitized;
            }
        }
    }
  } catch (e) {
    console.warn("Google Gemini 练习生成失败:", e);
  }

  if (DEEPSEEK_API_KEY && DEEPSEEK_API_KEY.length > 5) {
    try {
        rawExercises = await generatePracticeExercisesWithDeepSeek(items);
        if (rawExercises && rawExercises.length > 0) {
            console.log("成功调用 DeepSeek API - 生成练习 (备选)");
            return sanitizeExercises(rawExercises);
        }
    } catch (e) {
        console.error("所有 API 均已失败", e);
    }
  }
  
  return [];
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
  Each group of 3 words must produce ONE exercise.
  
  CRITICAL RULES:
  1. Each sentence MUST be short and simple (MAX 17 words).
  2. "quizQuestion": Sentence with exactly THREE "____" placeholders.
  3. "correctAnswers": The 3 correct words filling the blanks, in order.
  4. "targetWords": The 3 original target words (base forms) corresponding to the blanks, in the SAME ORDER as correctAnswers.
  5. "targetWordPronunciations": Standard IPA symbols for the 3 target words.
  6. "options": The 3 correct words plus 2-3 distractors (total 5-6 strings).
  7. "explanation": A helpful teaching explanation in CHINESE.
  
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
    const group = items.slice(i, i + 3).map(it => `${it.text} (means: ${it.translation})`).join(", ");
    wordGroups.push(group);
  }

  const prompt = `Task: Create fill-in-the-blank English exercises for language learners.
  Data groups: ${JSON.stringify(wordGroups)}.
  
  For each group, create ONE sentence that uses all 3 target words. Each sentence make logical sense and reflect how a native speaker would actually talk. Max 20 words.
  
  Requirement:
  - "quizQuestion": The sentence with "____" replacing the target words. Must have exactly 3 "____".
  - "correctAnswers": The 3 correct words filling the blanks, in order.
  - "targetWords": The 3 original target words (base forms) corresponding to the blanks, in the SAME ORDER as correctAnswers.
  - "targetWordPronunciations": Standard IPA symbols for the 3 target words.
  - "options": The 3 correct words plus 2-3 distractors (total 5-6 individual strings).
  - "sentenceZh": Natural Chinese translation.
  - "explanation": A helpful teaching explanation in CHINESE,  Focus on collocations and why synonyms don't fit.`;

  try {
    const response = await ai.models.generateContent({
      model: PRACTICE_MODEL_NAME,
      contents: prompt,
      config: {
        systemInstruction: "You are a professional English tutor and specialized JSON generator. You provide helpful, natural linguistic analysis in Chinese. Always return a valid JSON array of objects.",
        temperature: 0.7,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              targetWords: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Base forms of the words, matching the order of correctAnswers" },
              targetWordPronunciations: { type: Type.ARRAY, items: { type: Type.STRING } },
              sentence: { type: Type.STRING },
              sentenceZh: { type: Type.STRING },
              quizQuestion: { type: Type.STRING, description: "Sentence with exactly three '____' placeholders" },
              options: { type: Type.ARRAY, items: { type: Type.STRING } },
              correctAnswers: { type: Type.ARRAY, items: { type: Type.STRING } },
              explanation: { type: Type.STRING, description: "Detailed linguistic explanation in Chinese" }
            },
            required: ["targetWords", "targetWordPronunciations", "sentence", "sentenceZh", "quizQuestion", "options", "correctAnswers", "explanation"]
          }
        } 
      }
    });
    
    const text = response.text;
    if (!text) return [];
    return JSON.parse(text);
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
      systemInstruction: "You are an English speaking coach. Analyze audio transcripts and provide feedback in JSON.",
      responseMimeType: "application/json",
      temperature: 1.0
    }
  });
  return JSON.parse(response.text || "{}");
}

/**
 * Evaluates pronunciation accuracy of a specific text.
 */
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
        responseMimeType: "application/json",
        responseSchema: {
            type: Type.OBJECT,
            properties: {
                score: { type: Type.NUMBER },
                feedback: { type: Type.STRING }
            },
            required: ["score", "feedback"]
        } 
    }
  });
  
  try {
    return JSON.parse(response.text || "");
  } catch (e) {
    return { score: 0, feedback: "Evaluation failed" };
  }
}
