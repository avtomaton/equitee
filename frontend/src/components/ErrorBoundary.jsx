import React from 'react';

/**
 * ErrorBoundary — catches React component errors and displays graceful fallback
 * Prevents entire app crash from component errors
 */
export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorCount: 0,
    };
  }

  static getDerivedStateFromError(_error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    this.setState(prevState => ({
      error,
      errorInfo,
      errorCount: prevState.errorCount + 1,
    }));
    console.error('Error caught by boundary:', error, errorInfo);
  }

  resetError = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary">
          <div className="error-boundary-title">⚠️ Something went wrong</div>
          <p className="error-boundary-message">
            An error occurred in this component. The app is still working — try the action below.
          </p>
          {this.state.errorCount > 3 && (
            <p className="error-boundary-warning">
              ⚡ Multiple errors detected. Try refreshing the page if this persists.
            </p>
          )}
          <button
            className="btn error-boundary-retry"
            onClick={this.resetError}
          >
            Try Again
          </button>
          {import.meta.env.DEV && (
            <details className="error-boundary-details">
              <summary>Error details (dev only)</summary>
              <pre>
                {this.state.error && this.state.error.toString()}
                {'\n\n'}
                {this.state.errorInfo && this.state.errorInfo.componentStack}
              </pre>
            </details>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;