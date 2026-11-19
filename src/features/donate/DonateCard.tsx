import React, { useState } from 'react';
import { Coffee, Heart, ExternalLink, Sparkles, Check, Copy, QrCode } from 'lucide-react';
import { getPublicSiteUrl } from '../../domain/siteUrl';
import { copyToClipboard } from '../../ui/clipboard';
import { HAS_DONATE_QR } from '../../buildInfo';

interface DonateCardProps {
  // Props
}

export const DonateCard: React.FC<DonateCardProps> = () => {
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  // Без QR-кода в сборке картинку не запрашиваем вовсе: в офлайне запрос
  // несуществующего файла падал с ошибкой. Запасной значок — сразу.
  const [imgError, setImgError] = useState(!HAS_DONATE_QR);

  const donationUrl = 'https://pay.cloudtips.ru/p/05d48070';

  const handleCopyLink = async () => {
    // Получение публичного адреса сайта (через env в разработке или dynamic origin на бою)
    const baseSiteUrl = getPublicSiteUrl();
    const currentUrl = baseSiteUrl.endsWith('/') ? baseSiteUrl : `${baseSiteUrl}/`;
    const ok = await copyToClipboard(currentUrl);
    setCopyStatus(ok ? 'copied' : 'failed');
    setTimeout(() => setCopyStatus('idle'), ok ? 2000 : 4000);
  };

  return (
    <div
      className="panel"
      style={{
        width: '100%',
        // Раньше градиент уходил в тёмный индиго rgba(20, 17, 44): в теме «День»
        // текст --ink-050 (там он тёмный) оказывался на тёмном фоне.
        background: 'linear-gradient(135deg, color-mix(in srgb, var(--brand) 8%, var(--ink-800)) 0%, var(--ink-800) 100%)',
        border: '1px solid color-mix(in srgb, var(--brand) 30%, var(--ink-700))',
        borderRadius: 'var(--r-lg)',
        padding: '18px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
        position: 'relative',
        overflow: 'hidden',
        boxShadow: '0 6px 24px var(--shadow-soft)'
      }}
    >
      {/* Декоративная подсветка */}
      <div
        style={{
          position: 'absolute',
          top: '-30px',
          right: '-30px',
          width: '100px',
          height: '100px',
          background: 'var(--brand)',
          opacity: 0.12,
          borderRadius: '50%',
          filter: 'blur(25px)',
          pointerEvents: 'none'
        }}
      />

      {/* Верхний ряд: заголовок и описание */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div
          style={{
            width: '40px',
            height: '40px',
            borderRadius: 'var(--r-md)',
            background: 'linear-gradient(135deg, var(--brand-strong) 0%, var(--brand) 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--on-brand)',
            boxShadow: '0 3px 10px var(--shadow-brand)',
            flexShrink: 0
          }}
        >
          <Coffee size={22} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 800, margin: 0, color: 'var(--ink-050)' }}>
              Поддержать автора
            </h3>
            <Sparkles size={14} color="var(--brand)" />
          </div>
          <span style={{ fontSize: '12px', color: 'var(--ink-300)', lineHeight: 1.35 }}>
            Понравился тюнер? Буду благодарен за любую поддержку на кофе и развитие проекта!
          </span>
        </div>
      </div>

      {/* Основной контент: кликабельный QR-код и кнопка перехода */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          background: 'var(--ink-900)',
          border: '1px solid var(--ink-700)',
          borderRadius: 'var(--r-md)',
          padding: '12px 14px',
          flexWrap: 'wrap'
        }}
      >
        {/* Интерактивный QR-код с гармоничным темным фоном в тон кнопок */}
        <a
          href={donationUrl}
          target="_blank"
          rel="noopener noreferrer"
          title="Нажмите, чтобы открыть страницу доната CloudTips"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textDecoration: 'none',
            background: 'var(--ink-800)',
            border: '1px solid var(--ink-600)',
            padding: '8px',
            borderRadius: 'var(--r-md)',
            boxShadow: '0 4px 14px var(--shadow-soft)',
            transition: 'all 150ms ease',
            cursor: 'pointer',
            flexShrink: 0
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'scale(1.04)';
            e.currentTarget.style.borderColor = 'var(--brand)';
            e.currentTarget.style.boxShadow = '0 6px 20px var(--shadow-brand)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
            e.currentTarget.style.borderColor = 'var(--ink-600)';
            e.currentTarget.style.boxShadow = '0 4px 14px var(--shadow-soft)';
          }}
        >
          {!imgError ? (
            <div
              style={{
                background: '#EAE7FA',
                padding: '6px',
                borderRadius: 'var(--r-sm)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <img
                src="/qrCode.png"
                alt="QR-код для доната CloudTips"
                onError={() => setImgError(true)}
                style={{
                  width: '92px',
                  height: '92px',
                  objectFit: 'contain',
                  display: 'block',
                  borderRadius: '2px'
                }}
              />
            </div>
          ) : (
            <div
              style={{
                width: '104px',
                height: '104px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'var(--ink-700)',
                color: 'var(--brand)',
                borderRadius: 'var(--r-sm)'
              }}
            >
              <QrCode size={42} />
              <span style={{ fontSize: '9px', fontWeight: 800, marginTop: '4px', color: 'var(--ink-100)' }}>CloudTips QR</span>
            </div>
          )}
          <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--ink-100)', marginTop: '6px', textAlign: 'center' }}>
            Нажмите или сканируйте 📷
          </span>
        </a>

        {/* Правая часть: кнопка быстрого перехода и инфо */}
        <div style={{ flex: 1, minWidth: '180px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink-100)' }}>
            Быстрый перевод через <b>CloudTips</b>:
          </div>
          <div style={{ fontSize: '11px', color: 'var(--ink-300)', lineHeight: 1.4 }}>
            Оплата в 1 клик через <b>СБП</b>, T-Pay, SberPay или банковские карты.
          </div>

          <a
            href={donationUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-primary"
            style={{
              padding: '10px 14px',
              fontSize: '13px',
              fontWeight: 800,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              textDecoration: 'none',
              marginTop: '4px',
              boxShadow: '0 4px 14px var(--shadow-brand)'
            }}
          >
            <Heart size={15} /> Отправить чаевые <ExternalLink size={13} />
          </a>
        </div>
      </div>

      {/* Нижняя строка: поделиться ссылкой */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '4px' }}>
        <span style={{ fontSize: '11px', color: 'var(--ink-300)' }}>
          Или поделитесь ссылкой на тюнер с друзьями:
        </span>
        <button
          className="btn btn-ghost btn-sm"
          onClick={handleCopyLink}
          style={{ padding: '3px 8px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}
        >
          {copyStatus === 'copied' ? (
            <>
              <Check size={12} color="var(--sig-in)" /> Скопировано!
            </>
          ) : copyStatus === 'failed' ? (
            <span style={{ color: 'var(--sig-off)' }}>Не удалось скопировать</span>
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
