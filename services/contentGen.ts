import { GoogleGenAI, Type, Modality } from "@google/genai";
import { StudyItem, AnalysisResult, DailyQuoteItem } from "../types";
import { getLocalContent } from "./localRepository";

const modelName = "gemini-2.5-flash";
const ttsModelName = "gemini-2.5-flash-preview-tts";

function getClient() {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    console.warn("API_KEY is not set. Content generation will fail.");
    return null;
  }
  return new GoogleGenAI({ apiKey });
}

// --- Text-to-Speech (Gemini) ---
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
            prebuiltVoiceConfig: { voiceName: 'Puck' } // Male voice
          },
        },
      },
    });
    
    // Extract base64 audio
    return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || null;
  } catch (error) {
    console.error("TTS generation failed:", error);
    return null;
  }
}

// --- Daily Plan Generation (Local Only) ---
export async function generateDailyContent(count: number = 15, currentVocabList: { text: string }[] = []): Promise<StudyItem[]> {
  const existingSet = new Set(currentVocabList.map(v => v.text));

  // RATIO STRATEGY: ~2/3 Words, ~1/3 Sentences/Idioms
  // e.g. For count=15: 10 Words, 5 Sentences
  const wordCount = Math.floor(count * 0.66);
  const sentenceCount = count - wordCount;

  // 1. Get Words
  const newWords = getLocalContent(wordCount, existingSet, 'word');
  
  // 2. Get Sentences/Idioms
  // Note: Add the newly picked words to existingSet temporarily to avoid duplication if repo has mixed content issues (unlikely but safe)
  newWords.forEach(w => existingSet.add(w.text));
  const newSentences = getLocalContent(sentenceCount, existingSet, 'sentence');

  // 3. Fallback: If not enough sentences, fill with words
  const needed = count - (newWords.length + newSentences.length);
  let fillers: StudyItem[] = [];
  if (needed > 0) {
      newSentences.forEach(s => existingSet.add(s.text));
      fillers = getLocalContent(needed, existingSet); // Get anything available
  }

  const combined = [...newWords, ...newSentences, ...fillers];
  
  // Shuffle the combined result so user gets a mix
  return combined.sort(() => 0.5 - Math.random());
}

// --- Daily Quote Generation ---
export async function generateDailyQuote(): Promise<DailyQuoteItem> {
  const client = getClient();
  if (!client) {
    return {
      english: "Pivot!",
      chinese: "转！(Friends 经典台词)",
      source: "Friends (Demo Mode)"
    };
  }

  const prompt = `Generate ONE inspiring or interesting English quote/idiom/slang from a famous movie, TV show (like Friends, Modern Family), or book.
  Return JSON: { "english": "...", "chinese": "...", "source": "..." }`;

  try {
    const response = await client.models.generateContent({
      model: modelName,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            english: { type: Type.STRING },
            chinese: { type: Type.STRING },
            source: { type: Type.STRING }
          }
        }
      }
    });

    if (response.text) {
      return JSON.parse(response.text);
    }
    throw new Error("No data");
  } catch (e) {
    return {
      english: "Pivot!",
      chinese: "转！(Friends 经典台词)",
      source: "Friends"
    };
  }
}

