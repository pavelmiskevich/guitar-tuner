import { useEffect, useState, useSyncExternalStore } from 'react';
import type { AudioEngineState, AudioEngineStatus, StateCallback } from './audioEngine';
import { sharedAudioEngine } from './audioEngine';
import type { MicIssue } from './micIssue';
import { classifyMicError } from './micIssue';
import { queryMicPermission } from '../domain/micPermission';

export interface Microphone {
  state: AudioEngineState;
  error: Error | null;
  issue: MicIssue | null;
  /** Микрофон захвачен: идёт анализ или пауза. */
  isOn: boolean;
  /** Захвачен, но анализа нет (страница скрыта, система приостановила звук). */
  isPaused: boolean;
  isRequesting: boolean;
  /**
   * Доступ запрещён для сайта насовсем: повторное нажатие не поможет, нужно
   * идти в настройки браузера. Отличает это от «пользователь закрыл запрос».
   */
  isBlocked: boolean;
  /** Включить или снять с паузы. Ошибка не бросается — она в `error`. */
  start: () => Promise<boolean>;
  stop: () => void;
  toggle: () => Promise<void>;
}

const subscribe = (cb: () => void) => sharedAudioEngine.subscribeState(cb as StateCallback);
const getSnapshot = (): AudioEngineStatus => sharedAudioEngine.getStatus();

async function startMicrophone(): Promise<boolean> {
  try {
    await sharedAudioEngine.start();
    return sharedAudioEngine.isCapturing();
  } catch {
    // Ошибка уже лежит в состоянии движка и показывается плашкой.
    return false;
  }
}

function stopMicrophone(): void {
  sharedAudioEngine.stop();
}

async function toggleMicrophone(): Promise<void> {
  if (sharedAudioEngine.isCapturing()) stopMicrophone();
  else await startMicrophone();
}

/**
 * Состояние общего микрофона для экранов.
 *
 * Раньше каждый экран держал свой `isListening`, снятый при монтировании, и
 * не узнавал ни об обрыве потока, ни о выключении с другого экрана: плашка
 * показывала «Микрофон активен», когда микрофона уже не было.
 */
export function useMicrophone(): Microphone {
  const { state, error } = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const issue = classifyMicError(error);

  // Разрешение спрашиваем у браузера только при ошибке. Ответ привязан к
  // конкретной ошибке: для новой он не действует, пока не придёт свой.
  const [permission, setPermission] = useState<{ error: Error; blocked: boolean } | null>(null);
  const needsPermissionCheck = issue === 'denied' || issue === 'interrupted';
  useEffect(() => {
    if (!error || !needsPermissionCheck) return;
    let cancelled = false;
    queryMicPermission().then((result) => {
      if (!cancelled) setPermission({ error, blocked: result === 'denied' });
    });
    return () => {
      cancelled = true;
    };
  }, [error, needsPermissionCheck]);

  const isOn = state === 'running' || state === 'paused';

  return {
    state,
    error,
    issue,
    isOn,
    isPaused: state === 'paused',
    isRequesting: state === 'requesting',
    isBlocked: permission !== null && permission.error === error && permission.blocked,
    start: startMicrophone,
    stop: stopMicrophone,
    toggle: toggleMicrophone
  };
}
