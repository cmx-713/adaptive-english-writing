import React from 'react';

interface ErrorBoundaryProps {
    children: React.ReactNode;
    fallbackMessage?: string;
}

interface ErrorBoundaryState {
    hasError: boolean;
    error: Error | null;
}

/**
 * React Error Boundary
 * 捕获子组件树中的 JavaScript 错误，防止整个应用白屏。
 * 显示友好的错误提示，并提供"重试"按钮。
 */
class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
    constructor(props: ErrorBoundaryProps) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        console.error('[ErrorBoundary] Caught error:', error, errorInfo);
    }

    handleRetry = () => {
        this.setState({ hasError: false, error: null });
    };

    render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-[300px] flex flex-col items-center justify-center p-8 text-center">
                    <div className="w-16 h-16 rounded-2xl bg-rose-50 flex items-center justify-center text-3xl mb-4">
                        ⚠️
                    </div>
                    <h3 className="text-lg font-bold text-slate-800 mb-2">
                        {this.props.fallbackMessage || '页面加载出错'}
                    </h3>
                    <p className="text-sm text-slate-500 mb-4 max-w-md">
                        该模块遇到了一个意外错误。你的数据不受影响。
                    </p>
                    {this.state.error && (
                        <details className="mb-4 text-left w-full max-w-md">
                            <summary className="text-xs text-slate-400 cursor-pointer hover:text-slate-600">
                                查看错误详情
                            </summary>
                            <pre className="mt-2 p-3 bg-slate-50 border border-slate-200 rounded-lg text-[11px] text-rose-600 overflow-auto max-h-24 font-mono">
                                {this.state.error.message}
                            </pre>
                        </details>
                    )}
                    <button
                        onClick={this.handleRetry}
                        className="px-6 py-2 bg-blue-900 text-white text-sm font-bold rounded-lg hover:bg-blue-800 transition-colors shadow-sm"
                    >
                        🔄 重试
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
