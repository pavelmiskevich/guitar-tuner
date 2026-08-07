import React, { useState, useEffect } from 'react';
import type { Tuning } from '../../domain/tunings';
import type { NoteName, NotationSystem } from '../../domain/notes';
import { NOTE_NAMES, formatNoteName } from '../../domain/notes';
import { SCALES, getScaleNotes } from '../../domain/scales';
import type { Voicing } from '../../domain/chords';
import { COMMON_VOICINGS, detectChordFromFrets } from '../../domain/chords';
import { getFretNote } from '../../domain/fretboard';
import type { HighlightedNote } from './FretboardSVG';
import { FretboardSVG } from './FretboardSVG';
import {
  Layers,
  Music,
  Sparkles,
  Download,
  Share2,
  Check
} from 'lucide-react';

interface FretboardScreenProps {
  tuning: Tuning;
  notation: NotationSystem;
  a4: number;
}

type ViewMode = 'explore' | 'scales' | 'chords';

export const FretboardScreen: React.FC<FretboardScreenProps> = ({
  tuning,
  notation,
  a4
}) => {
  const [viewMode, setViewMode] = useState<ViewMode>('explore');
  const [selectedRoot, setSelectedRoot] = useState<NoteName>('A');
  const [selectedScaleId, setSelectedScaleId] = useState<string>('pentatonic-minor');
  const [selectedVoicing, setSelectedVoicing] = useState<Voicing>(COMMON_VOICINGS[1]); // Am
  const [capo, setCapo] = useState<number | null>(null);
  const [leftHanded, setLeftHanded] = useState(false);
  const [labelMode, setLabelMode] = useState<'note' | 'degree'>('note');
  const [fretRange, setFretRange] = useState<{ from: number; to: number }>({ from: 0, to: 15 });
  const [customFrets, setCustomFrets] = useState<(number | 'x')[]>(['x', 'x', 'x', 'x', 'x', 'x']);
  const [lastClickedNote, setLastClickedNote] = useState<{ note: string; str: number; fret: number } | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  // Восстановление состояния из URL Hash при первой загрузке (FR-FB-18)
  useEffect(() => {
    try {
      const hash = window.location.hash.replace('#', '');
      if (hash) {
        const params = new URLSearchParams(hash);
        const m = params.get('mode');
        if (m === 'scales' || m === 'chords' || m === 'explore') setViewMode(m);
        const r = params.get('root');
        if (r && NOTE_NAMES.includes(r as NoteName)) setSelectedRoot(r as NoteName);
        const s = params.get('scale');
        if (s && SCALES.some(sc => sc.id === s)) setSelectedScaleId(s);
        const c = params.get('capo');
        if (c !== null && c !== 'none') setCapo(Number(c));
      }
    } catch {
      // Игнорируем ошибки парсинга
    }
  }, []);

  // Синхронизация с URL Hash
  const handleShareLink = () => {
    const params = new URLSearchParams();
    params.set('mode', viewMode);
    params.set('root', selectedRoot);
    if (viewMode === 'scales') params.set('scale', selectedScaleId);
    if (capo !== null) params.set('capo', String(capo));

    const newUrl = `${window.location.origin}${window.location.pathname}#${params.toString()}`;
    navigator.clipboard.writeText(newUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  // Экспорт SVG (FR-FB-19)
  const handleExportSVG = () => {
    const svgEl = document.querySelector('svg');
    if (!svgEl) return;
    const svgData = new XMLSerializer().serializeToString(svgEl);
    const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `fretboard-${viewMode}-${selectedRoot}.svg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Вычисление подсвеченных нот в зависимости от режима
  const highlightedNotes: HighlightedNote[] = [];

  if (viewMode === 'scales') {
    const scaleNotes = getScaleNotes(selectedRoot, selectedScaleId);

    tuning.strings.forEach((_, strIdx) => {
      for (let f = fretRange.from; f <= fretRange.to; f++) {
        const pitch = getFretNote(strIdx, f, tuning, capo);
        const match = scaleNotes.find(sn => sn.note === pitch.name);
        if (match) {
          highlightedNotes.push({
            stringIndex: strIdx,
            fret: f,
            label: match.degree,
            isRoot: match.isRoot,
            color: match.isRoot ? 'var(--brand)' : 'var(--ink-800)'
          });
        }
      }
    });
  } else if (viewMode === 'chords') {
    selectedVoicing.frets.forEach((fret, strIdx) => {
      if (fret !== 'x') {
        const pitch = getFretNote(strIdx, fret, tuning, capo);
        const isRoot = pitch.name === selectedVoicing.root;
        highlightedNotes.push({
          stringIndex: strIdx,
          fret,
          label: formatNoteName(pitch.name, notation),
          isRoot,
          color: isRoot ? 'var(--brand)' : 'var(--ink-800)'
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
          color: 'var(--brand)'
        });
      }
    });
  }

  const handleFretClick = (strIdx: number, fret: number) => {
    const pitch = getFretNote(strIdx, fret, tuning, capo);
    setLastClickedNote({
      note: `${formatNoteName(pitch.name, notation)}${pitch.octave}`,
      str: tuning.strings[strIdx]?.stringNumber || strIdx + 1,
      fret
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

  const detectedChord = viewMode === 'explore' ? detectChordFromFrets(customFrets, tuning) : '';

  return (
    <div style={{ width: '100%', maxWidth: '960px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 'var(--s6)' }}>
      {/* Шапка грифа */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <span className="eyebrow">Интерактивный гриф</span>
          <h2 style={{ fontSize: '20px', margin: 0 }}>Карта грифа и аппликатуры</h2>
        </div>

        {/* Переключатель режимов */}
        <div style={{ display: 'flex', background: 'var(--ink-900)', border: '1px solid var(--ink-700)', borderRadius: 'var(--r-pill)', padding: '3px' }}>
          <button
            className="btn btn-sm"
            style={{
              background: viewMode === 'explore' ? 'var(--brand)' : 'transparent',
              color: viewMode === 'explore' ? '#fff' : 'var(--ink-300)',
              borderRadius: 'var(--r-pill)'
            }}
            onClick={() => setViewMode('explore')}
          >
            <Sparkles size={14} /> Исследование
          </button>
          <button
            className="btn btn-sm"
            style={{
              background: viewMode === 'scales' ? 'var(--brand)' : 'transparent',
              color: viewMode === 'scales' ? '#fff' : 'var(--ink-300)',
              borderRadius: 'var(--r-pill)'
            }}
            onClick={() => setViewMode('scales')}
          >
            <Layers size={14} /> Гаммы
          </button>
          <button
            className="btn btn-sm"
            style={{
              background: viewMode === 'chords' ? 'var(--brand)' : 'transparent',
              color: viewMode === 'chords' ? '#fff' : 'var(--ink-300)',
              borderRadius: 'var(--r-pill)'
            }}
            onClick={() => setViewMode('chords')}
          >
            <Music size={14} /> Аккорды
          </button>
        </div>
      </div>

      {/* Панель управления выбранным режимом */}
      <div className="panel" style={{ padding: 'var(--s4)', display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'center', justifyContent: 'space-between' }}>
        {viewMode === 'scales' && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
            <div>
              <span className="eyebrow" style={{ display: 'block', marginBottom: '4px' }}>Тоника</span>
              <select
                value={selectedRoot}
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
                onClick={() => setLabelMode('note')}
              >
                Ноты
              </button>
              <button
                className={`btn btn-sm ${labelMode === 'degree' ? 'btn-primary' : 'btn-ghost'}`}
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
                onChange={(e) => {
                  const found = COMMON_VOICINGS.find(v => v.id === e.target.value);
                  if (found) setSelectedVoicing(found);
                }}
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
                {COMMON_VOICINGS.map(v => (
                  <option key={v.id} value={v.id}>{v.name} ({v.frets.map(f => f === 'x' ? 'x' : f).join(' ')})</option>
                ))}
              </select>
            </div>
          </div>
        )}

        {viewMode === 'explore' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
            <div>
              <span className="eyebrow">Обратный поиск аккорда</span>
              <div style={{ fontSize: '16px', fontWeight: 800, color: detectedChord ? 'var(--sig-in)' : 'var(--ink-300)' }}>
                {detectedChord ? `Распознан: ${detectedChord}` : 'Нажмите лады на струнах для построения'}
              </div>
            </div>
            {customFrets.some(f => f !== 'x') && (
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setCustomFrets(['x', 'x', 'x', 'x', 'x', 'x'])}
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
              onChange={(e) => setLeftHanded(e.target.checked)}
              style={{ accentColor: 'var(--brand)' }}
            />
            Левша
          </label>

          <div style={{ display: 'flex', gap: '6px', marginTop: '14px' }}>
            <button
              className="btn btn-ghost btn-sm"
              onClick={handleShareLink}
              title="Скопировать ссылку со схемой"
              style={{ padding: '6px 8px' }}
            >
              {copiedLink ? <Check size={14} color="var(--sig-in)" /> : <Share2 size={14} />}
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={handleExportSVG}
              title="Экспортировать SVG"
              style={{ padding: '6px 8px' }}
            >
              <Download size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Интерактивный SVG гриф */}
      <FretboardSVG
        tuning={tuning}
        visibleFrets={fretRange}
        capo={capo}
        leftHanded={leftHanded}
        notation={notation}
        labelMode={labelMode}
        highlightedNotes={highlightedNotes}
        onFretClick={handleFretClick}
        a4={a4}
      />

      {/* Информационная подсказка */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px', color: 'var(--ink-300)' }}>
        <span>💡 Нажмите на любой лад струны, чтобы услышать щипок струны (Karplus-Strong).</span>
        {lastClickedNote && (
          <span style={{ color: 'var(--ink-050)', fontWeight: 700 }}>
            Струна {lastClickedNote.str}, Лад {lastClickedNote.fret}: {lastClickedNote.note}
          </span>
        )}
      </div>
    </div>
  );
};
