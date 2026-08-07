import React, { useState, useEffect } from 'react';
import type { Tuning } from './domain/tunings';
import { DEFAULT_TUNING, TUNING_PRESETS, loadSavedCustomTunings } from './domain/tunings';
import type { NotationSystem } from './domain/notes';
import { TunerScreen } from './features/tuner/TunerScreen';
import { FretboardScreen } from './features/fretboard/FretboardScreen';
import { ChordCheckScreen } from './features/chord-check/ChordCheckScreen';
import { MetronomeScreen } from './features/metronome/MetronomeScreen';
import { EarTrainingScreen } from './features/ear-training/EarTrainingScreen';
import { SettingsModal } from './features/settings/SettingsModal';
import { Activity, Layers, Music, Timer, Sparkles, Settings } from 'lucide-react';

type TabId = 'tuner' | 'fretboard' | 'chord-check' | 'metronome' | 'ear-training';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabId>('tuner');
  const [currentTuning, setCurrentTuning] = useState<Tuning>(() => {
    const saved = localStorage.getItem('gt_tuning');
    const all = [...TUNING_PRESETS, ...loadSavedCustomTunings()];
    if (saved) {
      const found = all.find(t => t.id === saved);
      if (found) return found;
    }
    return DEFAULT_TUNING;
  });

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
    localStorage.setItem('gt_tuning', currentTuning.id);
  }, [currentTuning]);

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
      <header
        style={{
          height: '60px',
          borderBottom: '1px solid var(--ink-700)',
          background: 'var(--ink-900)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 var(--s6)',
          position: 'sticky',
          top: 0,
          zIndex: 100
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '24px' }}>🎸</span>
          <div>
            <h1 style={{ fontSize: '16px', fontWeight: 800, margin: 0, letterSpacing: '-0.02em' }}>
              Ночная репетиция
            </h1>
            <span style={{ fontSize: '11px', color: 'var(--ink-300)', display: 'block' }}>
              Тюнер & Гриф · {currentTuning.name} · A4={a4}Hz
            </span>
          </div>
        </div>

        {/* Навигация на десктопе */}
        <nav style={{ display: 'flex', gap: '6px' }} className="desktop-nav">
          <button
            className={`btn btn-sm ${activeTab === 'tuner' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setActiveTab('tuner')}
          >
            <Activity size={15} /> Тюнер
          </button>
          <button
            className={`btn btn-sm ${activeTab === 'fretboard' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setActiveTab('fretboard')}
          >
            <Layers size={15} /> Гриф
          </button>
          <button
            className={`btn btn-sm ${activeTab === 'chord-check' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setActiveTab('chord-check')}
          >
            <Music size={15} /> Аккорд
          </button>
          <button
            className={`btn btn-sm ${activeTab === 'metronome' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setActiveTab('metronome')}
          >
            <Timer size={15} /> Ритм
          </button>
          <button
            className={`btn btn-sm ${activeTab === 'ear-training' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setActiveTab('ear-training')}
          >
            <Sparkles size={15} /> Тренажер
          </button>
        </nav>

        {/* Кнопка настроек */}
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => setIsSettingsOpen(true)}
          style={{ padding: '8px 12px' }}
          title="Настройки"
        >
          <Settings size={18} />
        </button>
      </header>

      {/* Основной контент */}
      <main
        style={{
          flex: 1,
          padding: 'var(--s6) var(--s4) calc(var(--s12) + 40px) var(--s4)',
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
      <nav
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          height: '64px',
          background: 'var(--ink-900)',
          borderTop: '1px solid var(--ink-700)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-around',
          zIndex: 100,
          paddingBottom: 'env(safe-area-inset-bottom, 0px)'
        }}
      >
        <button
          onClick={() => setActiveTab('tuner')}
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
          onClick={() => setActiveTab('fretboard')}
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
          onClick={() => setActiveTab('chord-check')}
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
          onClick={() => setActiveTab('metronome')}
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
          onClick={() => setActiveTab('ear-training')}
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
        onCustomTuningCreated={(tuning) => setCurrentTuning(tuning)}
      />
    </div>
  );
};

export default App;
