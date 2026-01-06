
import React, { useRef, useState } from 'react';
import { X, Download, FileJson, FileSpreadsheet, Upload, AlertTriangle, CheckCircle, ArrowLeft, Volume2, PieChart, Star, Mic, RefreshCw, Copy, ClipboardCheck, Share2, Info } from 'lucide-react';
import { VocabularyItem, DailyStats, BackupData } from '../types';
import { useSpeech } from '../hooks/useSpeech';

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
  const [copyStatus, setCopyStatus] = useState(false);
  const [viewMode, setViewMode] = useState<'menu' | 'list' | 'voice' | 'data'>('menu');
  const [backupInput, setBackupInput] = useState('');
  
  const { availableVoices, setVoice, preferredVoice, voiceName, speak, cancel } = useSpeech();

  if (!show) return null;

  const learnedCount = vocabList.filter(v => v.masteryLevel >= 1).length;
  const learnedPercentage = totalRepoCount > 0 ? Math.round((learnedCount / totalRepoCount) * 100) : 0;

  const createBackupObject = (): BackupData => ({
    vocabList,
    dailyStats,
    timestamp: Date.now(),
    version: 1
  });

  const handleCopyBackup = async () => {
    const data = JSON.stringify(createBackupObject());
    await navigator.clipboard.writeText(data);
    setCopyStatus(true);
    setTimeout(() => setCopyStatus(false), 2000);
  };

  const handleStringImport = () => {
    if (!backupInput.trim()) return;
    try {
        const data = JSON.parse(backupInput);
        if (Array.isArray(data.vocabList) && data.dailyStats) {
            if (confirm(`准备导入备份：\n📦 包含 ${data.vocabList.length} 个单词记录\n🗓️ 备份日期：${new Date(data.timestamp).toLocaleString()}\n\n确认恢复吗？这将覆盖当前所有进度。`)) {
                onRestore(data as BackupData);
                setImportStatus('success');
                setTimeout(() => { setViewMode('menu'); setImportStatus('idle'); setBackupInput(''); }, 1000);
            }
        } else {
            throw new Error("Invalid format");
        }
    } catch (e) {
        alert("格式错误，请确保粘贴了正确的备份文本。");
    }
  };

  const handleShareBackup = async () => {
    const data = createBackupObject();
    const fileName = `lingua_progress_${new Date().toISOString().slice(0, 10)}.json`;
    const file = new File([JSON.stringify(data, null, 2)], fileName, { type: 'application/json' });

    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
            await navigator.share({
                files: [file],
                title: 'LinguaFlow 学习进度备份',
                text: '这是我的英语学习进度备份文件。'
            });
        } catch (e) {
            handleExportJSON(); 
        }
    } else {
        handleExportJSON();
    }
  };

  const handleExportJSON = () => {
    const backupData = createBackupObject();
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backupData, null, 2));
    const link = document.createElement("a");
    link.setAttribute("href", dataStr);
    link.setAttribute("download", `lingua_backup_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    localStorage.setItem('lingua_last_backup', Date.now().toString());
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string);
        if (Array.isArray(data.vocabList) && data.dailyStats) {
             onRestore(data as BackupData);
             setImportStatus('success');
             setTimeout(() => { setViewMode('menu'); setImportStatus('idle'); }, 1500);
        }
      } catch (err) {
        alert("文件格式错误。");
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden relative flex flex-col max-h-[85vh]">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex justify-between items-center bg-slate-950 shrink-0">
          <div className="flex items-center gap-3">
              {viewMode !== 'menu' && (
                  <button onClick={() => setViewMode('menu')} className="text-slate-400 hover:text-white">
                      <ArrowLeft size={20} />
                  </button>
              )}
              <h2 className="text-lg font-bold text-slate-100">
                  {viewMode === 'list' ? '我的收藏' : (viewMode === 'voice' ? '发音设置' : (viewMode === 'data' ? '进度同步' : '设置'))}
              </h2>
          </div>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-slate-800 text-slate-400 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          
          {viewMode === 'menu' && (
              <div className="space-y-4">
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
                        <div className="h-full bg-emerald-500 transition-all duration-1000" style={{ width: `${Math.min(100, learnedPercentage)}%` }} />
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-3">
                    <button onClick={() => setViewMode('data')} className="w-full bg-blue-600 hover:bg-blue-500 text-white border-b-4 border-blue-800 rounded-xl p-4 transition-all flex justify-between items-center active:border-b-0 active:translate-y-1">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-white/10 rounded-lg"><RefreshCw size={20} /></div>
                            <div className="text-left">
                                <div className="font-bold">同步/导出进度</div>
                                <div className="text-[10px] opacity-80 text-blue-100">跨设备同步学习记录</div>
                            </div>
                        </div>
                        <ArrowLeft size={18} className="rotate-180" />
                    </button>

                    <button onClick={() => setViewMode('voice')} className="w-full bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl p-4 transition-colors flex justify-between items-center">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-purple-500/10 rounded-lg text-purple-400"><Mic size={20} /></div>
                            <div className="text-left">
                                <div className="font-medium text-slate-200">发音设置</div>
                                <div className="text-[10px] text-slate-500">当前：{voiceName}</div>
                            </div>
                        </div>
                        <ArrowLeft size={18} className="text-slate-500 rotate-180" />
                    </button>

                    <button onClick={() => setViewMode('list')} className="w-full bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl p-4 transition-colors flex justify-between items-center">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-amber-500/10 rounded-lg text-amber-400"><Star size={20} /></div>
                            <div className="text-left">
                                <div className="font-medium text-slate-200">收藏夹</div>
                                <div className="text-[10px] text-slate-500">{vocabList.length} 个单词/句子</div>
                            </div>
                        </div>
                        <ArrowLeft size={18} className="text-slate-500 rotate-180" />
                    </button>
                </div>
              </div>
          )}

          {viewMode === 'data' && (
              <div className="space-y-6 animate-in slide-in-from-right-4">
                  {/* Export Section */}
                  <div className="space-y-3">
                      <h3 className="text-sm font-bold text-slate-400 flex items-center gap-2">
                          <Download size={14} /> 导出进度
                      </h3>
                      <div className="grid grid-cols-2 gap-3">
                          <button onClick={handleShareBackup} className="flex flex-col items-center justify-center p-4 bg-blue-600/10 border border-blue-500/30 rounded-2xl hover:bg-blue-600/20 transition-all group">
                              <Share2 className="text-blue-400 mb-2 group-hover:scale-110 transition-transform" size={24} />
                              <span className="text-xs font-bold text-blue-200">一键分享文件</span>
                          </button>
                          <button onClick={handleCopyBackup} className="flex flex-col items-center justify-center p-4 bg-emerald-600/10 border border-emerald-500/30 rounded-2xl hover:bg-emerald-600/20 transition-all group">
                              {copyStatus ? <ClipboardCheck className="text-emerald-400 mb-2" size={24} /> : <Copy className="text-emerald-400 mb-2 group-hover:scale-110 transition-transform" size={24} />}
                              <span className="text-xs font-bold text-emerald-200">{copyStatus ? '已复制' : '复制备份文本'}</span>
                          </button>
                      </div>
                      <p className="text-[10px] text-slate-500 text-center">复制文本后可通过微信/备忘录发送到另一台设备粘贴导入。</p>
                  </div>

                  <div className="h-px bg-slate-800 w-full" />

                  {/* Import Section */}
                  <div className="space-y-3">
                      <h3 className="text-sm font-bold text-slate-400 flex items-center gap-2">
                          <Upload size={14} /> 导入/恢复
                      </h3>
                      
                      <div className="bg-slate-950 rounded-xl p-3 border border-slate-800 focus-within:border-blue-500/50 transition-colors">
                          <textarea 
                            value={backupInput}
                            onChange={(e) => setBackupInput(e.target.value)}
                            placeholder="在此处粘贴备份文本..."
                            className="w-full h-24 bg-transparent border-none outline-none text-xs text-slate-300 font-mono resize-none placeholder:text-slate-700"
                          />
                          {backupInput && (
                              <button onClick={handleStringImport} className="w-full mt-2 py-2 bg-blue-600 text-white text-xs font-bold rounded-lg shadow-lg">确认导入文本</button>
                          )}
                      </div>

                      <input type="file" accept=".json" ref={fileInputRef} className="hidden" onChange={handleFileSelect} />
                      <button 
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full py-4 border-2 border-dashed border-slate-700 rounded-2xl text-slate-400 hover:text-white hover:border-slate-500 hover:bg-slate-800/50 transition-all flex items-center justify-center gap-3 text-sm font-medium"
                      >
                        {importStatus === 'success' ? (
                            <span className="text-emerald-400 flex items-center gap-2 font-bold"><CheckCircle size={20} /> 恢复成功！</span>
                        ) : (
                            <> <FileJson size={20} /> 选择备份文件 (.json) </>
                        )}
                      </button>
                  </div>

                  <div className="bg-amber-900/10 border border-amber-500/20 p-4 rounded-xl flex gap-3">
                      <AlertTriangle className="text-amber-500 shrink-0" size={18} />
                      <p className="text-[10px] text-amber-200/70 leading-relaxed">
                          提示：导入会<b>覆盖</b>当前设备的所有学习进度和收藏。建议在操作前先备份当前数据。
                      </p>
                  </div>
              </div>
          )}

          {viewMode === 'voice' && (
              <div className="space-y-4 animate-in slide-in-from-right-4">
                  <div className="bg-slate-800/50 p-4 rounded-xl text-xs text-slate-400 flex gap-3">
                      <Info size={16} className="text-blue-400 shrink-0" />
                      <p>移动端如果发音机械，请尝试切换到带有 <b>Enhanced</b> 或 <b>Natural</b> 字样的声音。部分高品质声音需在手机系统设置中下载。</p>
                  </div>
                  <div className="space-y-2">
                      {availableVoices.length === 0 ? (
                          <div className="text-center py-10 text-slate-500">正在获取系统语音库...</div>
                      ) : (
                          availableVoices.map(voice => (
                              <button
                                key={voice.voiceURI}
                                onClick={() => {
                                    setVoice(voice.voiceURI);
                                    speak("Selection updated.");
                                }}
                                className={`w-full p-4 rounded-xl flex items-center justify-between text-left transition-all border ${
                                    preferredVoice?.voiceURI === voice.voiceURI 
                                    ? 'bg-blue-600/20 border-blue-500/50' 
                                    : 'bg-slate-900 border-slate-800 hover:bg-slate-800'
                                }`}
                              >
                                  <div className="min-w-0 pr-2">
                                      <div className={`font-bold truncate ${preferredVoice?.voiceURI === voice.voiceURI ? 'text-blue-300' : 'text-slate-200'}`}>
                                          {voice.name}
                                      </div>
                                      <div className="text-[10px] text-slate-500 uppercase tracking-widest mt-1">{voice.lang}</div>
                                  </div>
                                  {preferredVoice?.voiceURI === voice.voiceURI && <CheckCircle size={18} className="text-blue-400 shrink-0" />}
                              </button>
                          ))
                      )}
                  </div>
              </div>
          )}

          {viewMode === 'list' && (
              <div className="space-y-3 animate-in slide-in-from-right-4">
                  {vocabList.length === 0 ? (
                      <div className="text-center py-20 flex flex-col items-center gap-4">
                          <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center text-slate-600"><Star size={32} /></div>
                          <p className="text-slate-500 text-sm">还没有收藏任何单词</p>
                      </div>
                  ) : (
                      vocabList.map(item => (
                          <div key={item.id} className="bg-slate-900 border border-slate-800 p-4 rounded-2xl flex justify-between items-center group">
                              <div className="min-w-0">
                                  <div className="font-bold text-slate-100 text-lg group-hover:text-blue-400 transition-colors">{item.text}</div>
                                  <div className="text-sm text-emerald-400 mt-1">{item.translation}</div>
                              </div>
                              <button 
                                onClick={() => speak(item.text)}
                                className="p-3 bg-slate-800 rounded-xl text-slate-400 hover:text-white hover:bg-slate-700 transition-all"
                              >
                                  <Volume2 size={20} />
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
