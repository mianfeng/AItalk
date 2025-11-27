import { FunctionDeclaration, GoogleGenAI, LiveServerMessage, Modality, Type } from '@google/genai';
import { createBlob, decode, decodeAudioData } from './audioUtils';
import { ConnectionState, Message, Feedback } from '../types';

export interface LiveSessionConfig {
  onConnectionStateChange: (state: ConnectionState) => void;
  onTranscriptUpdate: (message: Message) => void;
  onAudioData: (amplitude: number) => void; // For visualizer
  onFeedback: (feedback: Feedback) => void; // New callback for feedback tools
  systemInstruction: string;
}

// Tool definition for speech analysis
const feedbackTool: FunctionDeclaration = {
  name: 'giveFeedback',
  description: 'Provide feedback on the user\'s grammar, pronunciation, or naturalness. Use this whenever the user speaks to offer a better version of what they said.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      original: { type: Type.STRING, description: "The user's original (inferred) text" },
      better: { type: Type.STRING, description: "A more natural/native way to say it" },
      analysis: { type: Type.STRING, description: "Brief explanation of why the change is better (in Chinese)" },
      chunks: { 
        type: Type.ARRAY, 
        items: { type: Type.STRING },
        description: "Extract 1-3 useful phrases/idioms from the improved version for the user to learn"
      }
    },
    required: ['original', 'better', 'analysis', 'chunks']
  }
};

export class LiveSession {
  private client: GoogleGenAI;
  private inputAudioContext: AudioContext | null = null;
  private outputAudioContext: AudioContext | null = null;
  private inputNode: GainNode | null = null;
  private outputNode: GainNode | null = null;
  private sources: Set<AudioBufferSourceNode> = new Set();
  private nextStartTime: number = 0;
  private sessionPromise: Promise<any> | null = null;
  private config: LiveSessionConfig;
  private currentInputTranscription: string = '';
  private currentOutputTranscription: string = '';
  private stream: MediaStream | null = null;
  private scriptProcessor: ScriptProcessorNode | null = null;

  constructor(config: LiveSessionConfig) {
    this.config = config;
    if (!process.env.API_KEY) {
      console.error("API_KEY is missing from environment variables.");
    }
    this.client = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
  }

