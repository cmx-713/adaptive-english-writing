import React, { useState, useEffect } from 'react';
import { ApiConfig, ApiProvider } from '../types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: ApiConfig;
  onSave: (newConfig: ApiConfig) => void;
}

const PROVIDERS: { id: ApiProvider; name: string; defaultBaseUrl: string; defaultModel: string }[] = [
  { id: 'deepseek', name: 'DeepSeek (深度求索)', defaultBaseUrl: 'https://api.deepseek.com', defaultModel: 'deepseek-flash' },
  { id: 'aliyun', name: 'Aliyun Qwen (通义千问)', defaultBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', defaultModel: 'qwen-plus' },
  { id: 'zhipu', name: 'Zhipu GLM (智谱)', defaultBaseUrl: 'https://open.bigmodel.cn/api/paas/v4', defaultModel: 'glm-4' },
  { id: 'custom', name: 'Custom (OpenAI Compatible)', defaultBaseUrl: '', defaultModel: '' },
];

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, config, onSave }) => {
  const [provider, setProvider] = useState<ApiProvider>(config.provider);
  const [apiKey, setApiKey] = useState(config.apiKey);
  const [baseUrl, setBaseUrl] = useState(config.baseUrl || '');
  const [modelName, setModelName] = useState(config.modelName);
  const [testState, setTestState] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testError, setTestError] = useState('');

  // Sync internal state when config prop changes or modal opens
  useEffect(() => {
    if (isOpen) {
      setProvider(config.provider);
      setApiKey(config.apiKey);
      setBaseUrl(config.baseUrl || '');
      setModelName(config.modelName);
      setTestState('idle');
      setTestError('');
    }
  }, [config, isOpen]);

  const markConfigurationChanged = () => {
    setTestState('idle');
    setTestError('');
  };

  const handleProviderChange = (newProvider: ApiProvider) => {
    setProvider(newProvider);
    const preset = PROVIDERS.find(p => p.id === newProvider);
    if (preset && newProvider !== 'custom') {
      setBaseUrl(preset.defaultBaseUrl);
      setModelName(preset.defaultModel);
    }
    markConfigurationChanged();
  };

  const handleTestConnection = async () => {
    const trimmedApiKey = apiKey.trim();
    const trimmedBaseUrl = baseUrl.trim().replace(/\/+$/, '');
    const trimmedModelName = modelName.trim();

    if (!trimmedApiKey || !trimmedBaseUrl || !trimmedModelName) {
      setTestState('error');
      setTestError('请填写 API Key、API Base URL 和模型名称。');
      return;
    }

    setTestState('testing');
    setTestError('');

    try {
      const requestBody: Record<string, unknown> = {
        model: trimmedModelName,
        messages: [
          {
            role: 'system',
            content: 'You are testing JSON output. Return one valid JSON object only. Do not use markdown, special tokens, or explanatory text.'
          },
          { role: 'user', content: 'Return an object with one boolean field named ok. Set ok to true.' }
        ],
        response_format: { type: 'json_object' },
        temperature: 0,
        max_tokens: 64
      };

      if (provider === 'deepseek') {
        requestBody.thinking = { type: 'disabled' };
      }

      const response = await fetch(`${trimmedBaseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${trimmedApiKey}`
        },
        body: JSON.stringify(requestBody)
      });

      const responseText = await response.text();
      let responseData: any = null;
      try {
        responseData = JSON.parse(responseText);
      } catch {
        // Keep the original response text for a useful API error below.
      }

      if (!response.ok) {
        const detail = responseData?.error?.message || responseText.slice(0, 240);
        throw new Error(`API 请求失败 (${response.status})${detail ? `：${detail}` : ''}`);
      }

      const content = responseData?.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || !content.trim()) {
        throw new Error('接口返回了空内容，请更换模型或稍后重试。');
      }

      const jsonContent = content.trim()
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```$/, '')
        .trim();
      JSON.parse(jsonContent);

      setTestState('success');
    } catch (error) {
      setTestState('error');
      setTestError(error instanceof Error ? error.message : '连接测试失败，请检查配置。');
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
                  className={`text-sm py-2 px-3 rounded-lg border text-left truncate transition-all ${provider === p.id
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
              onChange={(e) => { setModelName(e.target.value); markConfigurationChanged(); }}
              className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:border-indigo-500 outline-none text-slate-700 font-mono text-sm"
              placeholder="e.g. gemini-3-flash-preview, gpt-4o, deepseek-flash"
            />
            <p className="text-[10px] text-slate-400 mt-1">
              Enter the model ID supported by your provider.
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
                onChange={(e) => { setBaseUrl(e.target.value); markConfigurationChanged(); }}
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
                onChange={(e) => { setApiKey(e.target.value); markConfigurationChanged(); }}
                className="w-full pl-4 pr-10 py-2 rounded-lg border border-slate-200 focus:border-indigo-500 outline-none text-slate-700 font-mono text-sm"
                placeholder={provider === 'google' ? "AIzaSy..." : "sk-..."}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs">🔒</span>
            </div>
            <p className="text-[10px] text-slate-400 mt-2 leading-relaxed">
              Using OpenAI-compatible format. Keys are stored locally.
            </p>
          </div>

          <div className="pt-1">
            <button
              onClick={handleTestConnection}
              disabled={testState === 'testing'}
              className="w-full px-4 py-2 text-sm font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition-colors disabled:opacity-60 disabled:cursor-wait"
            >
              {testState === 'testing' ? 'Testing connection...' : 'Test Connection'}
            </button>
            {testState === 'success' && (
              <p className="text-xs text-emerald-600 mt-2">连接成功，已确认模型可以返回 JSON。</p>
            )}
            {testState === 'error' && (
              <p className="text-xs text-rose-600 mt-2 break-words">{testError}</p>
            )}
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
            disabled={testState !== 'success'}
            className="px-6 py-2 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm hover:shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Save Configuration
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
