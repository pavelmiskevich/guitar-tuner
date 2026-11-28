import React, { useEffect, useId, useRef, useState } from 'react';
import type { NotationSystem, NoteName } from '../../domain/notes';
import { NOTE_NAMES, pitchFromName } from '../../domain/notes';
import type { Tuning } from '../../domain/tunings';
import { createStringsFromMidi } from '../../domain/tunings';
import { loadSavedCustomTunings, saveCustomTuning, deleteCustomTuning } from '../../domain/customTunings';
import { X, Sun, Moon, Sliders, Plus, Trash2, Check } from 'lucide-react';
import { APP_COMMIT, APP_VERSION } from '../../buildInfo';
import './settings.css';

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
  onCustomTuningDeleted?: (id: string) => void;
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
  onCustomTuningCreated,
  onCustomTuningDeleted
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

  const titleId = useId();
  const tuningNameId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Нативный модальный <dialog> (#11): showModal() делает страницу под ним
  // инертной — Tab не уходит под подложку, — закрывает окно по Escape, а
  // close() возвращает фокус на элемент, с которого окно открыли.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen && !dialog.open) dialog.showModal();
    if (!isOpen && dialog.open) dialog.close();
  }, [isOpen]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    // Escape и close() приходят сюда событием close — состояние окна
    // в App синхронизируется отсюда.
    const handleClose = () => onCloseRef.current();
    // Щелчок по подложке: панель занимает всё окно, так что целью щелчка
    // сам <dialog> бывает только за её пределами — на ::backdrop.
    const handleClick = (e: MouseEvent) => {
      if (e.target === dialog) dialog.close();
    };
    dialog.addEventListener('close', handleClose);
    dialog.addEventListener('click', handleClick);
    return () => {
      dialog.removeEventListener('close', handleClose);
      dialog.removeEventListener('click', handleClick);
    };
  }, []);

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

    const midiNotes = customNotes.map(n => pitchFromName(n.note, n.octave).midi);

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
    onCustomTuningDeleted?.(id);
  };

  // Окно рендерится всегда: закрытый <dialog> скрыт браузером, а close()
  // возвращает фокус, только пока содержимое окна на месте.
  return (
    <dialog ref={dialogRef} className="settings-dialog" aria-labelledby={titleId}>
      <div className="panel set-panel" data-testid="settings-modal">
        {/* Шапка модального окна */}
        <div className="set-header">
          <div className="set-heading">
            <Sliders size={20} color="var(--brand)" aria-hidden="true" />
            <h2 id={titleId} className="set-title">Настройки приложения</h2>
          </div>
          <button
            onClick={onClose}
            className="btn btn-ghost btn-sm set-dismiss"
            aria-label="Закрыть настройки"
            title="Закрыть"
            data-testid="settings-dismiss"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {/* Тема оформления */}
        <fieldset className="fieldset-reset">
          <legend className="eyebrow set-legend">Тема оформления</legend>
          <div className="set-choices">
            <button
              className={`btn btn-sm set-choice ${theme === 'night' ? 'btn-primary' : 'btn-ghost'}`}
              aria-pressed={theme === 'night'}
              onClick={() => onThemeChange('night')}
              data-testid="settings-theme-night"
            >
              <Moon size={16} /> Ночь (Индиго)
            </button>
            <button
              className={`btn btn-sm set-choice ${theme === 'day' ? 'btn-primary' : 'btn-ghost'}`}
              aria-pressed={theme === 'day'}
              onClick={() => onThemeChange('day')}
              data-testid="settings-theme-day"
            >
              <Sun size={16} /> День (Светлая)
            </button>
          </div>
        </fieldset>

        {/* Опорная частота A4 */}
        <div>
          <div className="set-section-head">
            <span className="eyebrow">Эталон A4 (Ля 1-й октавы)</span>
            <span className="mono set-a4-value">
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
            className="set-a4-slider"
            name="a4"
            data-testid="settings-a4-slider"
            aria-label="Эталонная частота A4 в герцах"
          />

          <div className="set-a4-presets">
            {[432, 440, 442, 444].map(freq => (
              <button
                key={freq}
                className={`btn btn-sm set-a4-preset ${a4 === freq ? 'btn-primary' : 'btn-ghost'}`}
                aria-pressed={a4 === freq}
                onClick={() => onA4Change(freq)}
                data-testid={`settings-a4-${freq}`}
              >
                {freq} Гц
              </button>
            ))}
          </div>
        </div>

        {/* Система обозначения нот */}
        <fieldset className="fieldset-reset">
          <legend className="eyebrow set-legend">Система нотации</legend>
          <div className="set-notation-list">
            <label className="set-notation-option">
              <input
                type="radio"
                name="notation"
                checked={notation === 'english'}
                onChange={() => onNotationChange('english')}
                className="set-notation-radio"
                data-testid="settings-notation-english"
              />
              <div>
                <b className="set-notation-name">Английская (C, D, E, F, G, A, B)</b>
                <span className="set-notation-hint">Международный стандарт</span>
              </div>
            </label>

            <label className="set-notation-option">
              <input
                type="radio"
                name="notation"
                checked={notation === 'german'}
                onChange={() => onNotationChange('german')}
                className="set-notation-radio"
                data-testid="settings-notation-german"
              />
              <div>
                <b className="set-notation-name">Немецкая (C, D, E, F, G, A, H)</b>
                <span className="set-notation-hint">Классическая европейская школа (Си = H, Си-бемоль = B)</span>
              </div>
            </label>

            <label className="set-notation-option">
              <input
                type="radio"
                name="notation"
                checked={notation === 'solfege'}
                onChange={() => onNotationChange('solfege')}
                className="set-notation-radio"
                data-testid="settings-notation-solfege"
              />
              <div>
                <b className="set-notation-name">Скрипичная / Сольфеджио (До, Ре, Ми...)</b>
                <span className="set-notation-hint">Слоговые названия нот</span>
              </div>
            </label>
          </div>
        </fieldset>

        {/* Порог строя */}
        <fieldset className="fieldset-reset">
          <legend className="eyebrow set-legend">Порог точности «В строе»</legend>
          <div className="set-choices">
            <button
              className={`btn btn-sm set-choice ${inTuneThreshold === 3 ? 'btn-primary' : 'btn-ghost'}`}
              aria-pressed={inTuneThreshold === 3}
              onClick={() => onThresholdChange(3)}
              data-testid="settings-threshold-3"
            >
              Строгий (±3¢)
            </button>
            <button
              className={`btn btn-sm set-choice ${inTuneThreshold === 5 ? 'btn-primary' : 'btn-ghost'}`}
              aria-pressed={inTuneThreshold === 5}
              onClick={() => onThresholdChange(5)}
              data-testid="settings-threshold-5"
            >
              Стандарт (±5¢)
            </button>
            <button
              className={`btn btn-sm set-choice ${inTuneThreshold === 10 ? 'btn-primary' : 'btn-ghost'}`}
              aria-pressed={inTuneThreshold === 10}
              onClick={() => onThresholdChange(10)}
              data-testid="settings-threshold-10"
            >
              Свободный (±10¢)
            </button>
          </div>
        </fieldset>

        {/* Пользовательские строи (Custom Tunings Builder) */}
        <div>
          <div className="set-section-head">
            <span className="eyebrow">Пользовательские строи</span>
            {!isCreatingCustom && (
              <button className="btn btn-ghost btn-sm" onClick={() => setIsCreatingCustom(true)} data-testid="custom-tuning-create">
                <Plus size={14} /> Создать строй
              </button>
            )}
          </div>

          {/* Форма создания своего строя */}
          {isCreatingCustom && (
            <div className="panel set-custom-form">
              <label htmlFor={tuningNameId} className="sr-only">Название строя</label>
              <input
                type="text"
                id={tuningNameId}
                placeholder="Название строя (например: Open Gm)"
                value={newTuningName}
                onChange={(e) => setNewTuningName(e.target.value)}
                className="set-custom-name"
                data-testid="custom-tuning-name"
              />

              <div className="set-strings-row">
                <span className="set-strings-label">Струн:</span>
                {[4, 5, 6, 7, 8].map(cnt => (
                  <button
                    key={cnt}
                    className={`btn btn-sm ${stringCount === cnt ? 'btn-primary' : 'btn-ghost'}`}
                    aria-pressed={stringCount === cnt}
                    aria-label={`${cnt} ${cnt === 4 ? 'струны' : 'струн'}`}
                    onClick={() => handleStringCountChange(cnt)}
                  >
                    {cnt}
                  </button>
                ))}
              </div>

              {/* Выбор ноты и октавы для каждой струны */}
              <div className="set-notes-grid">
                {customNotes.map((cn, i) => (
                  <div key={i} className="set-note-cell">
                    <span className="set-note-caption">{stringCount - i}-я струна:</span>
                    <div className="set-note-selects">
                      <select
                        aria-label={`Нота ${stringCount - i}-й струны`}
                        value={cn.note}
                        onChange={(e) => {
                          const updated = [...customNotes];
                          updated[i].note = e.target.value as NoteName;
                          setCustomNotes(updated);
                        }}
                        className="set-note-select"
                      >
                        {NOTE_NAMES.map(n => <option key={n} value={n}>{n}</option>)}
                      </select>
                      <select
                        aria-label={`Октава ${stringCount - i}-й струны`}
                        value={cn.octave}
                        onChange={(e) => {
                          const updated = [...customNotes];
                          updated[i].octave = Number(e.target.value);
                          setCustomNotes(updated);
                        }}
                        className="set-note-select"
                      >
                        {[1, 2, 3, 4, 5].map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </div>
                  </div>
                ))}
              </div>

              <div className="set-custom-actions">
                <button className="btn btn-ghost btn-sm" onClick={() => setIsCreatingCustom(false)}>
                  Отмена
                </button>
                <button className="btn btn-primary btn-sm" onClick={handleSaveNewCustomTuning} data-testid="custom-tuning-save">
                  <Check size={14} /> Сохранить строй
                </button>
              </div>
            </div>
          )}

          {/* Список сохраненных строёв */}
          {customTunings.length > 0 && (
            <div className="set-saved-list">
              {customTunings.map(ct => (
                <div key={ct.id} className="set-saved-item">
                  <div>
                    <b>{ct.name}</b>
                    <span className="set-saved-strings">
                      ({ct.strings.map(s => `${s.open.name}${s.open.octave}`).join(' ')})
                    </span>
                  </div>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => handleDeleteTuning(ct.id)}
                    data-testid="custom-tuning-delete"
                    aria-label="Удалить пользовательский строй"
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
        <button className="btn btn-primary set-save" onClick={onClose} data-testid="settings-close">
          Сохранить и закрыть
        </button>

        <p
          data-testid="settings-version"
          className="set-version"
        >
          Версия {APP_VERSION} · сборка {APP_COMMIT}
        </p>
      </div>
    </dialog>
  );
};