// --- Audio Analysis & Conversation Turn ---
export async function analyzeAudioResponse(
  audioBase64: string, 
  currentTopic: string,
  history: {user: string, ai: string}[]
): Promise<AnalysisResult> {
  const client = getClient();
  if (!client) {
    return {
        userTranscript: "Error: No API Key",
        betterVersion: "Please check API Key configuration.",
        analysis: "系统未配置 API Key。",
        pronunciation: "N/A",
        chunks: [],
        score: 0,
        replyText: "I cannot hear you without my API key."
    };
  }
  
  // Construct context from history
  const historyText = history.map(h => `AI: ${h.ai}\nUser: ${h.user}`).join('\n');
  
  const prompt = `
    Context: The user is practicing spoken English. 
    Current Scenario/Context: "${currentTopic}"
    Conversation History:
    ${historyText}

    Task:
    1. Transcribe the user's audio input.
    2. Analyze their grammar, and specifically their PRONUNCIATION and INTONATION.
    3. Provide a 'betterVersion' (Native speaker rewrite).
    4. Provide 'analysis' in Chinese (Focus on grammar/vocab errors).
    5. Provide 'pronunciation' in Chinese (Focus on stress, rhythm, and intonation).
    6. Extract 1-3 'chunks' (useful idioms/collocations) from the BETTER VERSION.
    7. Give a 'score' (0-100).
    8. Generate 'replyText': The AI's next conversational response to keep the chat going.
  `;

  try {
    const response = await client.models.generateContent({
      model: modelName,
      contents: {
        parts: [
          { text: prompt },
          { inlineData: { mimeType: "audio/webm", data: audioBase64 } } // Assuming webm from MediaRecorder
        ]
      },
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
          },
          required: ["userTranscript", "betterVersion", "analysis", "pronunciation", "chunks", "score", "replyText"]
        }
      }
    });

    if (response.text) {
      return JSON.parse(response.text);
    }
    throw new Error("Empty response");
  } catch (error) {
    console.error("Analysis failed", error);
    return {
        userTranscript: "(Error analyzing audio)",
        betterVersion: "Could not process.",
        analysis: "系统暂时无法处理音频，请重试。",
        pronunciation: "无法分析",
        chunks: [],
        score: 0,
        replyText: "Please try saying that again."
    };
  }
}

// --- Word/Sentence Pronunciation Scoring ---
export async function evaluatePronunciation(
  audioBase64: string,
  targetText: string
): Promise<{ score: number; feedback: string }> {
  const client = getClient();
  if (!client) return { score: 0, feedback: "API Key Missing" };

  const prompt = `
    Act as a strict pronunciation coach.
    Target Text: "${targetText}"
    
    Task:
    1. Listen to the user's audio.
    2. Compare it with the target text.
    3. Give a score (0-100).
    4. Provide very brief, specific feedback in Chinese about phonemes or stress (max 15 words).
  `;

  try {
    const response = await client.models.generateContent({
      model: modelName,
      contents: {
        parts: [
          { text: prompt },
          { inlineData: { mimeType: "audio/webm", data: audioBase64 } }
        ]
      },
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

    if (response.text) {
      return JSON.parse(response.text);
    }
    return { score: 0, feedback: "Could not analyze" };
  } catch (error) {
    console.error("Pronunciation check failed", error);
    return { score: 0, feedback: "Error" };
  }
}

// --- Initial Topic Generation (Updated - Daily Life) ---
export async function generateInitialTopic(): Promise<string> {
    const topics = [
        "Ordering Bubble Tea with adjustments (sugar/ice)",
        "Returning a package at the post office",
        "Complaining about noisy neighbors",
        "Asking for a refund on a bad meal",
        "Chatting about a new TV show",
        "Explaining why you are late",
        "Cancelling a gym subscription",
        "Finding a lost item in Uber",
        "Planning a weekend hiking trip",
        "Asking a friend for a favor",
        "Describing a weird dream",
        "Recommending a local restaurant"
    ];
    return topics[Math.floor(Math.random() * topics.length)];
}

export async function generateTopicFromVocab(items: StudyItem[]): Promise<string> {
  const client = getClient();
  if (!client) return generateInitialTopic();

  const words = items.map(i => i.text).join(", ");
  const prompt = `Generate a short, natural daily-life scenario title or setting phrase (2-6 words) that conceptually links these words: [${words}]. 
  
  Examples: 
  - "At the coffee shop"
  - "Dealing with a mistake"
  - "In a team meeting"
  
  Strictly output the phrase only. Do NOT generate a full sentence or a question.`;

  try {
    const response = await client.models.generateContent({
        model: modelName,
        contents: prompt
    });
    return response.text?.trim() || "Daily Conversation";
  } catch (e) {
    return "Daily Practice";
  }
}