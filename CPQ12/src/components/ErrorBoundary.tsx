import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { AppError } from '../types';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: AppError) => void;
}

interface State {
  hasError: boolean;
  error: AppError | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
    };
  }

  static getDerivedStateFromError(error: Error): State {
    const appError: AppError = {
      code: 'COMPONENT_ERROR',
      message: error.message,
      details: {
        stack: error.stack,
        name: error.name
      },
      timestamp: new Date(),
      component: 'ErrorBoundary'
    };

    return {
      hasError: true,
      error: appError,
      errorInfo: null
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const appError: AppError = {
      code: 'COMPONENT_ERROR',
      message: error.message,
      details: {
        stack: error.stack,
        name: error.name,
        componentStack: errorInfo.componentStack
      },
      timestamp: new Date(),
      component: 'ErrorBoundary'
    };

    this.setState({
      error: appError,
      errorInfo
    });

    // Call onError callback if provided
    if (this.props.onError) {
      this.props.onError(appError);
    }

    // Log error for debugging
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  handleRetry = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null
    });
  };

  handleGoHome = () => {
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      // Custom fallback UI
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default error UI
      return (
        <div className="min-h-screen bg-gray-100 flex items-center justify-center px-4">
          <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-6">
            <div className="flex items-center justify-center w-12 h-12 mx-auto bg-red-100 rounded-full mb-4">
              <AlertTriangle className="h-6 w-6 text-red-600" />
            </div>
            
            <h1 className="text-xl font-bold text-gray-900 text-center mb-2">
              Something went wrong
            </h1>
            
            <p className="text-gray-600 text-center mb-6">
              We're sorry, but something unexpected happened. Please try again or contact support if the problem persists.
            </p>

            {process.env.NODE_ENV === 'development' && this.state.error && (
              <div className="mb-6 p-4 bg-gray-100 rounded-lg">
                <h3 className="text-sm font-semibold text-gray-900 mb-2">Error Details:</h3>
                <p className="text-xs text-gray-700 mb-1">
                  <strong>Code:</strong> {this.state.error.code}
                </p>
                <p className="text-xs text-gray-700 mb-1">
                  <strong>Message:</strong> {this.state.error.message}
                </p>
                <p className="text-xs text-gray-700 mb-1">
                  <strong>Time:</strong> {this.state.error.timestamp.toLocaleString()}
                </p>
                {this.state.error.details?.stack && (
                  <details className="mt-2">
                    <summary className="text-xs text-gray-700 cursor-pointer">Stack Trace</summary>
                    <pre className="text-xs text-gray-600 mt-1 overflow-auto max-h-32">
                      {this.state.error.details.stack}
                    </pre>
                  </details>
                )}
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={this.handleRetry}
                className="flex items-center justify-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
              >
                <RefreshCw className="h-4 w-4" />
                Try Again
              </button>
              
              <button
                onClick={this.handleGoHome}
                className="flex items-center justify-center gap-2 bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors"
              >
                <Home className="h-4 w-4" />
                Go Home
              </button>
            </div>

            <div className="mt-6 text-center">
              <p className="text-xs text-gray-500">
                If this problem continues, please contact support with the error details above.
              </p>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Higher-order component for error boundaries
export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  errorBoundaryProps?: Omit<Props, 'children'>
) {
  const WrappedComponent = (props: P) => (
    <ErrorBoundary {...errorBoundaryProps}>
      <Component {...props} />
    </ErrorBoundary>
  );

  WrappedComponent.displayName = `withErrorBoundary(${Component.displayName || Component.name})`;
  
  return WrappedComponent;
}

// Hook for error handling
export function useErrorHandler() {
  const [error, setError] = React.useState<AppError | null>(null);

  const handleError = React.useCallback((error: Error, context?: string) => {
    const appError: AppError = {
      code: 'HOOK_ERROR',
      message: error.message,
      details: {
        stack: error.stack,
        name: error.name,
        context
      },
      timestamp: new Date(),
      component: context || 'useErrorHandler'
    };

    setError(appError);
    console.error('Error handled by useErrorHandler:', appError);
  }, []);

  const clearError = React.useCallback(() => {
    setError(null);
  }, []);

  return {
    error,
    handleError,
    clearError
  };
}