  async connect() {
    try {
      this.config.onConnectionStateChange(ConnectionState.CONNECTING);

      this.inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      this.outputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      
      this.inputNode = this.inputAudioContext.createGain();
      this.outputNode = this.outputAudioContext.createGain();
      this.outputNode.connect(this.outputAudioContext.destination);

      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      this.sessionPromise = this.client.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } },
          },
          systemInstruction: this.config.systemInstruction,
          tools: [{ functionDeclarations: [feedbackTool] }], // Enable Feedback Tool
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        },
        callbacks: {
          onopen: this.handleOpen.bind(this),
          onmessage: this.handleMessage.bind(this),
          onerror: this.handleError.bind(this),
          onclose: this.handleClose.bind(this),
        },
      });

    } catch (error) {
      console.error('Connection failed:', error);
      this.config.onConnectionStateChange(ConnectionState.ERROR);
    }
  }

  // Allow sending a text trigger to start the conversation
  async sendText(text: string) {
    if (this.sessionPromise) {
        const session = await this.sessionPromise;
        await session.sendRealtimeInput({
            content: { parts: [{ text }] }
        });
    }
  }

  private handleOpen() {
    this.config.onConnectionStateChange(ConnectionState.CONNECTED);
    if (!this.inputAudioContext || !this.stream) return;

    const source = this.inputAudioContext.createMediaStreamSource(this.stream);
    this.scriptProcessor = this.inputAudioContext.createScriptProcessor(4096, 1, 1);

    this.scriptProcessor.onaudioprocess = (audioProcessingEvent) => {
      const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
      
      let sum = 0;
      for (let i = 0; i < inputData.length; i++) {
        sum += inputData[i] * inputData[i];
      }
      const rms = Math.sqrt(sum / inputData.length);
      this.config.onAudioData(rms);

      const pcmBlob = createBlob(inputData);
      
      if (this.sessionPromise) {
        this.sessionPromise.then((session) => {
          session.sendRealtimeInput({ media: pcmBlob });
        }).catch(err => console.error("Error sending input:", err));
      }
    };

    source.connect(this.scriptProcessor);
    this.scriptProcessor.connect(this.inputAudioContext.destination);
  }

  private async handleMessage(message: LiveServerMessage) {
    // 1. Handle Tool Calls (Feedback)
    if (message.toolCall) {
        for (const fc of message.toolCall.functionCalls) {
            if (fc.name === 'giveFeedback') {
                const args = fc.args as any;
                this.config.onFeedback({
                    original: args.original,
                    better: args.better,
                    analysis: args.analysis,
                    chunks: args.chunks || []
                });
                
                // We must respond to the tool call to keep the session going, 
                // even if we just say "ok".
                if (this.sessionPromise) {
                    const session = await this.sessionPromise;
                    session.sendToolResponse({
                        functionResponses: {
                            id: fc.id,
                            name: fc.name,
                            response: { result: "Feedback received and displayed to user." }
                        }
                    });
                }
            }
        }
    }

    // 2. Handle Transcriptions
    if (message.serverContent?.outputTranscription) {
      this.currentOutputTranscription += message.serverContent.outputTranscription.text;
    } else if (message.serverContent?.inputTranscription) {
      this.currentInputTranscription += message.serverContent.inputTranscription.text;
    }

    if (message.serverContent?.turnComplete) {
        if (this.currentInputTranscription.trim()) {
            this.config.onTranscriptUpdate({
                id: Date.now().toString() + '-user',
                role: 'user',
                text: this.currentInputTranscription,
                timestamp: Date.now()
            });
        }
        if (this.currentOutputTranscription.trim()) {
            this.config.onTranscriptUpdate({
                id: Date.now().toString() + '-model',
                role: 'model',
                text: this.currentOutputTranscription,
                timestamp: Date.now()
            });
        }
        this.currentInputTranscription = '';
        this.currentOutputTranscription = '';
    }

    // 3. Handle Audio Output
    const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
    if (base64Audio && this.outputAudioContext && this.outputNode) {
       this.config.onAudioData(0.5); 

      this.nextStartTime = Math.max(this.nextStartTime, this.outputAudioContext.currentTime);
      
      const audioBuffer = await decodeAudioData(
        decode(base64Audio),
        this.outputAudioContext,
        24000,
        1
      );

      const source = this.outputAudioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.outputNode);
      source.addEventListener('ended', () => {
        this.sources.delete(source);
      });

      source.start(this.nextStartTime);
      this.nextStartTime += audioBuffer.duration;
      this.sources.add(source);
    }

    // 4. Handle Interruption
    if (message.serverContent?.interrupted) {
      this.sources.forEach(source => {
        source.stop();
        this.sources.delete(source);
      });
      this.nextStartTime = 0;
      this.currentOutputTranscription = '';
    }
  }

  private handleError(e: ErrorEvent) {
    console.error('Session error:', e);
    this.disconnect();
    this.config.onConnectionStateChange(ConnectionState.ERROR);
  }

  private handleClose(e: CloseEvent) {
    console.log('Session closed', e);
    this.disconnect();
    this.config.onConnectionStateChange(ConnectionState.DISCONNECTED);
  }

  async disconnect() {
    // Cleanup code...
    if (this.scriptProcessor) {
        this.scriptProcessor.disconnect();
        this.scriptProcessor.onaudioprocess = null;
        this.scriptProcessor = null;
    }
    if (this.stream) {
        this.stream.getTracks().forEach(track => track.stop());
        this.stream = null;
    }
    if (this.inputAudioContext) {
        this.inputAudioContext.close();
        this.inputAudioContext = null;
    }
    if (this.outputAudioContext) {
        this.outputAudioContext.close();
        this.outputAudioContext = null;
    }
    this.sources.clear();
    this.nextStartTime = 0;
    this.sessionPromise = null;
    this.config.onConnectionStateChange(ConnectionState.DISCONNECTED);
  }
}