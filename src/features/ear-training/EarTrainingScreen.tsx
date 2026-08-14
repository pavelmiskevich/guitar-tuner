import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { Tuning } from '../../domain/tunings';
import type { NotationSystem } from '../../domain/notes';
import { formatNoteName, midiToFrequency, frequencyToMidi, midiToPitch, calculateCents, NOTE_NAMES } from '../../domain/notes';
import { sharedAudioEngine } from '../../audio/audioEngine';
import type { PitchEstimate } from '../../audio/dsp';
import { getFretNote } from '../../domain/fretboard';
import { COMMON_VOICINGS } from '../../domain/chords';
import { playGuitarString } from '../../audio/synth';
import {
  Volume2,
  Trophy,
  Flame,
  Award,
  Sparkles,
  HelpCircle
} from 'lucide-react';

interface EarTrainingScreenProps {
  tuning: Tuning;
  notation: NotationSystem;
  a4: number;
}

type GameMode = 'note' | 'string' | 'chord_quality';
type AnswerMode = 'buttons' | 'guitar';

/** Пауза перед автопереходом: хватает прочитать разбор, но не заставляет ждать. */
const AUTO_NEXT_MS = 3000;
/** Насколько близко сыгранная нота должна лечь к струне, чтобы считаться ею. */
const STRING_MATCH_CENTS = 120;
/** Сколько тишины считать паузой между щипками. */
const SILENCE_BEFORE_PLUCK_MS = 250;

interface QuestionState {
  targetLabel: string;
  targetMidi: number;
  options: string[];
  correctIndex: number;
  explanation: string;
  notesToPlay: { freq: number; delay: number }[];
}

