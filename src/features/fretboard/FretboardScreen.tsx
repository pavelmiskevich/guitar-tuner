import React, { useState, useEffect, useRef, useMemo, useId } from 'react';
import type { Tuning } from '../../domain/tunings';
import type { NoteName, NotationSystem } from '../../domain/notes';
import { NOTE_NAMES, formatNoteName } from '../../domain/notes';
import { SCALES, getScaleNotes } from '../../domain/scales';
import type { FretboardShareState } from '../../domain/deepLink';
import { buildShareUrl, decodeFretboardHash, encodeFretboardHash, urlWithHash } from '../../domain/deepLink';
import { detectChordFromFrets, getVoicingsForTuning, voicingLibraryKind } from '../../domain/chords';
import { getFretNote, physicalFret, fretFromCapo } from '../../domain/fretboard';
import type { HighlightedNote } from './FretboardSVG';
import { FretboardSVG } from './FretboardSVG';
import { SegmentedControl } from '../../ui/SegmentedControl';
import {
  Layers,
  Music,
  Sparkles,
  Download,
  Share2,
  Check
} from 'lucide-react';
import { getPublicSiteUrl } from '../../domain/siteUrl';
import { copyToClipboard } from '../../ui/clipboard';
import { buildStandaloneSvg, downloadText, safeFileName } from '../../ui/exportSvg';

interface FretboardScreenProps {
  tuning: Tuning;
  notation: NotationSystem;
  a4: number;
}

type ViewMode = 'explore' | 'scales' | 'chords';

const DEFAULT_VOICING_ID = 'am-open';

/** Все струны заглушены — по числу струн строя, а не шесть (#5). */
function emptyFrets(count: number): (number | 'x')[] {
  return Array.from({ length: count }, () => 'x');
}

/** Набор ладов под число струн строя: из ссылки мог прийти другой размер. */
function fitFrets(frets: (number | 'x')[], count: number): (number | 'x')[] {
  return Array.from({ length: count }, (_, i) => frets[i] ?? 'x');
}

