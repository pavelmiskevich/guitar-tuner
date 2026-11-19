import React, { useState, useEffect, useMemo } from 'react';
import type { Tuning } from './domain/tunings';
import { DEFAULT_TUNING, TUNING_PRESETS, loadSavedCustomTunings, pitchSearchRange } from './domain/tunings';
import { sharedAudioEngine } from './audio/audioEngine';
import type { NotationSystem } from './domain/notes';
import type { TabId } from './domain/deepLink';
import { parseTabFromHash, resolveSharedTuning, urlWithHash } from './domain/deepLink';
import { STORAGE_KEYS, readEnumSetting, readNumberSetting, readSetting, writeSetting } from './domain/storage';
import { TunerScreen } from './features/tuner/TunerScreen';
import { FretboardScreen } from './features/fretboard/FretboardScreen';
import { ChordCheckScreen } from './features/chord-check/ChordCheckScreen';
import { MetronomeScreen } from './features/metronome/MetronomeScreen';
import { EarTrainingScreen } from './features/ear-training/EarTrainingScreen';
import { SettingsModal } from './features/settings/SettingsModal';
import { GitHubMark } from './ui/GitHubMark';
import { ErrorBoundary } from './ui/ErrorBoundary';
import { MicIndicator } from './ui/MicIndicator';
import type { LucideIcon } from 'lucide-react';
import { Activity, Layers, Music, Timer, Sparkles, Settings } from 'lucide-react';

const NOTATION_SYSTEMS = ['english', 'german', 'solfege'] as const;
const THEMES = ['night', 'day'] as const;
type Theme = (typeof THEMES)[number];

/**
 * Тема при первом запуске — по настройке системы, дальше — выбор пользователя.
 * Раньше всегда стартовала «Ночь», даже на телефоне со светлой темой.
 * Та же логика продублирована в index.html: там тема ставится до загрузки
 * бандла, чтобы дневная тема не мигала ночной.
 */
function initialTheme(): Theme {
  const prefersLight =
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: light)').matches;
  return readEnumSetting(STORAGE_KEYS.theme, THEMES, prefersLight ? 'day' : 'night');
}

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

/** Строй, пришедший ссылкой и у получателя не сохранённый (или null). */
function ephemeralLinkTuning(hash: string): Tuning | null {
  const shared = resolveSharedTuning(hash, [...TUNING_PRESETS, ...loadSavedCustomTunings()]);
  return shared?.isEphemeral ? shared : null;
}

