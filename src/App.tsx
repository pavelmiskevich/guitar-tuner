import React, { useState, useEffect, useMemo } from 'react';
import type { Tuning } from './domain/tunings';
import { DEFAULT_TUNING, TUNING_PRESETS, loadSavedCustomTunings } from './domain/tunings';
import type { NotationSystem } from './domain/notes';
import type { TabId } from './domain/deepLink';
import { parseTabFromHash, resolveSharedTuning } from './domain/deepLink';
import { TunerScreen } from './features/tuner/TunerScreen';
import { FretboardScreen } from './features/fretboard/FretboardScreen';
import { ChordCheckScreen } from './features/chord-check/ChordCheckScreen';
import { MetronomeScreen } from './features/metronome/MetronomeScreen';
import { EarTrainingScreen } from './features/ear-training/EarTrainingScreen';
import { SettingsModal } from './features/settings/SettingsModal';
import { Activity, Layers, Music, Timer, Sparkles, Settings } from 'lucide-react';

const initialHash = typeof window !== 'undefined' ? window.location.hash : '';

/** Строй из deep link имеет приоритет над сохранённым: ссылка описывает чужую схему. */
function resolveInitialTuning(): Tuning {
  const saved = loadSavedCustomTunings();
  const all = [...TUNING_PRESETS, ...saved];

  const shared = resolveSharedTuning(initialHash, all);
  if (shared) return shared;

  const savedId = localStorage.getItem('gt_tuning');
  if (savedId) {
    const found = all.find(t => t.id === savedId);
    if (found) return found;
  }
  return DEFAULT_TUNING;
}

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabId>(() => parseTabFromHash(initialHash) ?? 'tuner');
  const [currentTuning, setCurrentTuning] = useState<Tuning>(resolveInitialTuning);
  const [customTunings, setCustomTunings] = useState<Tuning[]>(() => {
    const saved = loadSavedCustomTunings();
    // Строй, пришедший ссылкой, должен быть виден в селекторах, хотя у получателя не сохранён.
    const shared = resolveSharedTuning(initialHash, [...TUNING_PRESETS, ...saved]);
    if (shared?.isCustom && !saved.some(t => t.id === shared.id)) return [...saved, shared];
    return saved;
  });

  // Пресеты и пользовательские строи в одном списке: селектор тюнера должен
  // показывать оба, иначе сохранённый строй нельзя выбрать повторно.
  const availableTunings = useMemo(
    () => [...TUNING_PRESETS, ...customTunings],
    [customTunings]
  );

  const [a4, setA4] = useState<number>(() => {
    const saved = localStorage.getItem('gt_a4');
    return saved ? Number(saved) : 440;
  });

  const [notation, setNotation] = useState<NotationSystem>(() => {
    const saved = localStorage.getItem('gt_notation');
    return (saved as NotationSystem) || 'english';
  });

  const [inTuneThreshold, setInTuneThreshold] = useState<number>(() => {
    const saved = localStorage.getItem('gt_threshold');
    return saved ? Number(saved) : 5;
  });

  const [theme, setTheme] = useState<'night' | 'day'>(() => {
    const saved = localStorage.getItem('gt_theme');
    return (saved as 'night' | 'day') || 'night';
  });

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [lockedStringIndex, setLockedStringIndex] = useState<number | null>(null);

  // Синхронизация темы в DOM
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('gt_theme', theme);
  }, [theme]);

  useEffect(() => {
    // Строй из ссылки живёт только в этой сессии: перезаписав им gt_tuning, мы бы
    // потеряли сохранённый выбор получателя (восстановить его было бы неоткуда).
    const isPersisted =
      TUNING_PRESETS.some(t => t.id === currentTuning.id) ||
      loadSavedCustomTunings().some(t => t.id === currentTuning.id);
    if (isPersisted) localStorage.setItem('gt_tuning', currentTuning.id);
  }, [currentTuning]);

  // Вкладку держим в адресе, чтобы ссылку можно было скопировать прямо из браузера.
  // Гриф пишет хэш сам — там в него уходит вся схема (см. FretboardScreen).
  useEffect(() => {
    if (activeTab === 'fretboard') return;
    window.history.replaceState(null, '', `${window.location.pathname}#tab=${activeTab}`);
  }, [activeTab]);

  useEffect(() => {
    localStorage.setItem('gt_a4', String(a4));
  }, [a4]);

  useEffect(() => {
    localStorage.setItem('gt_notation', notation);
  }, [notation]);

  useEffect(() => {
    localStorage.setItem('gt_threshold', String(inTuneThreshold));
  }, [inTuneThreshold]);

  const handleGoTuneString = (stringIndex: number) => {
    setLockedStringIndex(stringIndex);
    setActiveTab('tuner');
  };

  return (
    <div
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--ink-950)',
        color: 'var(--ink-050)'
      }}
    >
      {/* Верхняя панель (Header) */}
      <header className="app-header">
        <div className="header-inner">
          <div className="header-brand">
            <span className="brand-icon">🎸</span>
            <div className="brand-text">
              <h1 className="brand-title">
                Ночная репетиция
              </h1>
              <span className="brand-subtitle" data-testid="header-subtitle">
                {activeTab === 'tuner' ? 'Тюнер' : activeTab === 'fretboard' ? 'Гриф' : activeTab === 'chord-check' ? 'Аккорды' : activeTab === 'metronome' ? 'Ритм' : 'Тренажер'} · {currentTuning.name} · A4={a4}Hz
              </span>
            </div>
          </div>

          {/* Навигация на десктопе (скрыта на мобильных) */}
          <nav className="desktop-nav">
            <button
              id="nav-desktop-tuner"
              className={`btn btn-sm ${activeTab === 'tuner' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setActiveTab('tuner')}
              data-testid="nav-desktop-tuner"
            >
              <Activity size={15} /> Тюнер
            </button>
            <button
              id="nav-desktop-fretboard"
              className={`btn btn-sm ${activeTab === 'fretboard' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setActiveTab('fretboard')}
              data-testid="nav-desktop-fretboard"
            >
              <Layers size={15} /> Гриф
            </button>
            <button
              id="nav-desktop-chord-check"
              className={`btn btn-sm ${activeTab === 'chord-check' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setActiveTab('chord-check')}
              data-testid="nav-desktop-chord-check"
            >
              <Music size={15} /> Аккорд
            </button>
            <button
              id="nav-desktop-metronome"
              className={`btn btn-sm ${activeTab === 'metronome' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setActiveTab('metronome')}
              data-testid="nav-desktop-metronome"
            >
              <Timer size={15} /> Ритм
            </button>
            <button
              id="nav-desktop-ear-training"
              className={`btn btn-sm ${activeTab === 'ear-training' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setActiveTab('ear-training')}
              data-testid="nav-desktop-ear-training"
            >
              <Sparkles size={15} /> Тренажер
            </button>
          </nav>

          {/* Правая колонка: Кнопка настроек */}
          <div className="header-right">
            <button
              id="settings-open"
              className="btn btn-ghost btn-sm"
              onClick={() => setIsSettingsOpen(true)}
              style={{ padding: '8px 12px' }}
              title="Настройки"
              aria-label="Открыть настройки"
              data-testid="settings-open"
            >
              <Settings size={18} />
            </button>
          </div>
        </div>
      </header>

      {/* Основной контент */}
      <main
        className="app-main"
        style={{
          flex: 1,
          padding: 'var(--s6) var(--s4)',
          maxWidth: '1200px',
          margin: '0 auto',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center'
        }}
      >
        {activeTab === 'tuner' && (
          <TunerScreen
            tuning={currentTuning}
            availableTunings={availableTunings}
            onTuningChange={setCurrentTuning}
            a4={a4}
            notation={notation}
            inTuneThreshold={inTuneThreshold}
            lockedStringIndex={lockedStringIndex}
            onSelectString={setLockedStringIndex}
          />
        )}

        {activeTab === 'fretboard' && (
          <FretboardScreen
            tuning={currentTuning}
            notation={notation}
            a4={a4}
          />
        )}

        {activeTab === 'chord-check' && (
          <ChordCheckScreen
            tuning={currentTuning}
            notation={notation}
            a4={a4}
            inTuneThreshold={inTuneThreshold}
            onGoTuneString={handleGoTuneString}
          />
        )}

        {activeTab === 'metronome' && (
          <MetronomeScreen />
        )}

        {activeTab === 'ear-training' && (
          <EarTrainingScreen
            tuning={currentTuning}
            notation={notation}
            a4={a4}
          />
        )}
      </main>

      {/* Нижний таб-бар для мобильных устройств */}
      <nav className="mobile-bottom-nav">
        <button
          id="nav-mobile-tuner"
          onClick={() => setActiveTab('tuner')}
          data-testid="nav-mobile-tuner"
          style={{
            flex: 1,
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '2px',
            color: activeTab === 'tuner' ? 'var(--brand)' : 'var(--ink-300)',
            fontSize: '11px',
            fontWeight: activeTab === 'tuner' ? 700 : 500
          }}
        >
          <Activity size={18} />
          <span>Тюнер</span>
        </button>

        <button
          id="nav-mobile-fretboard"
          onClick={() => setActiveTab('fretboard')}
          data-testid="nav-mobile-fretboard"
          style={{
            flex: 1,
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '2px',
            color: activeTab === 'fretboard' ? 'var(--brand)' : 'var(--ink-300)',
            fontSize: '11px',
            fontWeight: activeTab === 'fretboard' ? 700 : 500
          }}
        >
          <Layers size={18} />
          <span>Гриф</span>
        </button>

        <button
          id="nav-mobile-chord-check"
          onClick={() => setActiveTab('chord-check')}
          data-testid="nav-mobile-chord-check"
          style={{
            flex: 1,
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '2px',
            color: activeTab === 'chord-check' ? 'var(--brand)' : 'var(--ink-300)',
            fontSize: '11px',
            fontWeight: activeTab === 'chord-check' ? 700 : 500
          }}
        >
          <Music size={18} />
          <span>Аккорд</span>
        </button>

        <button
          id="nav-mobile-metronome"
          onClick={() => setActiveTab('metronome')}
          data-testid="nav-mobile-metronome"
          style={{
            flex: 1,
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '2px',
            color: activeTab === 'metronome' ? 'var(--brand)' : 'var(--ink-300)',
            fontSize: '11px',
            fontWeight: activeTab === 'metronome' ? 700 : 500
          }}
        >
          <Timer size={18} />
          <span>Ритм</span>
        </button>

        <button
          id="nav-mobile-ear-training"
          onClick={() => setActiveTab('ear-training')}
          data-testid="nav-mobile-ear-training"
          style={{
            flex: 1,
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '2px',
            color: activeTab === 'ear-training' ? 'var(--brand)' : 'var(--ink-300)',
            fontSize: '11px',
            fontWeight: activeTab === 'ear-training' ? 700 : 500
          }}
        >
          <Sparkles size={18} />
          <span>Слух</span>
        </button>
      </nav>

      {/* Модальное окно настроек */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        a4={a4}
        onA4Change={setA4}
        notation={notation}
        onNotationChange={setNotation}
        inTuneThreshold={inTuneThreshold}
        onThresholdChange={setInTuneThreshold}
        theme={theme}
        onThemeChange={setTheme}
        onCustomTuningCreated={(tuning) => {
          setCustomTunings(loadSavedCustomTunings());
          setCurrentTuning(tuning);
        }}
        onCustomTuningDeleted={(id) => {
          setCustomTunings(loadSavedCustomTunings());
          // Удалили активный строй — откатываемся на стандартный, иначе тюнер
          // остался бы настроен на то, чего больше нет в списке.
          setCurrentTuning((prev) => (prev.id === id ? DEFAULT_TUNING : prev));
        }}
      />
    </div>
  );
};

export default App;
