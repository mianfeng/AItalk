import { GoogleGenAI, Type, Modality } from "@google/genai";
import { StudyItem, AnalysisResult, DailyQuoteItem, VocabularyItem } from "../types";

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

// --- Daily Plan Generation ---
export async function generateDailyContent(count: number = 15, existingItems: VocabularyItem[] = []): Promise<StudyItem[]> {
  const client = getClient();
  if (!client) return [];

  // Pick ~50 random existing words to exclude to prevent duplicates (Prompt size limit)
  const excludeList = existingItems
      .sort(() => 0.5 - Math.random())
      .slice(0, 50)
      .map(i => i.text)
      .join(", ");

  // Randomly pick a theme to ensure variety
  const themes = ["Business & Office", "Travel & Culture", "Daily Emotions", "Technology", "Food & Dining", "Relationships", "Academic & Science", "Slang & Idioms"];
  const currentTheme = themes[Math.floor(Math.random() * themes.length)];

  const prompt = `Generate ${count} distinct English oral expressions for a Chinese learner (B2/C1 level).
  
  CONTEXT:
  - Theme: ${currentTheme}
  - Difficulty: Mix of CET-6, IELTS, and authentic daily slang.
  
  CRITICAL CONSTRAINTS:
  1. EXCLUDE these words (do not generate them): [${excludeList}]
  2. STRICT JSON ONLY: Do not output any markdown code blocks, do not output any "thinking" text, do not output "Self-correction". Just the raw JSON array.
  3. FIELDS:
     - 'text': The word or idiom.
     - 'translation': Concise Chinese meaning.
     - 'definition': Simple English definition.
     - 'example': A natural sentence using the word.
     - 'example_zh': Chinese translation of the example.
     - 'extra_info': Brief origin, synonym, or usage note (in Chinese). KEEP IT SHORT.
  
  JSON Structure:
  [
    {
      "text": "serendipity",
      "translation": "机缘巧合",
      "definition": "The occurrence of events by chance in a happy or beneficial way.",
      "example": "We found this amazing restaurant by pure serendipity.",
      "example_zh": "我们纯属偶然发现了这家很棒的餐厅。",
      "type": "word",
      "pronunciation": "/ˌser.ənˈdɪp.ə.t̬i/",
      "extra_info": "名词。常指意外发现美好事物的运气。"
    }
  ]`;

  try {
    const response = await client.models.generateContent({
      model: modelName,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        // Schema helps, but prompt instruction is also key for "clean" output
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              text: { type: Type.STRING },
              translation: { type: Type.STRING },
              definition: { type: Type.STRING },
              example: { type: Type.STRING },
              example_zh: { type: Type.STRING },
              type: { type: Type.STRING, enum: ["word", "sentence", "idiom"] },
              pronunciation: { type: Type.STRING },
              extra_info: { type: Type.STRING }
            },
            required: ["text", "translation", "definition", "example", "example_zh", "type"]
          }
        }
      }
    });

    if (response.text) {
      const data = JSON.parse(response.text);
      return data.map((item: any) => ({
        ...item,
        id: Math.random().toString(36).substr(2, 9)
      }));
    }
    return [];
  } catch (error) {
    console.error("Failed to generate content", error);
    return [];
  }
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

// --- Initial Topic Generation (Updated) ---
export async function generateInitialTopic(): Promise<string> {
    const topics = [
        "In the Supermarket",
        "Job Interview",
        "At the Airport",
        "Ordering Coffee",
        "Checking into a Hotel",
        "Asking for Directions",
        "Meeting a New Friend",
        "Doctor's Appointment",
        "Talking about Movies",
        "Weekend Plans"
    ];
    return topics[Math.floor(Math.random() * topics.length)];
}

export async function generateTopicFromVocab(items: VocabularyItem[]): Promise<string> {
  const client = getClient();
  if (!client) return generateInitialTopic();

  // Only take 3 words
  const words = items.map(i => i.text).join(", ");
  
  const prompt = `Generate a short, natural scenario title or setting phrase (2-6 words) that conceptually links these words: [${words}]. 
  
  Examples: 
  - "At the coffee shop"
  - "Solving a problem"
  - "In a business meeting"
  
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