/** Строй из deep link имеет приоритет над сохранённым: ссылка описывает чужую схему. */
function resolveInitialTuning(): Tuning {
  const saved = loadSavedCustomTunings();
  const all = [...TUNING_PRESETS, ...saved];

  const shared = resolveSharedTuning(initialHash, all);
  if (shared) return shared;

  const savedId = readSetting(STORAGE_KEYS.tuning);
  if (savedId) {
    const found = all.find(t => t.id === savedId);
    if (found) return found;
  }
  return DEFAULT_TUNING;
}

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabId>(() => parseTabFromHash(initialHash) ?? 'tuner');
  const [currentTuning, setCurrentTuning] = useState<Tuning>(resolveInitialTuning);
  const [customTunings, setCustomTunings] = useState<Tuning[]>(loadSavedCustomTunings);
  // Строй из ссылки держим отдельно от сохранённых: список сохранённых
  // перечитывается из хранилища после создания и удаления строя, и раньше
  // «Строй из ссылки» при этом пропадал из селектора, оставаясь активным (#13).
  const [linkTuning, setLinkTuning] = useState<Tuning | null>(() => ephemeralLinkTuning(initialHash));

  // Пресеты и пользовательские строи в одном списке: селектор тюнера должен
  // показывать оба, иначе сохранённый строй нельзя выбрать повторно.
  const availableTunings = useMemo(
    () => [
      ...TUNING_PRESETS,
      ...customTunings,
      ...(linkTuning && !customTunings.some(t => t.id === linkTuning.id) ? [linkTuning] : [])
    ],
    [customTunings, linkTuning]
  );

  /**
   * Счётчик перехода по ссылке: экран грифа читает схему из хэша при
   * монтировании, и новый ключ заставляет его прочитать её заново.
   */
  const [linkNavigation, setLinkNavigation] = useState(0);

  // Границы совпадают с теми, что предлагает окно настроек: чужое или устаревшее
  // значение из хранилища не должно уводить расчёт частот в NaN или в бессмыслицу.
  const [a4, setA4] = useState<number>(() => readNumberSetting(STORAGE_KEYS.a4, { fallback: 440, min: 415, max: 466 }));

  const [notation, setNotation] = useState<NotationSystem>(
    () => readEnumSetting(STORAGE_KEYS.notation, NOTATION_SYSTEMS, 'english')
  );

  const [inTuneThreshold, setInTuneThreshold] = useState<number>(
    () => readNumberSetting(STORAGE_KEYS.threshold, { fallback: 5, min: 1, max: 25 })
  );

  const [theme, setTheme] = useState<Theme>(initialTheme);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [lockedStringIndex, setLockedStringIndex] = useState<number | null>(null);

  // Синхронизация темы в DOM
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    writeSetting(STORAGE_KEYS.theme, theme);
    // Строка состояния на Android и в установленном PWA красится по theme-color:
    // без этого в теме «День» над белой страницей висела тёмная полоса.
    const background = getComputedStyle(document.documentElement).getPropertyValue('--ink-950').trim();
    if (background) document.querySelector('meta[name="theme-color"]')?.setAttribute('content', background);
  }, [theme]);

  useEffect(() => {
    // Строй из ссылки живёт только в этой сессии: перезаписав им gt_tuning, мы бы
    // потеряли сохранённый выбор получателя (восстановить его было бы неоткуда).
    if (!currentTuning.isEphemeral) writeSetting(STORAGE_KEYS.tuning, currentTuning.id);
  }, [currentTuning]);

  // Детектор ищет основной тон в диапазоне текущего строя: для баса граница
  // опускается ниже 40 Гц, иначе B0 и спущенная E1 не определяются (#1).
  useEffect(() => {
    sharedAudioEngine.setPitchRange(pitchSearchRange(currentTuning, a4));
  }, [currentTuning, a4]);

  // Выбранная струна не должна пережить переход на строй, где её нет
  // (гитара → бас): тюнер держал бы приоритет на несуществующем индексе.
  const stringCount = currentTuning.strings.length;
  useEffect(() => {
    setLockedStringIndex((idx) => (idx !== null && idx >= stringCount ? null : idx));
  }, [stringCount]);

  /**
   * Смена вкладки пользователем — новая запись истории, чтобы работали «Назад»
   * и «Вперёд» (раньше вкладки писались через replaceState). Запись добавляется
   * здесь, а не в эффекте: эффекты дочерних компонентов срабатывают раньше, и
   * гриф успел бы записать свою схему поверх записи предыдущей вкладки.
   * Дальше гриф обновляет хэш сам — в своей записи, через replaceState.
   */
  const navigateTab = (tab: TabId) => {
    if (tab === activeTab) return;
    window.history.pushState(null, '', urlWithHash(window.location, `tab=${tab}`));
    setActiveTab(tab);
  };

  // Ссылка, вставленная в адресную строку уже открытого приложения, и переход
  // «Назад/Вперёд» меняют только хэш — страница не перезагружается. Раньше хэш
  // читался один раз при загрузке, и такая ссылка ничего не делала (#13).
  // На один переход могут прийти и popstate, и hashchange: обработка
  // идемпотентна, повтор лишь ещё раз перечитает ту же схему.
  useEffect(() => {
    const applyHash = () => {
      const hash = window.location.hash;
      const tab = parseTabFromHash(hash) ?? 'tuner';
      setActiveTab(tab);

      const saved = loadSavedCustomTunings();
      const shared = resolveSharedTuning(hash, [...TUNING_PRESETS, ...saved]);
      if (shared) {
        if (shared.isEphemeral) setLinkTuning(shared);
        setCurrentTuning(shared);
      }
      if (tab === 'fretboard') setLinkNavigation(n => n + 1);
    };

    window.addEventListener('hashchange', applyHash);
    window.addEventListener('popstate', applyHash);
    return () => {
      window.removeEventListener('hashchange', applyHash);
      window.removeEventListener('popstate', applyHash);
    };
  }, []);

  useEffect(() => {
    writeSetting(STORAGE_KEYS.a4, String(a4));
  }, [a4]);

  useEffect(() => {
    writeSetting(STORAGE_KEYS.notation, notation);
  }, [notation]);

  useEffect(() => {
    writeSetting(STORAGE_KEYS.threshold, String(inTuneThreshold));
  }, [inTuneThreshold]);

  const handleGoTuneString = (stringIndex: number) => {
    setLockedStringIndex(stringIndex);
    navigateTab('tuner');
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
                onClick={() => navigateTab(id)}
                data-testid={`nav-desktop-${id}`}
              >
                <Icon size={15} /> {label}
              </button>
            ))}
          </nav>

          {/* Правая колонка: индикатор микрофона, GitHub, настройки */}
          <div className="header-right">
            <MicIndicator />
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
        {/* Сбой одной вкладки не должен оставлять пустую страницу: граница
            показывает сообщение, а смена вкладки (key) даёт ей новую попытку. */}
        <ErrorBoundary
          key={activeTab}
          onReset={activeTab === 'tuner' ? undefined : () => navigateTab('tuner')}
          resetLabel="Открыть тюнер"
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
              key={linkNavigation}
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
        </ErrorBoundary>
      </main>

      {/* Нижний таб-бар для мобильных устройств */}
      <nav className="mobile-bottom-nav">
        {NAV_ITEMS.map(({ id, icon: Icon, short }) => (
          <button
            key={id}
            id={`nav-mobile-${id}`}
            onClick={() => navigateTab(id)}
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
