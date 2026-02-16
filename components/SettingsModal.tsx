import React, { useState, useEffect } from 'react';
import { ApiConfig, ApiProvider } from '../types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: ApiConfig;
  onSave: (newConfig: ApiConfig) => void;
}

const PROVIDERS: { id: ApiProvider; name: string; defaultBaseUrl: string; defaultModel: string }[] = [
  { id: 'google', name: 'Google Gemini', defaultBaseUrl: '', defaultModel: 'gemini-3-flash-preview' },
  { id: 'deepseek', name: 'DeepSeek (深度求索)', defaultBaseUrl: 'https://api.deepseek.com', defaultModel: 'deepseek-chat' },
  { id: 'moonshot', name: 'Moonshot (Kimi)', defaultBaseUrl: 'https://api.moonshot.cn/v1', defaultModel: 'moonshot-v1-8k' },
  { id: 'aliyun', name: 'Aliyun Qwen (通义千问)', defaultBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', defaultModel: 'qwen-plus' },
  { id: 'zhipu', name: 'Zhipu GLM (智谱)', defaultBaseUrl: 'https://open.bigmodel.cn/api/paas/v4', defaultModel: 'glm-4' },
  { id: 'openai', name: 'OpenAI (GPT-4o)', defaultBaseUrl: 'https://api.openai.com/v1', defaultModel: 'gpt-4o' },
  { id: 'custom', name: 'Custom (OpenAI Compatible)', defaultBaseUrl: '', defaultModel: '' },
];

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, config, onSave }) => {
  const [provider, setProvider] = useState<ApiProvider>(config.provider);
  const [apiKey, setApiKey] = useState(config.apiKey);
  const [baseUrl, setBaseUrl] = useState(config.baseUrl || '');
  const [modelName, setModelName] = useState(config.modelName);

  // Sync internal state when config prop changes or modal opens
  useEffect(() => {
    if (isOpen) {
        setProvider(config.provider);
        setApiKey(config.apiKey);
        setBaseUrl(config.baseUrl || '');
        setModelName(config.modelName);
    }
  }, [config, isOpen]);

  const handleProviderChange = (newProvider: ApiProvider) => {
    setProvider(newProvider);
    const preset = PROVIDERS.find(p => p.id === newProvider);
    if (preset && newProvider !== 'custom') {
      setBaseUrl(preset.defaultBaseUrl);
      setModelName(preset.defaultModel);
    }
  };

  const handleSave = () => {
    onSave({
      provider,
      apiKey,
      baseUrl,
      modelName
    });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm no-print">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl animate-fade-in-up border border-slate-100">
        
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-2xl">
          <h3 className="text-xl font-serif font-bold text-slate-800 flex items-center gap-2">
            <span>⚙️</span> API Settings
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            ✕
          </button>
        </div>

        <div className="p-6 space-y-5">
          
          {/* Provider Selection */}
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
              Model Provider
            </label>
            <div className="grid grid-cols-2 gap-2">
              {PROVIDERS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => handleProviderChange(p.id)}
                  className={`text-sm py-2 px-3 rounded-lg border text-left truncate transition-all ${
                    provider === p.id 
                      ? 'bg-indigo-50 border-indigo-500 text-indigo-700 font-bold ring-1 ring-indigo-500' 
                      : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                  }`}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>

          {/* Model Name - Free Text Input for ALL providers */}
          <div>
             <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
               Model Name
             </label>
             <input 
               type="text"
               value={modelName}
               onChange={(e) => setModelName(e.target.value)}
               className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:border-indigo-500 outline-none text-slate-700 font-mono text-sm"
               placeholder="e.g. gemini-3-flash-preview, gpt-4o, deepseek-chat"
             />
             <p className="text-[10px] text-slate-400 mt-1">
               {provider === 'google' 
                 ? "Recommended: gemini-3-flash-preview, gemini-2.0-flash-exp" 
                 : "Enter the model ID supported by your provider."}
             </p>
          </div>

          {/* Base URL (Hidden for Google unless needed) */}
          {provider !== 'google' && (
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                API Base URL
              </label>
              <input 
                type="text"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:border-indigo-500 outline-none text-slate-700 font-mono text-sm"
                placeholder="https://api.openai.com/v1"
              />
            </div>
          )}

          {/* API Key */}
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
              API Key
            </label>
            <div className="relative">
              <input 
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="w-full pl-4 pr-10 py-2 rounded-lg border border-slate-200 focus:border-indigo-500 outline-none text-slate-700 font-mono text-sm"
                placeholder={provider === 'google' ? "AIzaSy..." : "sk-..."}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs">🔒</span>
            </div>
            <p className="text-[10px] text-slate-400 mt-2 leading-relaxed">
               {provider === 'google' 
                 ? <span>Get a free key at <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-indigo-500 hover:underline">Google AI Studio</a>. Stored locally in your browser.</span>
                 : "Using OpenAI-compatible format. Keys are stored locally."}
            </p>
          </div>

        </div>

        <div className="p-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl flex justify-end gap-3">
           <button 
             onClick={onClose}
             className="px-4 py-2 text-sm font-bold text-slate-500 hover:text-slate-700"
           >
             Cancel
           </button>
           <button 
             onClick={handleSave}
             className="px-6 py-2 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm hover:shadow-md transition-all"
           >
             Save Configuration
           </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;