export const EarTrainingScreen: React.FC<EarTrainingScreenProps> = ({
  tuning,
  notation,
  a4
}) => {
  const [gameMode, setGameMode] = useState<GameMode>('note');
  const [score, setScore] = useState(0);
  const [totalAttempts, setTotalAttempts] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(() => {
    return parseInt(localStorage.getItem('nr_ear_best_streak') || '0', 10);
  });
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [isAnswered, setIsAnswered] = useState(false);
  const [question, setQuestion] = useState<QuestionState | null>(null);
  const [isPlayingSound, setIsPlayingSound] = useState(false);
  const [answerMode, setAnswerMode] = useState<AnswerMode>('buttons');
  const [micError, setMicError] = useState<string | null>(null);

  const timeoutRef = useRef<number | null>(null);

  // Актуальные значения для обработчика аудиопотока: подписка живёт дольше
  // одного рендера, и замыкание на состояние давало бы устаревшие данные.
  const isAnsweredRef = useRef(isAnswered);
  const questionRef = useRef(question);
  const gameModeRef = useRef(gameMode);
  const a4Ref = useRef(a4);
  const notationRef = useRef(notation);
  const tuningRef = useRef(tuning);
  const handleSelectRef = useRef<(i: number) => void>(() => {});
  // Следующий ответ принимаем только после нового щипка: иначе непрерывно
  // звучащая струна отвечала бы снова сразу после автоперехода к следующему вопросу.
  const awaitingPluckRef = useRef(false);
  /** Когда в последний раз слышали звук: блокировку снимает устойчивая пауза. */
  const lastSoundAtRef = useRef(0);

  useEffect(() => { isAnsweredRef.current = isAnswered; }, [isAnswered]);
  useEffect(() => { questionRef.current = question; }, [question]);
  useEffect(() => { gameModeRef.current = gameMode; }, [gameMode]);
  useEffect(() => { a4Ref.current = a4; }, [a4]);
  useEffect(() => { notationRef.current = notation; }, [notation]);
  useEffect(() => { tuningRef.current = tuning; }, [tuning]);

  // Воспроизведение звука текущего вопроса
  const playCurrentSound = useCallback((notes: { freq: number; delay: number }[]) => {
    setIsPlayingSound(true);
    let maxDelay = 0;
    notes.forEach(({ freq, delay }) => {
      maxDelay = Math.max(maxDelay, delay);
      setTimeout(() => {
        playGuitarString(freq, 2.2);
      }, delay);
    });

    setTimeout(() => {
      setIsPlayingSound(false);
    }, maxDelay + 500);
  }, []);

  // Генерация нового вопроса в зависимости от режима
  const generateNewQuestion = useCallback(() => {
    setIsAnswered(false);
    setSelectedOption(null);

    if (gameMode === 'note') {
      // Выбираем случайную ноту в диапазоне 2-4 октавы
      const randomStrIdx = Math.floor(Math.random() * tuning.strings.length);
      const randomFret = Math.floor(Math.random() * 8);
      const targetNote = getFretNote(randomStrIdx, randomFret, tuning);
      const targetName = formatNoteName(targetNote.name, notation);
      const targetFreq = midiToFrequency(targetNote.midi, a4);

      // Генерируем 3 неправильных варианта
      const otherNames = NOTE_NAMES.filter(n => n !== targetNote.name)
        .map(n => formatNoteName(n, notation))
        .sort(() => Math.random() - 0.5)
        .slice(0, 3);

      const allOptions = [targetName, ...otherNames].sort(() => Math.random() - 0.5);
      const correctIdx = allOptions.indexOf(targetName);

      const q: QuestionState = {
        targetLabel: `${targetName} (${targetNote.name}${targetNote.octave})`,
        targetMidi: targetNote.midi,
        options: allOptions,
        correctIndex: correctIdx,
        explanation: `Звучала нота ${targetName}${targetNote.octave} (${targetFreq.toFixed(1)} Гц) на ${tuning.strings[randomStrIdx]?.stringNumber}-й струне, ${randomFret}-й лад.`,
        notesToPlay: [{ freq: targetFreq, delay: 0 }]
      };

      setQuestion(q);
      setTimeout(() => playCurrentSound(q.notesToPlay), 150);
    } else if (gameMode === 'string') {
      // Угадать открытую струну
      const strIdx = Math.floor(Math.random() * tuning.strings.length);
      const strSpec = tuning.strings[strIdx];
      const strNoteName = formatNoteName(strSpec.open.name, notation);
      const targetFreq = midiToFrequency(strSpec.open.midi, a4);

      const options = tuning.strings.map(s => `${s.stringNumber}-я струна (${formatNoteName(s.open.name, notation)}${s.open.octave})`);
      const correctIdx = strIdx;

      const q: QuestionState = {
        targetLabel: `${strSpec.stringNumber}-я струна (${strNoteName}${strSpec.open.octave})`,
        targetMidi: strSpec.open.midi,
        options: options,
        correctIndex: correctIdx,
        explanation: `Звучала открытая ${strSpec.stringNumber}-я струна: ${strNoteName}${strSpec.open.octave} (${targetFreq.toFixed(1)} Гц).`,
        notesToPlay: [{ freq: targetFreq, delay: 0 }]
      };

      setQuestion(q);
      setTimeout(() => playCurrentSound(q.notesToPlay), 150);
    } else if (gameMode === 'chord_quality') {
      // Мажор или Минор
      const isMajor = Math.random() > 0.5;
      const filteredVoicings = COMMON_VOICINGS.filter(v =>
        isMajor
          ? (v.name.includes('Major') || v.name === 'C' || v.name === 'G' || v.name === 'D' || v.name === 'E' || v.name === 'A')
          : (v.name.includes('Minor') || v.name.includes('m') || v.name === 'Am' || v.name === 'Em' || v.name === 'Dm')
      );

      const randomVoicing = filteredVoicings[Math.floor(Math.random() * filteredVoicings.length)] || COMMON_VOICINGS[0];
      const options = ['Мажор (Светлый / Радостный)', 'Минор (Грустный / Драматичный)'];
      const correctIdx = isMajor ? 0 : 1;

      const notes: { freq: number; delay: number }[] = [];
      let delay = 0;
      randomVoicing.frets.forEach((fret, sIdx) => {
        if (fret !== 'x') {
          const note = getFretNote(sIdx, fret, tuning);
          notes.push({ freq: midiToFrequency(note.midi, a4), delay });
          delay += 100;
        }
      });

      const q: QuestionState = {
        targetLabel: `${randomVoicing.name} (${isMajor ? 'Мажор' : 'Минор'})`,
        targetMidi: 0,
        options: options,
        correctIndex: correctIdx,
        explanation: `Звучал аккорд ${randomVoicing.name} — это ${isMajor ? 'мажорное' : 'минорное'} трезвучие.`,
        notesToPlay: notes
      };

      setQuestion(q);
      setTimeout(() => playCurrentSound(q.notesToPlay), 150);
    }
  }, [gameMode, tuning, notation, a4, playCurrentSound]);

  // Запуск игры при смене режима
  useEffect(() => {
    generateNewQuestion();
    return () => {
      // Таймер ставится уже после запуска эффекта (при ответе на вопрос), поэтому
      // читать нужно именно актуальное значение ref: копия, снятая на старте
      // эффекта, всегда была бы null и оставляла бы таймер висеть.
      // oxlint-disable-next-line react-hooks/exhaustive-deps
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [generateNewQuestion]);

  const handleSelectOption = (index: number) => {
    if (isAnswered || !question) return;

    setSelectedOption(index);
    setIsAnswered(true);
    setTotalAttempts(prev => prev + 1);

    const isCorrect = index === question.correctIndex;
    if (isCorrect) {
      setScore(prev => prev + 1);
      const newStreak = streak + 1;
      setStreak(newStreak);
      if (newStreak > bestStreak) {
        setBestStreak(newStreak);
        localStorage.setItem('nr_ear_best_streak', newStreak.toString());
      }
      // Победный звук (пентатоника вверх)
      setTimeout(() => {
        playGuitarString(523.25, 0.4); // C5
        setTimeout(() => playGuitarString(659.25, 0.4), 80); // E5
        setTimeout(() => playGuitarString(783.99, 0.8), 160); // G5
      }, 200);
    } else {
      setStreak(0);
    }
  };

  // Автопереход к следующему вопросу: экран тренажёра рассчитан на серию
  // ответов подряд, и ручное нажатие после каждого сбивает ритм занятия.
  useEffect(() => {
    if (!isAnswered) return;
    const t = window.setTimeout(() => generateNewQuestion(), AUTO_NEXT_MS);
    return () => window.clearTimeout(t);
  }, [isAnswered, generateNewQuestion]);

  // Ответ игрой на инструменте. Режим «Мажор/минор» сюда не попадает:
  // характер аккорда одной струной не сыграть, переключатель там скрыт.
  useEffect(() => {
    if (answerMode !== 'guitar' || gameMode === 'chord_quality') return;

    const unsubscribe = sharedAudioEngine.subscribe((estimate: PitchEstimate) => {
      // Блокировку снимает УСТОЙЧИВАЯ пауза, а не одиночный тихий кадр:
      // при кратковременном провале громкости затухающая струна иначе
      // засчиталась бы как новый щипок.
      if (estimate.isSilent || estimate.frequency <= 0 || estimate.clarity < 0.5) {
        if (performance.now() - lastSoundAtRef.current >= SILENCE_BEFORE_PLUCK_MS) {
          awaitingPluckRef.current = false;
        }
        return;
      }
      lastSoundAtRef.current = performance.now();
      if (isAnsweredRef.current || !questionRef.current || awaitingPluckRef.current) return;

      const q = questionRef.current;
      const freq = estimate.frequency;
      let matched = -1;

      if (gameModeRef.current === 'note') {
        // Вопрос про ноту, а не про октаву: E2 и E4 одинаково засчитываются за E.
        const name = midiToPitch(frequencyToMidi(freq, a4Ref.current)).name;
        matched = q.options.indexOf(formatNoteName(name, notationRef.current));
      } else {
        // Ищем ближайшую открытую струну и требуем попадания в узкий допуск,
        // иначе случайный звук засчитался бы за ответ.
        let best = -1;
        let bestCents = Infinity;
        tuningRef.current.strings.forEach((str, i) => {
          const d = Math.abs(calculateCents(freq, midiToFrequency(str.open.midi, a4Ref.current)));
          if (d < bestCents) { bestCents = d; best = i; }
        });
        if (bestCents <= STRING_MATCH_CENTS) matched = best;
      }

      // Посторонний звук просто игнорируется — он не должен обнулять серию.
      if (matched >= 0) {
        awaitingPluckRef.current = true;
        handleSelectRef.current(matched);
      }
    });

    return unsubscribe;
  }, [answerMode, gameMode]);

  useEffect(() => { handleSelectRef.current = handleSelectOption; });

  const enableGuitarAnswers = async () => {
    setMicError(null);
    try {
      await sharedAudioEngine.start();
      setAnswerMode('guitar');
    } catch (e) {
      setMicError(e instanceof Error ? e.message : 'Нет доступа к микрофону');
    }
  };

  const handleNext = () => {
    generateNewQuestion();
  };

  const accuracy = totalAttempts > 0 ? Math.round((score / totalAttempts) * 100) : 100;

  return (
    <div className="ear-screen" style={{ width: '100%', maxWidth: '640px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 'var(--s4)' }}>
      {/* Заголовок и выбор режима */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <span className="eyebrow">Обучение и слух</span>
          <h2 style={{ fontSize: '20px', margin: 0 }}>Тренажер музыкального слуха</h2>
        </div>

        {/* Переключатель режимов игры */}
        <div style={{ display: 'flex', background: 'var(--ink-900)', border: '1px solid var(--ink-700)', borderRadius: 'var(--r-pill)', padding: '3px' }}>
          <button
            className="btn btn-sm"
            style={{
              background: gameMode === 'note' ? 'var(--brand)' : 'transparent',
              color: gameMode === 'note' ? '#fff' : 'var(--ink-300)',
              borderRadius: 'var(--r-pill)',
              padding: '6px 12px'
            }}
            onClick={() => setGameMode('note')}
            data-testid="et-mode-note"
          >
            Ноты
          </button>
          <button
            className="btn btn-sm"
            style={{
              background: gameMode === 'string' ? 'var(--brand)' : 'transparent',
              color: gameMode === 'string' ? '#fff' : 'var(--ink-300)',
              borderRadius: 'var(--r-pill)',
              padding: '6px 12px'
            }}
            onClick={() => setGameMode('string')}
            data-testid="et-mode-string"
          >
            Струны
          </button>
          <button
            className="btn btn-sm"
            style={{
              background: gameMode === 'chord_quality' ? 'var(--brand)' : 'transparent',
              color: gameMode === 'chord_quality' ? '#fff' : 'var(--ink-300)',
              borderRadius: 'var(--r-pill)',
              padding: '6px 12px'
            }}
            onClick={() => setGameMode('chord_quality')}
            data-testid="et-mode-quality"
          >
            Мажор/Минор
          </button>
        </div>
      </div>

      {/* Статистика игрока (Очки, Стрик, Точность) */}
      <div
        className="ear-stats"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '12px',
          background: 'var(--ink-900)',
          border: '1px solid var(--ink-700)',
          borderRadius: 'var(--r-md)',
          padding: '8px 12px',
          textAlign: 'center'
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', color: 'var(--sig-in)', fontSize: '12px', fontWeight: 600 }}>
            <Award size={14} /> Очки
          </div>
          <div style={{ fontSize: '20px', fontWeight: 900, fontFamily: 'var(--font-num)', marginTop: '2px' }} data-testid="et-score">
            {score} / {totalAttempts}
          </div>
        </div>

        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', color: streak > 2 ? 'var(--sig-near)' : 'var(--ink-300)', fontSize: '12px', fontWeight: 600 }}>
            <Flame size={14} /> Серия
          </div>
          <div style={{ fontSize: '20px', fontWeight: 900, fontFamily: 'var(--font-num)', marginTop: '2px', color: streak > 2 ? 'var(--sig-near)' : 'inherit' }} data-testid="et-streak">
            {streak} 🔥
          </div>
        </div>

        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', color: 'var(--brand)', fontSize: '12px', fontWeight: 600 }}>
            <Trophy size={14} /> Рекорд
          </div>
          <div style={{ fontSize: '20px', fontWeight: 900, fontFamily: 'var(--font-num)', marginTop: '2px' }} data-testid="et-best">
            {bestStreak} ({accuracy}%)
          </div>
        </div>
      </div>

      {/* Способ ответа. В режиме «Мажор/минор» скрыт: характер аккорда
          одной струной не сыграть. */}
      {gameMode !== 'chord_quality' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', fontSize: '12px', color: 'var(--ink-300)' }}>
          <span>Отвечать:</span>
          <div style={{ display: 'flex', background: 'var(--ink-900)', border: '1px solid var(--ink-700)', borderRadius: 'var(--r-pill)', padding: '3px' }}>
            <button
              className="btn btn-sm"
              data-testid="et-input-buttons"
              aria-pressed={answerMode === 'buttons'}
              style={{
                background: answerMode === 'buttons' ? 'var(--brand-strong)' : 'transparent',
                color: answerMode === 'buttons' ? '#fff' : 'var(--ink-300)',
                borderRadius: 'var(--r-pill)',
                padding: '6px 12px'
              }}
              onClick={() => setAnswerMode('buttons')}
            >
              Кнопками
            </button>
            <button
              className="btn btn-sm"
              data-testid="et-input-guitar"
              aria-pressed={answerMode === 'guitar'}
              style={{
                background: answerMode === 'guitar' ? 'var(--brand-strong)' : 'transparent',
                color: answerMode === 'guitar' ? '#fff' : 'var(--ink-300)',
                borderRadius: 'var(--r-pill)',
                padding: '6px 12px'
              }}
              onClick={enableGuitarAnswers}
            >
              Игрой на гитаре
            </button>
          </div>
          {answerMode === 'guitar' && !micError && (
            <span data-testid="et-guitar-hint" style={{ color: 'var(--sig-in)' }}>
              {gameMode === 'string' ? 'Сыграйте открытую струну' : 'Сыграйте услышанную ноту'}
            </span>
          )}
          {micError && (
            <span data-testid="et-mic-error" style={{ color: 'var(--sig-off)' }}>
              Нет доступа к микрофону
            </span>
          )}
        </div>
      )}

      {/* Центральная карточка вопроса с большой кнопкой прослушивания */}
      <div
        className="panel"
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 'var(--s5) var(--s4)',
          textAlign: 'center',
          gap: '10px',
          minHeight: '150px',
          position: 'relative'
        }}
      >
        <span className="eyebrow" style={{ color: 'var(--brand)' }}>
          {gameMode === 'note' ? 'Какая нота звучит?' : gameMode === 'string' ? 'Какая струна прозвучала?' : 'Какой характер у аккорда?'}
        </span>

        {/* Большая интерактивная кнопка повтора звука */}
        <button
          className="btn btn-primary"
          onClick={() => question && playCurrentSound(question.notesToPlay)}
          disabled={isPlayingSound}
          data-testid="et-play"
          style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: isPlayingSound ? '0 0 25px var(--brand)' : '0 4px 16px rgba(110, 86, 248, 0.4)',
            transform: isPlayingSound ? 'scale(1.08)' : 'scale(1)',
            transition: 'all 150ms ease'
          }}
          title="Нажмите, чтобы прослушать ещё раз"
        >
          <Volume2 size={30} />
        </button>

        <span style={{ fontSize: '13px', color: 'var(--ink-300)' }}>
          {isPlayingSound ? 'Звучит инструмент...' : 'Нажмите на кнопку с динамиком, чтобы повторить звук'}
        </span>
      </div>

      {/* Варианты ответов */}
      {question && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          {question.options.map((opt, idx) => {
            const isCorrect = idx === question.correctIndex;
            const isChosen = idx === selectedOption;

            let btnBg = 'var(--ink-900)';
            let borderColor = 'var(--ink-700)';
            let textColor = 'var(--ink-050)';

            if (isAnswered) {
              if (isCorrect) {
                btnBg = 'color-mix(in srgb, var(--sig-in) 20%, var(--ink-900))';
                borderColor = 'var(--sig-in)';
                textColor = 'var(--sig-in)';
              } else if (isChosen) {
                btnBg = 'color-mix(in srgb, var(--sig-off) 20%, var(--ink-900))';
                borderColor = 'var(--sig-off)';
                textColor = 'var(--sig-off)';
              }
            }

            return (
              <button
                key={idx}
                onClick={() => handleSelectOption(idx)}
                disabled={isAnswered}
                data-testid={`et-answer-${idx}`}
                style={{
                  background: btnBg,
                  border: `2px solid ${borderColor}`,
                  borderRadius: 'var(--r-md)',
                  padding: '12px',
                  fontSize: '15px',
                  fontWeight: 800,
                  color: textColor,
                  cursor: isAnswered ? 'default' : 'pointer',
                  transition: 'all 150ms ease',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px'
                }}
              >
                <span>{opt}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Пояснение и кнопка «Следующий вопрос» */}
      {isAnswered && question && (
        <div
          className={`banner ${selectedOption === question.correctIndex ? 'ok' : 'err'}`}
          style={{ animation: 'fadeIn 200ms ease', display: 'flex', flexDirection: 'column', gap: '12px' }}
          data-testid="et-feedback"
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {selectedOption === question.correctIndex ? (
              <Sparkles size={22} color="var(--sig-in)" />
            ) : (
              <HelpCircle size={22} color="var(--sig-off)" />
            )}
            <div>
              <b>{selectedOption === question.correctIndex ? 'Правильно! Отличный слух!' : 'Не совсем точно'}</b>
              <span>{question.explanation}</span>
            </div>
          </div>

          <button
            className="btn btn-primary"
            onClick={handleNext}
            data-testid="et-next"
            style={{ width: '100%', marginTop: '4px', fontSize: '15px', fontWeight: 800 }}
          >
            Следующий вопрос →
          </button>
        </div>
      )}
    </div>
  );
};
