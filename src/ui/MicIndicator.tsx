import React from 'react';
import { MicOff } from 'lucide-react';
import { useMicrophone } from '../audio/useMicrophone';

/**
 * Индикатор включённого микрофона в шапке.
 *
 * Движок общий и переживает смену вкладок — так задумано, чтобы тюнер и
 * проверка аккорда не спрашивали разрешение заново. Но на «Грифе» и «Ритме»
 * микрофон не нужен, а раньше там не было ни индикации, ни кнопки выключения:
 * узнать, что приложение всё ещё слушает, можно было только по значку браузера.
 */
export const MicIndicator: React.FC = () => {
  const mic = useMicrophone();
  if (!mic.isOn) return null;

  const label = mic.isPaused ? 'Микрофон на паузе' : 'Микрофон включён';

  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm header-mic"
      data-testid="header-mic"
      data-state={mic.state}
      onClick={mic.stop}
      title={`${label}. Нажмите, чтобы выключить`}
      aria-label={`${label}. Выключить микрофон`}
    >
      <span className="mic-dot" data-state={mic.state} aria-hidden="true" />
      <span className="header-mic-label">{mic.isPaused ? 'Пауза' : 'Микрофон'}</span>
      <MicOff size={16} aria-hidden="true" />
    </button>
  );
};
