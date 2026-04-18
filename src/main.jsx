import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';

class RootErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div
        style={{
          minHeight: '100vh',
          padding: '24px 20px',
          background: '#F5F0E8',
          color: '#1B3A2D',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <div style={{ fontSize: 12, letterSpacing: 2, textTransform: 'uppercase', opacity: 0.6, marginBottom: 10 }}>
            App error
          </div>
          <h1 style={{ margin: '0 0 12px', fontSize: 28 }}>The app hit a runtime error</h1>
          <p style={{ margin: '0 0 16px', lineHeight: 1.5 }}>
            Reload the page once. If it still fails, the error text below is the problem to fix.
          </p>
          <pre
            style={{
              whiteSpace: 'pre-wrap',
              overflowWrap: 'anywhere',
              background: 'white',
              borderRadius: 12,
              padding: 16,
              border: '1px solid #ddd4c8',
            }}
          >
            {String(this.state.error?.stack || this.state.error?.message || this.state.error)}
          </pre>
        </div>
      </div>
    );
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  </React.StrictMode>
);
