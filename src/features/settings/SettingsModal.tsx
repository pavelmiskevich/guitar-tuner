import React, { useState } from 'react';
import type { NotationSystem, NoteName } from '../../domain/notes';
import { NOTE_NAMES } from '../../domain/notes';
import type { Tuning } from '../../domain/tunings';
import {
  loadSavedCustomTunings,
  saveCustomTuning,
  deleteCustomTuning,
  createStringsFromMidi
} from '../../domain/tunings';
import { X, Sun, Moon, Sliders, Plus, Trash2, Check } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  a4: number;
  onA4Change: (val: number) => void;
  notation: NotationSystem;
  onNotationChange: (val: NotationSystem) => void;
  inTuneThreshold: number;
  onThresholdChange: (val: number) => void;
  theme: 'night' | 'day';
  onThemeChange: (val: 'night' | 'day') => void;
  onCustomTuningCreated?: (tuning: Tuning) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  a4,
  onA4Change,
  notation,
  onNotationChange,
  inTuneThreshold,
  onThresholdChange,
  theme,
  onThemeChange,
  onCustomTuningCreated
}) => {
  const [customTunings, setCustomTunings] = useState<Tuning[]>(() => loadSavedCustomTunings());
  const [isCreatingCustom, setIsCreatingCustom] = useState(false);
  const [newTuningName, setNewTuningName] = useState('');
  const [stringCount, setStringCount] = useState<number>(6);
  const [customNotes, setCustomNotes] = useState<{ note: NoteName; octave: number }[]>([
    { note: 'E', octave: 2 },
    { note: 'A', octave: 2 },
    { note: 'D', octave: 3 },
    { note: 'G', octave: 3 },
    { note: 'B', octave: 3 },
    { note: 'E', octave: 4 }
  ]);

  if (!isOpen) return null;

  const handleStringCountChange = (cnt: number) => {
    setStringCount(cnt);
    const updated = [...customNotes];
    while (updated.length < cnt) {
      updated.push({ note: 'E', octave: 3 });
    }
    setCustomNotes(updated.slice(0, cnt));
  };

  const handleSaveNewCustomTuning = () => {
    if (!newTuningName.trim()) return;

    const midiNotes = customNotes.map(n => {
      const idx = NOTE_NAMES.indexOf(n.note);
      return (n.octave + 1) * 12 + idx;
    });

    const newTuning: Tuning = {
      id: `custom-${Date.now()}`,
      name: newTuningName.trim(),
      category: 'Пользовательские',
      instrument: 'guitar',
      strings: createStringsFromMidi(midiNotes),
      isCustom: true
    };

    saveCustomTuning(newTuning);
    setCustomTunings(loadSavedCustomTunings());
    setIsCreatingCustom(false);
    setNewTuningName('');
    onCustomTuningCreated?.(newTuning);
  };

  const handleDeleteTuning = (id: string) => {
    deleteCustomTuning(id);
    setCustomTunings(loadSavedCustomTunings());
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(11, 10, 28, 0.75)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 999,
        padding: '16px'
      }}
      onClick={onClose}
    >
      <div
        className="panel"
        style={{
          width: '100%',
          maxWidth: '520px',
          maxHeight: '90vh',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--s6)',
          position: 'relative'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Шапка модального окна */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Sliders size={20} color="var(--brand)" />
            <h2 style={{ fontSize: '18px', margin: 0 }}>Настройки приложения</h2>
          </div>
          <button
            onClick={onClose}
            className="btn btn-ghost btn-sm"
            style={{ padding: '6px', borderRadius: '50%', minHeight: 'auto' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Тема оформления */}
        <div>
          <span className="eyebrow" style={{ display: 'block', marginBottom: '8px' }}>Тема оформления</span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              className={`btn btn-sm ${theme === 'night' ? 'btn-primary' : 'btn-ghost'}`}
              style={{ flex: 1 }}
              onClick={() => onThemeChange('night')}
            >
              <Moon size={16} /> Ночь (Индиго)
            </button>
            <button
              className={`btn btn-sm ${theme === 'day' ? 'btn-primary' : 'btn-ghost'}`}
              style={{ flex: 1 }}
              onClick={() => onThemeChange('day')}
            >
              <Sun size={16} /> День (Светлая)
            </button>
          </div>
        </div>

        {/* Опорная частота A4 */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span className="eyebrow">Эталон A4 (Ля 1-й октавы)</span>
            <span className="mono" style={{ fontSize: '16px', fontWeight: 700, color: 'var(--brand)' }}>
              {a4} Гц
            </span>
          </div>

          <input
            type="range"
            min="415"
            max="466"
            step="1"
            value={a4}
            onChange={(e) => onA4Change(Number(e.target.value))}
            style={{ width: '100%', accentColor: 'var(--brand)', cursor: 'pointer' }}
          />

          <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
            {[432, 440, 442, 444].map(freq => (
              <button
                key={freq}
                className={`btn btn-sm ${a4 === freq ? 'btn-primary' : 'btn-ghost'}`}
                style={{ flex: 1, padding: '4px 8px', fontSize: '12px' }}
                onClick={() => onA4Change(freq)}
                data-testid={`settings-a4-${freq}`}
              >
                {freq} Гц
              </button>
            ))}
          </div>
        </div>

        {/* Система обозначения нот */}
        <div>
          <span className="eyebrow" style={{ display: 'block', marginBottom: '8px' }}>Система нотации</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', background: 'var(--ink-800)', borderRadius: 'var(--r-md)', cursor: 'pointer' }}>
              <input
                type="radio"
                name="notation"
                checked={notation === 'english'}
                onChange={() => onNotationChange('english')}
                style={{ accentColor: 'var(--brand)' }}
              />
              <div>
                <b style={{ display: 'block', fontSize: '14px' }}>Английская (C, D, E, F, G, A, B)</b>
                <span style={{ fontSize: '12px', color: 'var(--ink-300)' }}>Международный стандарт</span>
              </div>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', background: 'var(--ink-800)', borderRadius: 'var(--r-md)', cursor: 'pointer' }}>
              <input
                type="radio"
                name="notation"
                checked={notation === 'german'}
                onChange={() => onNotationChange('german')}
                style={{ accentColor: 'var(--brand)' }}
              />
              <div>
                <b style={{ display: 'block', fontSize: '14px' }}>Немецкая (C, D, E, F, G, A, H)</b>
                <span style={{ fontSize: '12px', color: 'var(--ink-300)' }}>Классическая европейская школа (Си = H, Си-бемоль = B)</span>
              </div>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', background: 'var(--ink-800)', borderRadius: 'var(--r-md)', cursor: 'pointer' }}>
              <input
                type="radio"
                name="notation"
                checked={notation === 'solfege'}
                onChange={() => onNotationChange('solfege')}
                style={{ accentColor: 'var(--brand)' }}
              />
              <div>
                <b style={{ display: 'block', fontSize: '14px' }}>Скрипичная / Сольфеджио (До, Ре, Ми...)</b>
                <span style={{ fontSize: '12px', color: 'var(--ink-300)' }}>Слоговые названия нот</span>
              </div>
            </label>
          </div>
        </div>

        {/* Порог строя */}
        <div>
          <span className="eyebrow" style={{ display: 'block', marginBottom: '8px' }}>Порог точности «В строе»</span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              className={`btn btn-sm ${inTuneThreshold === 3 ? 'btn-primary' : 'btn-ghost'}`}
              style={{ flex: 1 }}
              onClick={() => onThresholdChange(3)}
            >
              Строгий (±3¢)
            </button>
            <button
              className={`btn btn-sm ${inTuneThreshold === 5 ? 'btn-primary' : 'btn-ghost'}`}
              style={{ flex: 1 }}
              onClick={() => onThresholdChange(5)}
            >
              Стандарт (±5¢)
            </button>
            <button
              className={`btn btn-sm ${inTuneThreshold === 10 ? 'btn-primary' : 'btn-ghost'}`}
              style={{ flex: 1 }}
              onClick={() => onThresholdChange(10)}
            >
              Свободный (±10¢)
            </button>
          </div>
        </div>

        {/* Пользовательские строи (Custom Tunings Builder) */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span className="eyebrow">Пользовательские строи</span>
            {!isCreatingCustom && (
              <button className="btn btn-ghost btn-sm" onClick={() => setIsCreatingCustom(true)}>
                <Plus size={14} /> Создать строй
              </button>
            )}
          </div>

          {/* Форма создания своего строя */}
          {isCreatingCustom && (
            <div className="panel" style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px', background: 'var(--ink-900)' }}>
              <input
                type="text"
                placeholder="Название строя (например: Open Gm)"
                value={newTuningName}
                onChange={(e) => setNewTuningName(e.target.value)}
                style={{
                  background: 'var(--ink-800)',
                  border: '1px solid var(--ink-700)',
                  color: 'var(--ink-050)',
                  borderRadius: 'var(--r-md)',
                  padding: '8px 12px',
                  fontSize: '14px'
                }}
              />

              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', color: 'var(--ink-300)' }}>Струн:</span>
                {[4, 5, 6, 7, 8].map(cnt => (
                  <button
                    key={cnt}
                    className={`btn btn-sm ${stringCount === cnt ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => handleStringCountChange(cnt)}
                  >
                    {cnt}
                  </button>
                ))}
              </div>

              {/* Выбор ноты и октавы для каждой струны */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '8px' }}>
                {customNotes.map((cn, i) => (
                  <div key={i} style={{ background: 'var(--ink-800)', padding: '6px', borderRadius: 'var(--r-md)' }}>
                    <span style={{ fontSize: '11px', color: 'var(--ink-300)', display: 'block' }}>{stringCount - i}-я струна:</span>
                    <div style={{ display: 'flex', gap: '4px', marginTop: '2px' }}>
                      <select
                        value={cn.note}
                        onChange={(e) => {
                          const updated = [...customNotes];
                          updated[i].note = e.target.value as NoteName;
                          setCustomNotes(updated);
                        }}
                        style={{ background: 'var(--ink-900)', color: '#fff', border: '1px solid var(--ink-700)', borderRadius: '4px', fontSize: '12px' }}
                      >
                        {NOTE_NAMES.map(n => <option key={n} value={n}>{n}</option>)}
                      </select>
                      <select
                        value={cn.octave}
                        onChange={(e) => {
                          const updated = [...customNotes];
                          updated[i].octave = Number(e.target.value);
                          setCustomNotes(updated);
                        }}
                        style={{ background: 'var(--ink-900)', color: '#fff', border: '1px solid var(--ink-700)', borderRadius: '4px', fontSize: '12px' }}
                      >
                        {[1, 2, 3, 4, 5].map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '6px' }}>
                <button className="btn btn-ghost btn-sm" onClick={() => setIsCreatingCustom(false)}>
                  Отмена
                </button>
                <button className="btn btn-primary btn-sm" onClick={handleSaveNewCustomTuning}>
                  <Check size={14} /> Сохранить строй
                </button>
              </div>
            </div>
          )}

          {/* Список сохраненных строёв */}
          {customTunings.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px' }}>
              {customTunings.map(ct => (
                <div
                  key={ct.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    background: 'var(--ink-800)',
                    borderRadius: 'var(--r-md)'
                  }}
                >
                  <div>
                    <b>{ct.name}</b>
                    <span style={{ fontSize: '12px', color: 'var(--ink-300)', marginLeft: '8px' }}>
                      ({ct.strings.map(s => `${s.open.name}${s.open.octave}`).join(' ')})
                    </span>
                  </div>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => handleDeleteTuning(ct.id)}
                    title="Удалить строй"
                  >
                    <Trash2 size={14} color="var(--sig-off)" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Кнопка закрыть */}
        <button className="btn btn-primary" onClick={onClose} data-testid="settings-close" style={{ marginTop: '8px' }}>
          Сохранить и закрыть
        </button>
      </div>
    </div>
  );
};
