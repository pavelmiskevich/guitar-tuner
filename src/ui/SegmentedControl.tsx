import React from 'react';

export interface SegmentedOption<T extends string> {
  value: T;
  label: React.ReactNode;
  testId?: string;
}

interface SegmentedControlProps<T extends string> {
  /** Подпись группы для скринридера: на экране её роль играет заголовок рядом. */
  label: string;
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
}

/**
 * Переключатель-«пилюля» (#16): режимы проверки аккорда, метронома,
 * тренажёра и грифа. Раньше каждый экран рисовал его своим набором
 * инлайновых стилей; выбранный пункт сообщается через aria-pressed (#11).
 */
export function SegmentedControl<T extends string>({ label, options, value, onChange }: SegmentedControlProps<T>) {
  return (
    <fieldset className="segmented">
      <legend className="sr-only">{label}</legend>
      {options.map(o => (
        <button
          key={o.value}
          type="button"
          className="btn btn-sm segmented-btn"
          aria-pressed={o.value === value}
          data-testid={o.testId}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </fieldset>
  );
}
