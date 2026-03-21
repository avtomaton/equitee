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

  static getDerivedStateFromError(error) {
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
        <div style={{
          padding: '3rem 2rem',
          backgroundColor: 'var(--bg-secondary)',
          borderRadius: '12px',
          margin: '2rem',
          border: '1px solid var(--danger)',
        }}>
          <div style={{
            fontSize: '2rem',
            color: 'var(--danger)',
            marginBottom: '1rem',
            fontWeight: 'bold',
          }}>
            ⚠️ Something went wrong
          </div>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>
            An error occurred in this component. The app is still working — try the action below.
          </p>
          {this.state.errorCount > 3 && (
            <p style={{ color: 'var(--warning)', marginBottom: '1rem', fontSize: '0.9rem' }}>
              ⚡ Multiple errors detected. Try refreshing the page if this persists.
            </p>
          )}
          <button
            onClick={this.resetError}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: 'var(--accent-primary)',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: '600',
              fontSize: '0.875rem',
            }}
          >
            Try Again
          </button>
          {process.env.NODE_ENV === 'development' && (
            <details style={{ marginTop: '1.5rem', fontSize: '0.85rem' }}>
              <summary style={{ cursor: 'pointer', color: 'var(--text-tertiary)' }}>
                Error details (dev only)
              </summary>
              <pre style={{
                backgroundColor: 'var(--bg-primary)',
                padding: '1rem',
                borderRadius: '6px',
                overflow: 'auto',
                marginTop: '0.5rem',
                color: 'var(--danger)',
              }}>
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