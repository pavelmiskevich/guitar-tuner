import React, { useState } from 'react';
import { Coffee, Heart, ExternalLink, Sparkles, Check, Copy, QrCode } from 'lucide-react';
import { getPublicSiteUrl } from '../../domain/siteUrl';
import { copyToClipboard } from '../../ui/clipboard';
import { HAS_DONATE_QR } from '../../buildInfo';
import './donate.css';

/**
 * Карточка доната. Под React.memo: пропсов у неё нет, а родитель — экран
 * тюнера — перерисовывается на каждом изменении показаний (#14).
 */
export const DonateCard = React.memo(function DonateCard() {
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
    <div className="panel don-card">
      {/* Декоративная подсветка */}
      <div className="don-glow" />

      {/* Верхний ряд: заголовок и описание */}
      <div className="don-head">
        <div className="don-icon">
          <Coffee size={22} />
        </div>
        <div className="don-head-text">
          <div className="don-title-row">
            <h3 className="don-title">
              Поддержать автора
            </h3>
            <Sparkles size={14} color="var(--brand)" />
          </div>
          <span className="don-lead">
            Понравился тюнер? Буду благодарен за любую поддержку на кофе и развитие проекта!
          </span>
        </div>
      </div>

      {/* Основной контент: кликабельный QR-код и кнопка перехода */}
      <div className="don-body">
        {/* Интерактивный QR-код с гармоничным темным фоном в тон кнопок;
            подсветка при наведении — в donate.css (:hover) */}
        <a
          href={donationUrl}
          target="_blank"
          rel="noopener noreferrer"
          title="Нажмите, чтобы открыть страницу доната CloudTips"
          className="don-qr"
        >
          {!imgError ? (
            <div className="don-qr-frame">
              <img
                src="/qrCode.png"
                alt="QR-код для доната CloudTips"
                onError={() => setImgError(true)}
                className="don-qr-img"
              />
            </div>
          ) : (
            <div className="don-qr-fallback">
              <QrCode size={42} />
              <span className="don-qr-fallback-label">CloudTips QR</span>
            </div>
          )}
          <span className="don-qr-caption">
            Нажмите или сканируйте 📷
          </span>
        </a>

        {/* Правая часть: кнопка быстрого перехода и инфо */}
        <div className="don-side">
          <div className="don-side-title">
            Быстрый перевод через <b>CloudTips</b>:
          </div>
          <div className="don-side-note">
            Оплата в 1 клик через <b>СБП</b>, T-Pay, SberPay или банковские карты.
          </div>

          <a
            href={donationUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-primary don-tip"
          >
            <Heart size={15} /> Отправить чаевые <ExternalLink size={13} />
          </a>
        </div>
      </div>

      {/* Нижняя строка: поделиться ссылкой */}
      <div className="don-footer">
        <span className="don-footer-text">
          Или поделитесь ссылкой на тюнер с друзьями:
        </span>
        <button
          className="btn btn-ghost btn-sm don-copy"
          onClick={handleCopyLink}
        >
          {copyStatus === 'copied' ? (
            <>
              <Check size={12} color="var(--sig-in)" /> Скопировано!
            </>
          ) : copyStatus === 'failed' ? (
            <span className="don-copy-failed">Не удалось скопировать</span>
          ) : (
            <>
              <Copy size={12} /> Скопировать ссылку
            </>
          )}
        </button>
      </div>
    </div>
  );
});
