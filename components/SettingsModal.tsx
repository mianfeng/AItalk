
import React, { useRef, useState, useEffect } from 'react';
import { X, Download, FileJson, FileSpreadsheet, Upload, AlertTriangle, CheckCircle, ArrowLeft, Volume2, PieChart, Star, Mic, RefreshCw } from 'lucide-react';
import { VocabularyItem, DailyStats, BackupData } from '../types';
import { getPreferredVoice } from '../services/audioUtils';

interface SettingsModalProps {
  show: boolean;
  onClose: () => void;
  vocabList: VocabularyItem[];
  dailyStats: DailyStats;
  onRestore: (data: BackupData) => void;
  totalRepoCount: number;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ 
  show, 
  onClose, 
  vocabList, 
  dailyStats,
  onRestore,
  totalRepoCount
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importStatus, setImportStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [viewMode, setViewMode] = useState<'menu' | 'list' | 'voice'>('menu');
  
  // Voice Settings State
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState<string>('');

  useEffect(() => {
    if (show) {
        // Load voices when modal opens
        const load = () => {
            const voices = window.speechSynthesis.getVoices().filter(v => v.lang.startsWith('en'));
            setAvailableVoices(voices);
            
            const savedURI = localStorage.getItem('lingua_voice_uri');
            if (savedURI && voices.some(v => v.voiceURI === savedURI)) {
                setSelectedVoiceURI(savedURI);
            } else {
                // Auto-select best default to show user what is currently active
                const best = getPreferredVoice(voices, null);
                if (best) setSelectedVoiceURI(best.voiceURI);
            }
        };
        load();
        window.speechSynthesis.onvoiceschanged = load;
    }
  }, [show]);

  const handleVoiceChange = (uri: string) => {
      setSelectedVoiceURI(uri);
      localStorage.setItem('lingua_voice_uri', uri);
      // Trigger a test sound
      const voice = availableVoices.find(v => v.voiceURI === uri);
      if (voice) {
          window.speechSynthesis.cancel();
          const u = new SpeechSynthesisUtterance("Hello, this is my voice.");
          u.voice = voice;
          window.speechSynthesis.speak(u);
      }
  };

  if (!show) return null;

  // Calculate Stats
  const learnedCount = vocabList.filter(v => v.masteryLevel > 1).length;
  const learnedPercentage = totalRepoCount > 0 ? Math.round((learnedCount / totalRepoCount) * 100) : 0;

  // --- Export Logic ---

