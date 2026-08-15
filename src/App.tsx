import React, { useState, useEffect, useMemo } from 'react';
import type { Tuning } from './domain/tunings';
import { DEFAULT_TUNING, TUNING_PRESETS, loadSavedCustomTunings } from './domain/tunings';
import type { NotationSystem } from './domain/notes';
import type { TabId } from './domain/deepLink';
import { parseTabFromHash, resolveSharedTuning } from './domain/deepLink';
import { readEnumSetting, readNumberSetting } from './domain/storage';
import { TunerScreen } from './features/tuner/TunerScreen';
import { FretboardScreen } from './features/fretboard/FretboardScreen';
import { ChordCheckScreen } from './features/chord-check/ChordCheckScreen';
import { MetronomeScreen } from './features/metronome/MetronomeScreen';
import { EarTrainingScreen } from './features/ear-training/EarTrainingScreen';
import { SettingsModal } from './features/settings/SettingsModal';
import { GitHubMark } from './ui/GitHubMark';
import type { LucideIcon } from 'lucide-react';
import { Activity, Layers, Music, Timer, Sparkles, Settings } from 'lucide-react';

const NOTATION_SYSTEMS = ['english', 'german', 'solfege'] as const;
const THEMES = ['night', 'day'] as const;

/**
 * Единый источник правды для навигации: десктопная панель, мобильный таб-бар и
 * подпись в шапке рисуются из одного списка. Раньше это были три независимых
 * набора строк, и они уже начали расходиться.
 *
 * `short` — для узкого таб-бара, `title` — для подписи в шапке: там уместно
 * полное слово, которое не влезает в кнопку.
 */
const NAV_ITEMS: { id: TabId; icon: LucideIcon; label: string; short: string; title: string }[] = [
  { id: 'tuner', icon: Activity, label: 'Тюнер', short: 'Тюнер', title: 'Тюнер' },
  { id: 'fretboard', icon: Layers, label: 'Гриф', short: 'Гриф', title: 'Гриф' },
  { id: 'chord-check', icon: Music, label: 'Аккорд', short: 'Аккорд', title: 'Аккорды' },
  { id: 'metronome', icon: Timer, label: 'Ритм', short: 'Ритм', title: 'Ритм' },
  { id: 'ear-training', icon: Sparkles, label: 'Тренажер', short: 'Слух', title: 'Тренажер' }
];

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

  // Границы совпадают с теми, что предлагает окно настроек: чужое или устаревшее
  // значение из хранилища не должно уводить расчёт частот в NaN или в бессмыслицу.
  const [a4, setA4] = useState<number>(() => readNumberSetting('gt_a4', { fallback: 440, min: 415, max: 466 }));

  const [notation, setNotation] = useState<NotationSystem>(
    () => readEnumSetting('gt_notation', NOTATION_SYSTEMS, 'english')
  );

  const [inTuneThreshold, setInTuneThreshold] = useState<number>(
    () => readNumberSetting('gt_threshold', { fallback: 5, min: 1, max: 25 })
  );

  const [theme, setTheme] = useState<'night' | 'day'>(() => readEnumSetting('gt_theme', THEMES, 'night'));

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
    if (!currentTuning.isEphemeral) localStorage.setItem('gt_tuning', currentTuning.id);
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

  const activeTitle = NAV_ITEMS.find(item => item.id === activeTab)?.title ?? '';

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
                {activeTitle} · {currentTuning.name} · A4={a4}Hz
              </span>
            </div>
          </div>

          {/* Навигация на десктопе (скрыта на мобильных) */}
          <nav className="desktop-nav">
            {NAV_ITEMS.map(({ id, icon: Icon, label }) => (
              <button
                key={id}
                id={`nav-desktop-${id}`}
                className={`btn btn-sm ${activeTab === id ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setActiveTab(id)}
                data-testid={`nav-desktop-${id}`}
              >
                <Icon size={15} /> {label}
              </button>
            ))}
          </nav>

          {/* Правая колонка: Кнопка настроек */}
          <div className="header-right">
            <a
              id="github-link"
              className="btn btn-ghost btn-sm"
              href="https://github.com/pavelmiskevich/guitar-tuner"
              target="_blank"
              rel="noopener noreferrer"
              style={{ padding: '8px 12px' }}
              title="Исходный код на GitHub"
              aria-label="Открыть исходный код на GitHub"
              data-testid="github-link"
            >
              <GitHubMark size={18} />
              <span className="github-link-label">GitHub</span>
            </a>
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
        {NAV_ITEMS.map(({ id, icon: Icon, short }) => (
          <button
            key={id}
            id={`nav-mobile-${id}`}
            onClick={() => setActiveTab(id)}
            data-testid={`nav-mobile-${id}`}
            style={{
              flex: 1,
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '2px',
              color: activeTab === id ? 'var(--brand)' : 'var(--ink-300)',
              fontSize: '11px',
              fontWeight: activeTab === id ? 700 : 500
            }}
          >
            <Icon size={18} />
            <span>{short}</span>
          </button>
        ))}
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
