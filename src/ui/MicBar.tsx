import React, { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Play } from 'lucide-react';
import type { Microphone } from '../audio/useMicrophone';
import { MicInterruptedError } from '../audio/audioEngine';
import { getMicPermissionHelp } from '../domain/micPermission';
import { copyToClipboard } from './clipboard';

interface MicBarTestIds {
  /** Крупная кнопка включения. */
  start?: string;
  /** Плашка включённого микрофона. */
  status?: string;
  /** Кнопка выключения на плашке. */
  stop?: string;
}

interface MicBarProps {
  mic: Microphone;
  startLabel?: string;
  activeLabel?: string;
  testIds?: MicBarTestIds;
  /** Дополнительное содержимое плашки включённого микрофона (например, VU-метр). */
  children?: React.ReactNode;
}

/**
 * Плашка микрофона: крупная кнопка до включения, компактный статус после.
 *
 * Раньше разметка и логика включения были продублированы в тюнере и проверке
 * аккорда, и копии расходились: проверка аккорда при отказе в доступе писала
 * только в консоль, и кнопка просто «не нажималась».
 */
export const MicBar: React.FC<MicBarProps> = ({
  mic,
  startLabel = 'Включить микрофон',
  activeLabel = 'Микрофон активен',
  testIds = {},
  children
}) => {
  if (!mic.isOn) {
    return (
      <button
        className="btn btn-primary"
        onClick={() => void mic.start()}
        disabled={mic.isRequesting}
        aria-busy={mic.isRequesting}
        data-testid={testIds.start}
        style={{
          width: '100%',
          padding: '16px 24px',
          fontSize: '17px',
          fontWeight: 800,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '10px',
          boxShadow: '0 4px 20px var(--shadow-brand)'
        }}
      >
        <Mic size={22} /> {mic.isRequesting ? 'Ждём разрешения на микрофон…' : startLabel}
      </button>
    );
  }

  return (
    <div
      data-testid={testIds.status}
      data-state={mic.state}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 16px',
        background: 'var(--ink-900)',
        border: '1px solid var(--ink-700)',
        borderRadius: 'var(--r-pill)',
        gap: '12px'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span className="mic-dot" data-state={mic.state} />
        <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink-100)' }}>
          {/* Пауза — честно: оценки сейчас не приходят. */}
          {mic.isPaused ? 'Микрофон на паузе' : activeLabel}
        </span>
      </div>

      {!mic.isPaused && children}

      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        {mic.isPaused && (
          <button
            className="btn btn-ghost btn-sm"
            data-testid="mic-resume"
            onClick={() => void mic.start()}
            style={{ padding: '4px 10px', fontSize: '12px' }}
            title="Продолжить анализ"
          >
            <Play size={14} /> Продолжить
          </button>
        )}
        <button
          className="btn btn-ghost btn-sm"
          data-testid={testIds.stop}
          onClick={mic.stop}
          style={{ padding: '4px 10px', fontSize: '12px', color: 'var(--ink-300)', borderColor: 'var(--ink-700)' }}
          title="Остановить микрофон"
        >
          <MicOff size={14} /> Выкл
        </button>
      </div>
    </div>
  );
};

/** Заголовок и пояснение для каждого вида проблемы. */
function describeIssue(mic: Microphone): { title: string; text: string } {
  const { error, issue, isBlocked } = mic;
  const message = error?.message ?? '';

  switch (issue) {
    case 'denied':
      return {
        title: 'Нет доступа к микрофону',
        text: isBlocked
          ? 'Доступ запрещён для этого сайта — повторное нажатие кнопки не поможет, разрешение снимается только в браузере.'
          : `${message}. Разрешите доступ, когда браузер спросит.`
      };
    case 'interrupted': {
      if (isBlocked) {
        return {
          title: 'Микрофон отключился',
          text: 'Доступ к микрофону для этого сайта отозван — включить его снова можно только в настройках браузера.'
        };
      }
      const reason = error instanceof MicInterruptedError ? error.reason : 'ended';
      const text =
        reason === 'background'
          ? 'Приложение долго было в фоне, и микрофон выключен, чтобы не держать его зря. Включите его снова, когда понадобится.'
          : reason === 'closed'
            ? 'Система остановила звук — например, из-за звонка. Включите микрофон снова.'
            : 'Поток оборвался: микрофон или гарнитуру отключили, его занял звонок или доступ отозван. Проверьте подключение и включите микрофон снова.';
      return { title: 'Микрофон отключился', text };
    }
    case 'busy':
      return {
        title: 'Микрофон занят',
        text: 'Его использует другое приложение или вкладка. Освободите микрофон и попробуйте снова.'
      };
    case 'not-found':
      return {
        title: 'Микрофон не найден',
        text: 'Подключите микрофон или гарнитуру и попробуйте снова.'
      };
    case 'unsupported':
      return {
        title: 'Микрофон недоступен',
        text: 'Браузер не даёт доступ к микрофону на этой странице. Откройте сайт по HTTPS в обычном браузере, а не во встроенном в другое приложение.'
      };
    default:
      return {
        title: 'Не удалось включить микрофон',
        text: message ? `${message}. Попробуйте ещё раз.` : 'Попробуйте ещё раз.'
      };
  }
}

/**
 * Что случилось с микрофоном и что с этим делать. Показывается на каждом
 * экране, где микрофон включается, — раньше ошибку видел только тюнер.
 */
export const MicErrorBanner: React.FC<{ mic: Microphone; testId?: string }> = ({ mic, testId = 'mic-error' }) => {
  if (mic.state !== 'error' || !mic.error) return null;

  const { title, text } = describeIssue(mic);
  // Путь к настройкам нужен, когда мешает именно разрешение.
  const showPermissionHelp = mic.issue === 'denied' || (mic.issue === 'interrupted' && mic.isBlocked);

  return (
    <div className="banner err mic-alert" role="alert" data-testid={testId} data-issue={mic.issue ?? undefined}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <b>{title}</b>
        <span>{text}</span>
        {showPermissionHelp && <MicPermissionHelpBlock />}
      </div>
    </div>
  );
};

const MicPermissionHelpBlock: React.FC = () => {
  const [help] = useState(getMicPermissionHelp);
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current);
    };
  }, []);

  const copySettingsUrl = async () => {
    if (!help.settingsUrl) return;
    const ok = await copyToClipboard(help.settingsUrl);
    setCopied(ok);
    if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current);
    if (ok) copyTimerRef.current = window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      <span data-testid="mic-help-quick">
        <b>Быстрее всего:</b> {help.quickStep}
      </span>

      <span style={{ color: 'var(--ink-300)' }}>
        Или через настройки: {help.settingsPath}
      </span>

      {help.settingsUrl && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <code
            data-testid="mic-settings-url"
            style={{
              background: 'var(--ink-900)',
              border: '1px solid var(--ink-700)',
              borderRadius: 'var(--r-sm)',
              padding: '4px 8px',
              fontFamily: 'var(--font-num)',
              fontSize: '12px'
            }}
          >
            {help.settingsUrl}
          </code>
          <button className="btn btn-ghost btn-sm" data-testid="mic-copy-settings" onClick={copySettingsUrl}>
            {copied ? 'Скопировано ✓' : 'Скопировать адрес'}
          </button>
          <span style={{ fontSize: '11px', color: 'var(--ink-300)' }}>
            Вставьте в адресную строку новой вкладки — по ссылке браузер такие
            адреса не открывает.
          </span>
        </div>
      )}
    </>
  );
};
