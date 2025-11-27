import { GoogleGenAI, Type } from "@google/genai";
import { StudyItem, AnalysisResult, DailyQuoteItem } from "../types";

const modelName = "gemini-2.5-flash";

function getClient() {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    console.warn("API_KEY is not set. Content generation will fail.");
    return null;
  }
  return new GoogleGenAI({ apiKey });
}

// --- Daily Plan Generation ---
export async function generateDailyContent(count: number = 15): Promise<StudyItem[]> {
  const client = getClient();
  if (!client) return [];

  const prompt = `Generate ${count} distinct, high-frequency English oral expressions, idioms, or useful sentences for a Chinese learner who wants to sound native in daily casual and professional settings. 
  Mix between single words/idioms (type='word') and full sentences (type='sentence').
  
  Required fields:
  - text: The English expression.
  - translation: The Chinese translation (meaning).
  - definition: A simple English definition.
  - example: A sentence using the term.
  - pronunciation: IPA or simple phonetic spelling.
  - type: 'word', 'sentence', or 'idiom'.

  Focus on: Office small talk, expressing opinions, and modern daily life slang.`;

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
              text: { type: Type.STRING },
              translation: { type: Type.STRING },
              definition: { type: Type.STRING },
              example: { type: Type.STRING },
              type: { type: Type.STRING, enum: ["word", "sentence", "idiom"] },
              pronunciation: { type: Type.STRING }
            },
            required: ["text", "translation", "definition", "example", "type"]
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
        score: 0,
        replyText: "I cannot hear you without my API key."
    };
  }
  
  // Construct context from history
  const historyText = history.map(h => `AI: ${h.ai}\nUser: ${h.user}`).join('\n');
  
  const prompt = `
    Context: The user is practicing spoken English. 
    Current Topic/AI Question: "${currentTopic}"
    Conversation History:
    ${historyText}

    Task:
    1. Transcribe the user's audio input (contained in this request).
    2. Analyze their grammar, pronunciation, and naturalness.
    3. Provide a 'betterVersion' (Native speaker rewrite).
    4. Provide 'analysis' in Chinese (What was wrong? Why is the better version better?).
    5. Give a 'score' (0-100).
    6. Generate 'replyText': The AI's next conversational response to keep the chat going.
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
            score: { type: Type.NUMBER },
            replyText: { type: Type.STRING }
          },
          required: ["userTranscript", "betterVersion", "analysis", "score", "replyText"]
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
        score: 0,
        replyText: "Please try saying that again."
    };
  }
}

export async function generateInitialTopic(): Promise<string> {
    const topics = [
        "Tell me about a small win you had at work recently.",
        "What's your favorite way to relax after a long day?",
        "If you could travel anywhere tomorrow, where would you go?",
        "What do you think about remote working?",
        "Describe your favorite food to me."
    ];
    return topics[Math.floor(Math.random() * topics.length)];
}