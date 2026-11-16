import React from 'react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  /** Действие для второй кнопки (например, «Открыть тюнер»); без него — только перезагрузка. */
  onReset?: () => void;
  resetLabel?: string;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Граница ошибок: исключение в рендере любого экрана раньше оставляло пустую
 * страницу без объяснения. Теперь пользователь видит, что произошло, и может
 * перезагрузить страницу или уйти на другой экран.
 *
 * Сбрасывается сменой `key` у родителя — так новая вкладка получает чистую попытку.
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  private handleReset = () => {
    this.setState({ error: null });
    this.props.onReset?.();
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const { onReset, resetLabel = 'Попробовать снова' } = this.props;

    return (
      <div
        role="alert"
        className="panel"
        data-testid="error-boundary"
        style={{
          width: '100%',
          maxWidth: '520px',
          margin: 'var(--s6) auto',
          padding: 'var(--s6)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--s4)',
          textAlign: 'center'
        }}
      >
        <h2 style={{ margin: 0, fontSize: 'var(--fs-subhead)' }}>Что-то пошло не так</h2>
        <p style={{ margin: 0, color: 'var(--ink-300)' }}>
          На этом экране произошла ошибка. Настройки и сохранённые строи не пострадали.
        </p>
        {error.message && (
          <code style={{ fontSize: 'var(--fs-caption)', color: 'var(--ink-300)', wordBreak: 'break-word' }}>
            {error.message}
          </code>
        )}
        <div style={{ display: 'flex', gap: 'var(--s3)', justifyContent: 'center', flexWrap: 'wrap' }}>
          {onReset && (
            <button className="btn btn-ghost" onClick={this.handleReset} data-testid="error-boundary-reset">
              {resetLabel}
            </button>
          )}
          <button
            className="btn btn-primary"
            onClick={() => window.location.reload()}
            data-testid="error-boundary-reload"
          >
            Перезагрузить страницу
          </button>
        </div>
      </div>
    );
  }
}