export const FretboardScreen: React.FC<FretboardScreenProps> = ({
  tuning,
  notation,
  a4
}) => {
  const hintId = useId();
  // Состояние схемы читается из хэша до первого рендера (FR-FB-18): гриф сразу
  // рисуется в присланном виде, без промежуточного кадра со значениями по умолчанию.
  // Хэш всегда актуален (см. эффект ниже), поэтому возврат на вкладку сохраняет схему.
  const [shared] = useState(() => decodeFretboardHash(typeof window !== 'undefined' ? window.location.hash : ''));

  const [viewMode, setViewMode] = useState<ViewMode>(shared.mode ?? 'explore');
  const [selectedRoot, setSelectedRoot] = useState<NoteName>(shared.root ?? 'A');
  const [selectedScaleId, setSelectedScaleId] = useState<string>(shared.scaleId ?? 'pentatonic-minor');
  // Хранится id, а сама аппликатура берётся из пересчитанной под строй
  // библиотеки: при смене строя схема сразу показывает верные лады.
  const [selectedVoicingId, setSelectedVoicingId] = useState<string>(shared.voicingId ?? DEFAULT_VOICING_ID);
  const voicings = useMemo(() => getVoicingsForTuning(tuning), [tuning]);
  const hasChordLibrary = voicingLibraryKind(tuning) !== null;
  const selectedVoicing =
    voicings.find(v => v.id === selectedVoicingId) ??
    voicings.find(v => v.id === DEFAULT_VOICING_ID) ??
    voicings[1] ??
    voicings[0];
  const [capo, setCapo] = useState<number | null>(shared.capo ?? null);
  const [leftHanded, setLeftHanded] = useState(shared.leftHanded ?? false);
  const [labelMode, setLabelMode] = useState<'note' | 'degree'>(shared.labelMode ?? 'note');
  const [fretRange, setFretRange] = useState<{ from: number; to: number }>(
    shared.fretRange ?? { from: 0, to: 15 }
  );
  const stringCount = tuning.strings.length;
  const [rawCustomFrets, setCustomFrets] = useState<(number | 'x')[]>(() => shared.customFrets ?? emptyFrets(stringCount));
  const customFrets = fitFrets(rawCustomFrets, stringCount);
  const [lastClickedNote, setLastClickedNote] = useState<{ note: string; str: number; fret: number } | null>(null);
  const [shareStatus, setShareStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const fretboardSvgRef = useRef<SVGSVGElement>(null);

  const shareState: FretboardShareState = {
    mode: viewMode,
    root: selectedRoot,
    scaleId: selectedScaleId,
    voicingId: selectedVoicing.id,
    customFrets,
    capo,
    leftHanded,
    fretRange,
    labelMode,
    tuning
  };

  const shareHash = encodeFretboardHash(shareState);

  // Схема всегда отражена в адресной строке — ссылку можно скопировать и из браузера.
  // replaceState, а не push: перебор гамм не должен забивать историю навигации.
  useEffect(() => {
    window.history.replaceState(null, '', urlWithHash(window.location, shareHash));
  }, [shareHash]);

  const activeTimeoutsRef = useRef<Set<number>>(new Set());
  useEffect(() => {
    const timeouts = activeTimeoutsRef.current;
    return () => {
      timeouts.forEach(id => window.clearTimeout(id));
      timeouts.clear();
    };
  }, []);

  const safeSetTimeout = (cb: () => void, delay: number) => {
    const id = window.setTimeout(() => {
      activeTimeoutsRef.current.delete(id);
      cb();
    }, delay);
    activeTimeoutsRef.current.add(id);
    return id;
  };

  const handleShareLink = async () => {
    const url = buildShareUrl(getPublicSiteUrl(), window.location.pathname, shareState);
    const ok = await copyToClipboard(url);
    setShareStatus(ok ? 'copied' : 'failed');
    // При неудаче подсказка висит дольше: её надо успеть прочитать.
    safeSetTimeout(() => setShareStatus('idle'), ok ? 2000 : 5000);
  };

  const detectedChord = viewMode === 'explore' ? detectChordFromFrets(customFrets, tuning, capo) : '';

  /** Что изображено: гамма с тоникой, аккорд или распознанный набор нот. */
  const subject =
    viewMode === 'scales'
      ? `${formatNoteName(selectedRoot, notation)} ${SCALES.find(s => s.id === selectedScaleId)?.name ?? ''}`.trim()
      : viewMode === 'chords'
        ? selectedVoicing.name
        : detectedChord || 'Свои ноты';

  // Экспорт SVG (FR-FB-19): файл самостоятельный — с цветами, фоном и
  // заголовком, а имя говорит, что внутри (#13).
  const handleExportSVG = () => {
    const svgEl = fretboardSvgRef.current;
    if (!svgEl) return;
    const capoLabel = capo !== null ? `капо ${capo}` : '';
    const title = [subject, tuning.name, capoLabel].filter(Boolean).join(' · ');
    const svg = buildStandaloneSvg(svgEl, {
      title,
      background: { top: 'var(--board-bg-top)', bottom: 'var(--board-bg-bottom)' },
      // Гриф тёмный в обеих темах (--board-* не переопределяются днём),
      // поэтому заголовок всегда светлый.
      titleColor: '#EDEBFF'
    });
    const fileName = safeFileName([
      'fretboard',
      viewMode === 'scales' ? `${selectedRoot}-${selectedScaleId}` : viewMode === 'chords' ? selectedVoicing.name.split(' (')[0] : detectedChord || 'custom',
      tuning.id,
      capo !== null ? `capo${capo}` : ''
    ]);
    downloadText(svg, `${fileName}.svg`, 'image/svg+xml;charset=utf-8');
  };

  // Вычисление подсвеченных нот в зависимости от режима
  const highlightedNotes: HighlightedNote[] = [];

  if (viewMode === 'scales') {
    const scaleNotes = getScaleNotes(selectedRoot, selectedScaleId);

    // Диапазон задан физическими ладами, подсветка — ладами от каподастра.
    const fromFret = fretFromCapo(fretRange.from, capo) ?? 0;
    const toFret = fretFromCapo(fretRange.to, capo) ?? -1;
    tuning.strings.forEach((_, strIdx) => {
      for (let f = fromFret; f <= toFret; f++) {
        const pitch = getFretNote(strIdx, f, tuning, capo);
        const match = scaleNotes.find(sn => sn.note === pitch.name);
        if (match) {
          highlightedNotes.push({
            stringIndex: strIdx,
            fret: f,
            label: match.degree,
            isRoot: match.isRoot,
            color: match.isRoot ? 'var(--brand-strong)' : 'var(--ink-800)'
          });
        }
      }
    });
  } else if (viewMode === 'chords') {
    // С каподастром форма звучит выше — тоника сдвигается вместе с ней.
    const rootIndex = (NOTE_NAMES.indexOf(selectedVoicing.root) + (capo ?? 0)) % 12;
    selectedVoicing.frets.forEach((fret, strIdx) => {
      if (fret !== 'x') {
        const pitch = getFretNote(strIdx, fret, tuning, capo);
        const isRoot = selectedVoicing.type !== 'open' && pitch.name === NOTE_NAMES[rootIndex];
        highlightedNotes.push({
          stringIndex: strIdx,
          fret,
          label: formatNoteName(pitch.name, notation),
          isRoot,
          color: isRoot ? 'var(--brand-strong)' : 'var(--ink-800)'
        });
      }
    });
  } else if (viewMode === 'explore') {
    // В режиме исследования показываем выбранные пользователем лады для обратного поиска аккорда
    customFrets.forEach((fret, strIdx) => {
      if (fret !== 'x') {
        const pitch = getFretNote(strIdx, fret, tuning, capo);
        highlightedNotes.push({
          stringIndex: strIdx,
          fret,
          label: formatNoteName(pitch.name, notation),
          color: 'var(--brand-strong)',
          textColor: 'var(--on-brand)'
        });
      }
    });
  }

  const handleFretClick = (strIdx: number, fret: number) => {
    const pitch = getFretNote(strIdx, fret, tuning, capo);
    setLastClickedNote({
      note: `${formatNoteName(pitch.name, notation)}${pitch.octave}`,
      str: tuning.strings[strIdx]?.stringNumber || strIdx + 1,
      // В подписи — лад, который виден на грифе.
      fret: physicalFret(fret, capo)
    });

    if (viewMode === 'explore') {
      const nextFrets = [...customFrets];
      if (nextFrets[strIdx] === fret) {
        nextFrets[strIdx] = 'x'; // сброс струны
      } else {
        nextFrets[strIdx] = fret;
      }
      setCustomFrets(nextFrets);
    }
  };

  return (
    <div style={{ width: '100%', maxWidth: '960px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 'var(--s6)' }}>
      {/* Шапка грифа */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <span className="eyebrow">Интерактивный гриф</span>
          <h2 style={{ fontSize: '20px', margin: 0 }}>Карта грифа и аппликатуры</h2>
        </div>

        {/* Переключатель режимов */}
        <SegmentedControl
          label="Режим грифа"
          value={viewMode}
          onChange={setViewMode}
          options={[
            { value: 'explore', label: <><Sparkles size={14} aria-hidden="true" /> Исследование</>, testId: 'fb-mode-explore' },
            { value: 'scales', label: <><Layers size={14} aria-hidden="true" /> Гаммы</>, testId: 'fb-mode-scales' },
            { value: 'chords', label: <><Music size={14} aria-hidden="true" /> Аккорды</>, testId: 'fb-mode-chords' }
          ]}
        />
      </div>

      {/* Панель управления выбранным режимом */}
      <div className="panel" style={{ padding: 'var(--s4)', display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'center', justifyContent: 'space-between' }}>
        {viewMode === 'scales' && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
            <div>
              <span className="eyebrow" style={{ display: 'block', marginBottom: '4px' }}>Тоника</span>
              <select
                value={selectedRoot}
                data-testid="fb-root"
                aria-label="Тоника гаммы"
                onChange={(e) => setSelectedRoot(e.target.value as NoteName)}
                style={{
                  background: 'var(--ink-800)',
                  color: 'var(--ink-050)',
                  border: '1px solid var(--ink-700)',
                  borderRadius: 'var(--r-md)',
                  padding: '6px 12px',
                  fontWeight: 600
                }}
              >
                {NOTE_NAMES.map(n => (
                  <option key={n} value={n}>{formatNoteName(n, notation)}</option>
                ))}
              </select>
            </div>

            <div>
              <span className="eyebrow" style={{ display: 'block', marginBottom: '4px' }}>Лад / Гамма</span>
              <select
                value={selectedScaleId}
                data-testid="fb-scale"
                aria-label="Лад или гамма"
                onChange={(e) => setSelectedScaleId(e.target.value)}
                style={{
                  background: 'var(--ink-800)',
                  color: 'var(--ink-050)',
                  border: '1px solid var(--ink-700)',
                  borderRadius: 'var(--r-md)',
                  padding: '6px 12px',
                  fontWeight: 600
                }}
              >
                {SCALES.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-end' }}>
              <button
                className={`btn btn-sm ${labelMode === 'note' ? 'btn-primary' : 'btn-ghost'}`}
                aria-pressed={labelMode === 'note'}
                onClick={() => setLabelMode('note')}
              >
                Ноты
              </button>
              <button
                className={`btn btn-sm ${labelMode === 'degree' ? 'btn-primary' : 'btn-ghost'}`}
                aria-pressed={labelMode === 'degree'}
                onClick={() => setLabelMode('degree')}
              >
                Ступени (1, ♭3...)
              </button>
            </div>
          </div>
        )}

        {viewMode === 'chords' && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
            <div>
              <span className="eyebrow" style={{ display: 'block', marginBottom: '4px' }}>Аппликатура аккорда</span>
              <select
                value={selectedVoicing.id}
                data-testid="fb-voicing"
                aria-label="Аппликатура аккорда"
                onChange={(e) => setSelectedVoicingId(e.target.value)}
                style={{
                  background: 'var(--ink-800)',
                  color: 'var(--ink-050)',
                  border: '1px solid var(--ink-700)',
                  borderRadius: 'var(--r-md)',
                  padding: '6px 14px',
                  fontWeight: 700,
                  fontSize: '15px'
                }}
              >
                {voicings.map(v => (
                  <option key={v.id} value={v.id}>
                    {v.name}{v.shape ? ` — форма ${v.shape}` : ''} ({v.frets.join(' ')})
                  </option>
                ))}
              </select>
            </div>
            {!hasChordLibrary && (
              <span data-testid="fb-no-chords" style={{ fontSize: '12px', color: 'var(--ink-300)', maxWidth: '320px' }}>
                Для этого строя библиотеки аккордов нет — доступны только открытые струны.
              </span>
            )}
          </div>
        )}

        {viewMode === 'explore' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
            <div>
              <span className="eyebrow">Обратный поиск аккорда</span>
              <div
                aria-live="polite"
                data-testid="fb-detected-chord"
                style={{ fontSize: '16px', fontWeight: 800, color: detectedChord ? 'var(--sig-in)' : 'var(--ink-300)' }}
              >
                {detectedChord ? `Распознан: ${detectedChord}` : 'Нажмите лады на струнах для построения'}
              </div>
            </div>
            {customFrets.some(f => f !== 'x') && (
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setCustomFrets(emptyFrets(stringCount))}
              >
                Очистить
              </button>
            )}
          </div>
        )}

        {/* Быстрые параметры грифа: Каподастр, Диапазон ладов и Экспорт */}
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div>
            <span className="eyebrow" style={{ display: 'block', marginBottom: '4px' }}>Каподастр</span>
            <select
              value={capo === null ? 'none' : capo}
              data-testid="fb-capo"
              aria-label="Положение каподастра"
              onChange={(e) => setCapo(e.target.value === 'none' ? null : Number(e.target.value))}
              style={{
                background: 'var(--ink-800)',
                color: 'var(--ink-050)',
                border: '1px solid var(--ink-700)',
                borderRadius: 'var(--r-md)',
                padding: '4px 8px',
                fontSize: '12px'
              }}
            >
              <option value="none">Без капо</option>
              {[1, 2, 3, 4, 5, 6, 7].map(f => (
                <option key={f} value={f}>Лад {f}</option>
              ))}
            </select>
          </div>

          <div>
            <span className="eyebrow" style={{ display: 'block', marginBottom: '4px' }}>Лады</span>
            <select
              value={`${fretRange.from}-${fretRange.to}`}
              data-testid="fb-range"
              aria-label="Диапазон отображаемых ладов"
              onChange={(e) => {
                const [from, to] = e.target.value.split('-').map(Number);
                setFretRange({ from, to });
              }}
              style={{
                background: 'var(--ink-800)',
                color: 'var(--ink-050)',
                border: '1px solid var(--ink-700)',
                borderRadius: 'var(--r-md)',
                padding: '4px 8px',
                fontSize: '12px'
              }}
            >
              <option value="0-12">0–12 лады</option>
              <option value="0-15">0–15 лады</option>
              <option value="0-24">0–24 лада (Полный)</option>
              <option value="5-12">5–12 лады (Боксы)</option>
            </select>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--ink-100)', cursor: 'pointer', marginTop: '14px' }}>
            <input
              type="checkbox"
              checked={leftHanded}
              data-testid="fb-lefty"
              onChange={(e) => setLeftHanded(e.target.checked)}
              style={{ accentColor: 'var(--brand)' }}
            />
            Левша
          </label>

          <div style={{ display: 'flex', gap: '6px', marginTop: '14px' }}>
            <button
              className="btn btn-ghost btn-sm"
              data-testid="fb-share"
              onClick={handleShareLink}
              title="Скопировать ссылку на эту схему (строй, капо, гамма или аппликатура, ноты, ориентация)"
              aria-label="Скопировать ссылку на эту схему грифа"
              style={{ padding: '6px 8px' }}
            >
              {shareStatus === 'copied' ? <Check size={14} color="var(--sig-in)" /> : <Share2 size={14} />}
            </button>
            <button
              className="btn btn-ghost btn-sm"
              data-testid="fb-export"
              onClick={handleExportSVG}
              title="Экспортировать SVG"
              aria-label="Экспортировать схему грифа в SVG"
              style={{ padding: '6px 8px' }}
            >
              <Download size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Интерактивный SVG гриф */}
      <FretboardSVG
        ref={fretboardSvgRef}
        tuning={tuning}
        visibleFrets={fretRange}
        capo={capo}
        leftHanded={leftHanded}
        notation={notation}
        labelMode={labelMode}
        highlightedNotes={highlightedNotes}
        onFretClick={handleFretClick}
        describedBy={hintId}
        a4={a4}
      />

      {/* Информационная подсказка */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px', color: 'var(--ink-300)', gap: '12px', flexWrap: 'wrap' }}>
        <span id={hintId}>
          💡 Нажмите на любой лад струны, чтобы услышать щипок струны (Karplus-Strong). С клавиатуры: Tab — на гриф,
          стрелки — по ладам и струнам, Enter — сыграть ноту.
        </span>
        {/* Область всегда в DOM — иначе скринридер не озвучит появившуюся ноту. */}
        <span aria-live="polite">
          {lastClickedNote && (
            <span data-testid="fb-last-note" style={{ color: 'var(--ink-050)', fontWeight: 700 }}>
              Струна {lastClickedNote.str}, Лад {lastClickedNote.fret}: {lastClickedNote.note}
            </span>
          )}
        </span>
      </div>

      {/* Пояснение к шарингу схемы (FR-FB-18) */}
      <div
        className="panel"
        data-testid="fb-share-hint"
        style={{ padding: 'var(--s4)', display: 'flex', flexDirection: 'column', gap: '6px' }}
      >
        <span className="eyebrow">🔗 Ссылка на схему</span>
        <p style={{ margin: 0, fontSize: '13px', color: 'var(--ink-100)', lineHeight: 1.5 }}>
          Кнопка <Share2 size={12} style={{ verticalAlign: '-1px' }} /> копирует ссылку на то, что вы видите
          сейчас: строй, каподастр, диапазон ладов, ориентацию грифа и содержимое режима — гамму с тоникой,
          аппликатуру аккорда или ноты, расставленные вручную. Тот, кто её откроет, попадёт сразу на вкладку
          «Гриф» с этой же схемой. Адрес в браузере обновляется на лету, так что ссылку можно скопировать
          и прямо из адресной строки.
        </p>
        {shareStatus === 'copied' && (
          <span data-testid="fb-share-copied" style={{ fontSize: '13px', fontWeight: 700, color: 'var(--sig-in)' }}>
            Ссылка скопирована в буфер обмена
          </span>
        )}
        {shareStatus === 'failed' && (
          <span data-testid="fb-share-failed" role="alert" style={{ fontSize: '13px', fontWeight: 700, color: 'var(--sig-off)' }}>
            Не удалось скопировать — скопируйте ссылку из адресной строки браузера
          </span>
        )}
      </div>
    </div>
  );
};
