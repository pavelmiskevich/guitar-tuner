import React, { useState } from 'react';
import { Coffee, Heart, ExternalLink, Sparkles, Check, Copy } from 'lucide-react';

interface DonateCardProps {
  // Props
}

export const DonateCard: React.FC<DonateCardProps> = () => {
  const [copied, setCopied] = useState(false);
  const [selectedSum, setSelectedSum] = useState<number>(250);

  // Ссылки на донатные платформы (пользователь может заменить на свои реальные адреса)
  const donateLinks = {
    cloudtips: 'https://pay.cloudtips.ru/',
    boosty: 'https://boosty.to/',
    donationalerts: 'https://www.donationalerts.com/',
    yoomoney: 'https://yoomoney.ru/'
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.origin);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className="panel"
      style={{
        width: '100%',
        background: 'linear-gradient(135deg, rgba(110, 86, 248, 0.12) 0%, rgba(25, 22, 54, 0.95) 100%)',
        border: '1px solid color-mix(in srgb, var(--brand) 40%, var(--ink-700))',
        borderRadius: 'var(--r-lg)',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        position: 'relative',
        overflow: 'hidden',
        boxShadow: '0 8px 30px rgba(0,0,0,0.3)'
      }}
    >
      {/* Декоративная подсветка */}
      <div
        style={{
          position: 'absolute',
          top: '-40px',
          right: '-40px',
          width: '120px',
          height: '120px',
          background: 'var(--brand)',
          opacity: 0.15,
          borderRadius: '50%',
          filter: 'blur(30px)',
          pointerEvents: 'none'
        }}
      />

      {/* Заголовок блока */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: 'var(--r-md)',
              background: 'linear-gradient(135deg, var(--brand) 0%, #9B82FC 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#FFFFFF',
              boxShadow: '0 4px 12px rgba(110, 86, 248, 0.35)'
            }}
          >
            <Coffee size={24} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <h3 style={{ fontSize: '17px', fontWeight: 800, margin: 0, color: 'var(--ink-050)' }}>
                Поддержать автора
              </h3>
              <Sparkles size={16} color="var(--brand)" />
            </div>
            <span style={{ fontSize: '12px', color: 'var(--ink-300)', lineHeight: 1.4 }}>
              Понравился тюнер? Ваша поддержка вдохновляет развивать новые функции и алгоритмы!
            </span>
          </div>
        </div>
      </div>

      {/* Быстрый выбор суммы */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ink-300)' }}>Сумма:</span>
        {[100, 250, 500, 1000].map((sum) => (
          <button
            key={sum}
            onClick={() => setSelectedSum(sum)}
            style={{
              padding: '6px 12px',
              borderRadius: 'var(--r-pill)',
              background: selectedSum === sum ? 'var(--brand)' : 'var(--ink-800)',
              color: selectedSum === sum ? '#fff' : 'var(--ink-200)',
              border: `1px solid ${selectedSum === sum ? 'var(--brand)' : 'var(--ink-700)'}`,
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 120ms ease'
            }}
          >
            {sum} ₽
          </button>
        ))}
      </div>

      {/* Кнопки сервисов для отправки доната */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px' }}>
        <a
          href={donateLinks.cloudtips}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-primary"
          style={{
            padding: '10px 14px',
            fontSize: '13px',
            fontWeight: 800,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            textDecoration: 'none'
          }}
        >
          <Heart size={15} /> Чаевые (СБП / Карты)
        </a>

        <a
          href={donateLinks.boosty}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-ghost"
          style={{
            padding: '10px 14px',
            fontSize: '13px',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            textDecoration: 'none',
            border: '1px solid var(--ink-700)',
            background: 'var(--ink-900)'
          }}
        >
          Boosty <ExternalLink size={14} />
        </a>

        <a
          href={donateLinks.donationalerts}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-ghost"
          style={{
            padding: '10px 14px',
            fontSize: '13px',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            textDecoration: 'none',
            border: '1px solid var(--ink-700)',
            background: 'var(--ink-900)'
          }}
        >
          DonationAlerts <ExternalLink size={14} />
        </a>
      </div>

      {/* Поделиться ссылкой на проект */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '8px', borderTop: '1px solid var(--ink-800)' }}>
        <span style={{ fontSize: '11px', color: 'var(--ink-400)' }}>
          Или просто поделитесь ссылкой на приложение с друзьями-гитаристами!
        </span>
        <button
          className="btn btn-ghost btn-sm"
          onClick={handleCopyLink}
          style={{ padding: '4px 10px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}
        >
          {copied ? (
            <>
              <Check size={12} color="var(--sig-in)" /> Скопировано!
            </>
          ) : (
            <>
              <Copy size={12} /> Скопировать ссылку
            </>
          )}
        </button>
      </div>
    </div>
  );
};