  const handleExportCSV = () => {
    // Header
    let csvContent = "data:text/csv;charset=utf-8,\uFEFF";
    csvContent += "Type,Text,Translation,Definition,Example,Mastery Level,Added Date\n";

    // Rows
    vocabList.forEach(item => {
      const date = new Date(item.addedAt).toLocaleDateString();
      const row = [
        item.type,
        `"${item.text.replace(/"/g, '""')}"`, // Escape quotes
        `"${item.translation.replace(/"/g, '""')}"`,
        `"${item.definition.replace(/"/g, '""')}"`,
        `"${item.example.replace(/"/g, '""')}"`,
        item.masteryLevel,
        date
      ].join(",");
      csvContent += row + "\n";
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `lingua_vocab_export_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportJSON = () => {
    const backupData: BackupData = {
      vocabList,
      dailyStats,
      timestamp: Date.now(),
      version: 1
    };

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backupData, null, 2));
    const link = document.createElement("a");
    link.setAttribute("href", dataStr);
    link.setAttribute("download", `lingua_backup_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Update last backup timestamp
    localStorage.setItem('lingua_last_backup', Date.now().toString());
  };

  // --- Import Logic ---

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const json = e.target?.result as string;
        const data = JSON.parse(json);

        // Simple validation
        if (Array.isArray(data.vocabList) && data.dailyStats) {
          if (confirm(`检测到备份文件。\n包含 ${data.vocabList.length} 个单词记录。\n\n确认要覆盖当前数据进行恢复吗？此操作不可撤销。`)) {
             onRestore(data as BackupData);
             setImportStatus('success');
             localStorage.setItem('lingua_last_backup', Date.now().toString());
             setTimeout(() => {
                 onClose();
                 setImportStatus('idle');
             }, 1500);
          }
        } else {
          throw new Error("Invalid format");
        }
      } catch (err) {
        console.error(err);
        setImportStatus('error');
        alert("文件格式错误，无法导入。请确保使用的是本应用导出的 JSON 备份文件。");
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  const playSimpleTTS = (text: string) => {
      const speech = new SpeechSynthesisUtterance(text);
      speech.lang = 'en-US';
      const voice = availableVoices.find(v => v.voiceURI === selectedVoiceURI);
      if (voice) speech.voice = voice;
      window.speechSynthesis.speak(speech);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden relative flex flex-col max-h-[85vh]">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex justify-between items-center bg-slate-950 shrink-0">
          <div className="flex items-center gap-3">
              {(viewMode === 'list' || viewMode === 'voice') && (
                  <button onClick={() => setViewMode('menu')} className="text-slate-400 hover:text-white">
                      <ArrowLeft size={20} />
                  </button>
              )}
              <h2 className="text-lg font-bold text-slate-100">
                  {viewMode === 'list' ? '全部单词' : (viewMode === 'voice' ? '发音设置' : '设置')}
              </h2>
          </div>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-slate-800 text-slate-400 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          
          {viewMode === 'menu' ? (
              <div className="space-y-6">
                
                {/* Stats Card */}
                <div className="bg-slate-800/30 border border-slate-700 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-3 text-slate-400 text-xs font-bold uppercase tracking-wider">
                        <PieChart size={14} /> 学习进度
                    </div>
                    <div className="flex justify-between items-end mb-2">
                        <div className="text-3xl font-bold text-emerald-400">{learnedCount}</div>
                        <div className="text-sm text-slate-500 font-mono mb-1">/ {totalRepoCount} 词库总量</div>
                    </div>
                    <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500" style={{ width: `${Math.min(100, learnedPercentage)}%` }} />
                    </div>
                </div>

                {/* Voice Settings Button */}
                <button 
                    onClick={() => setViewMode('voice')}
                    className="w-full bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl p-4 transition-colors text-left flex justify-between items-center"
                >
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-purple-500/10 rounded-lg text-purple-400">
                            <Mic size={20} />
                        </div>
                        <div>
                            <div className="font-medium text-slate-200">发音设置 (TTS)</div>
                            <div className="text-xs text-slate-500">
                                {availableVoices.length > 0 ? "已就绪" : "加载中..."} 
                            </div>
                        </div>
                    </div>
                    <ArrowLeft size={18} className="text-slate-500 rotate-180" />
                </button>

                {/* Collection Button */}
                <button 
                    onClick={() => setViewMode('list')}
                    className="w-full bg-indigo-900/20 hover:bg-indigo-900/30 rounded-xl p-4 border border-indigo-500/30 transition-colors text-left group flex justify-between items-center"
                >
                    <div>
                        <div className="text-xs text-indigo-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                            <Star size={12} fill="currentColor" /> 我的收藏
                        </div>
                        <div className="text-xl font-bold text-indigo-100">
                            {vocabList.length} <span className="text-sm font-normal text-indigo-300/70">个单词/句子</span>
                        </div>
                    </div>
                    <ArrowLeft size={18} className="text-indigo-400 rotate-180 group-hover:translate-x-1 transition-transform" />
                </button>

                <div className="border-t border-slate-800 pt-4 space-y-3">
                    <h3 className="text-sm font-semibold text-slate-400">备份与恢复</h3>
                    <div className="grid grid-cols-2 gap-3">
                        <button 
                            onClick={handleExportJSON}
                            className="flex flex-col items-center justify-center p-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl transition-all"
                        >
                            <FileJson size={20} className="text-blue-400 mb-2" />
                            <span className="text-xs text-slate-300">导出备份</span>
                        </button>
                        <button 
                            onClick={handleExportCSV}
                            className="flex flex-col items-center justify-center p-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl transition-all"
                        >
                            <FileSpreadsheet size={20} className="text-emerald-400 mb-2" />
                            <span className="text-xs text-slate-300">导出 Excel</span>
                        </button>
                    </div>

                    <input type="file" accept=".json" ref={fileInputRef} className="hidden" onChange={handleFileSelect} />
                    <button 
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full py-3 border border-dashed border-slate-600 rounded-xl text-slate-400 hover:text-white hover:border-slate-400 hover:bg-slate-800 transition-all flex items-center justify-center gap-2 text-sm"
                    >
                        {importStatus === 'success' ? (
                            <span className="text-emerald-400 flex items-center gap-2"><CheckCircle size={16} /> 恢复成功</span>
                        ) : (
                            <> <Upload size={16} /> 从备份恢复 </>
                        )}
                    </button>
                </div>
              </div>
          ) : viewMode === 'voice' ? (
              <div className="space-y-4">
                  <div className="bg-slate-800/50 p-3 rounded-lg text-sm text-slate-400">
                      <p className="mb-2">移动端如果发音机械，请尝试切换到带有 <b>Enhanced</b>, <b>Premium</b>, <b>High Quality</b> 等字样的声音。</p>
                      <p className="text-xs text-slate-500">注意：部分声音可能需要先在手机系统设置中下载。</p>
                  </div>
                  
                  {availableVoices.length === 0 ? (
                      <div className="text-center py-8">
                          <RefreshCw className="animate-spin mx-auto text-slate-600 mb-2" />
                          <p className="text-slate-500">正在加载语音库...</p>
                      </div>
                  ) : (
                      <div className="space-y-2">
                          {availableVoices.map(voice => (
                              <button
                                key={voice.voiceURI}
                                onClick={() => handleVoiceChange(voice.voiceURI)}
                                className={`w-full p-3 rounded-lg flex items-center justify-between text-left transition-colors border ${
                                    selectedVoiceURI === voice.voiceURI 
                                    ? 'bg-purple-500/20 border-purple-500/50' 
                                    : 'bg-slate-900 border-slate-800 hover:bg-slate-800'
                                }`}
                              >
                                  <div className="min-w-0 pr-2">
                                      <div className={`font-medium truncate ${selectedVoiceURI === voice.voiceURI ? 'text-purple-300' : 'text-slate-300'}`}>
                                          {voice.name}
                                      </div>
                                      <div className="text-xs text-slate-500">{voice.lang}</div>
                                  </div>
                                  {selectedVoiceURI === voice.voiceURI && <CheckCircle size={16} className="text-purple-400 shrink-0" />}
                              </button>
                          ))}
                      </div>
                  )}
              </div>
          ) : (
              <div className="space-y-4">
                  {vocabList.length === 0 ? (
                      <p className="text-center text-slate-500 mt-10">暂无数据</p>
                  ) : (
                      vocabList.map(item => (
                          <div key={item.id} className="bg-slate-800/50 border border-slate-700 p-3 rounded-xl flex justify-between items-center">
                              <div>
                                  <div className="font-bold text-slate-200">{item.text}</div>
                                  <div className="text-xs text-slate-500">{item.translation}</div>
                              </div>
                              <button 
                                onClick={() => playSimpleTTS(item.text)}
                                className="p-2 text-slate-500 hover:text-white"
                              >
                                  <Volume2 size={16} />
                              </button>
                          </div>
                      ))
                  )}
              </div>
          )}
        </div>
      </div>
    </div>
  );
};
