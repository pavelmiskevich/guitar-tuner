# 🚀 Инструкция по сборке и деплою (Production Deployment Guide)

В данном руководстве описан процесс подготовки, сборки и развертывания веб-приложения на production-сервер (VPS / VDS) под управлением Linux с любым современным веб-сервером (Caddy, Nginx, Apache).

---

## 📋 Требования к окружению

### На машине разработчика:
* **Node.js**: версия `20.19+` или `22.12+` (LTS)
* **npm**: версия `10+`
* **SSH-клиент**: `ssh`, `scp` или `rsync`

### На сервере (VPS):
* Любой дистрибутив Linux (Ubuntu, Debian, AlmaLinux и др.)
* Веб-сервер: **Caddy** (рекомендуется для автоматического SSL) или **Nginx**
* Настроенный доступ по SSH (по паролю или SSH-ключам)

---

## 🛠️ Шаг 1. Локальная сборка проекта

Перед развертыванием необходимо проверить проект тестами и собрать оптимизированный статический бандл.

1. Установите зависимости:
   ```bash
   npm install
   ```

2. Запустите автоматические тесты (DSP, синтезаторы, теория музыки):
   ```bash
   npm test
   ```

3. Выполните сборку продакшн-бандла:
   ```bash
   npm run build
   ```
   В результате сборки в корне проекта появится папка `dist/` со статическими оптимизированными файлами (`index.html`, `assets/*.js`, `assets/*.css`, `fonts/*.woff2`, `sw.js`, `manifest.json` и др.).

   Приложение не обращается ни к одному стороннему хосту: шрифты лежат в `public/fonts/`
   и попадают в сборку (см. `src/ui/fonts.css`). Если каталог `fonts/` не доехал на
   сервер, интерфейс отрисуется системным шрифтом.

---

## 📦 Шаг 2. Доставка файлов на сервер (Deploy)

Сборка выкладывается **атомарно**: каждая версия распаковывается в собственный
каталог выпуска, и только потом на него переставляется симлинк `current`, на
который смотрит веб-сервер. Подмена симлинка происходит между запросами, поэтому
посетитель никогда не увидит полураспакованный сайт.

Раскладка на сервере (`<WEBROOT>` — каталог проекта, например `/var/www/guitar-tuner`):

```
<WEBROOT>/
├── current -> releases/20260816-223307   # симлинк, его переставляет выкладка
└── releases/
    ├── 20260816-223307/                  # index.html, assets/, fonts/, sw.js …
    └── 20260815-201530/                  # предыдущий выпуск — готовый откат
```

### Вариант A. Через архив tar (рекомендуемый)

> **Распаковывать только через `sudo`.** Каталоги под `<WEBROOT>` принадлежат
> `root`, и `tar` без прав суперпользователя не может выставить им режим и время —
> он валится с `Cannot change mode ... Operation not permitted` (код возврата 2)
> **уже после** записи файлов. Со стороны это выглядит как «деплой упал», хотя
> файлы частично обновились. Флаги `--no-same-permissions` не помогают: на
> существующие каталоги они не влияют.

> **Каждый выпуск — в чистый каталог.** Имена бандлов содержат хэш содержимого,
> поэтому распаковка поверх старого выпуска не удаляла бы предыдущие сборки —
> они копились бы годами. При выкладке в новый каталог этой проблемы нет вовсе.

**PowerShell (Windows):**
```powershell
# 1. Упаковка папки dist
tar -czf dist.tar.gz -C dist .

# 2. Копирование архива на сервер во временную папку
scp -P <PORT> dist.tar.gz <USER>@<SERVER_IP>:/tmp/dist.tar.gz

# 3. Распаковка в новый выпуск и атомарное переключение симлинка
ssh -p <PORT> <USER>@<SERVER_IP> "set -e; REL=<WEBROOT>/releases/`$(date +%Y%m%d-%H%M%S); sudo mkdir -p `$REL; sudo tar -xzf /tmp/dist.tar.gz -C `$REL; sudo chown -R root:root <WEBROOT>; sudo ln -sfn `$REL <WEBROOT>/current; rm -f /tmp/dist.tar.gz; echo `$REL"

# 4. Удаление локального временного архива
Remove-Item -Force dist.tar.gz
```

**Bash / macOS / Linux:**
```bash
# 1. Упаковка папки dist
tar -czf dist.tar.gz -C dist .

# 2. Копирование на сервер
scp -P <PORT> dist.tar.gz <USER>@<SERVER_IP>:/tmp/dist.tar.gz

# 3. Распаковка в новый выпуск и атомарное переключение симлинка
ssh -p <PORT> <USER>@<SERVER_IP> 'set -e
  REL=<WEBROOT>/releases/$(date +%Y%m%d-%H%M%S)
  sudo mkdir -p "$REL"
  sudo tar -xzf /tmp/dist.tar.gz -C "$REL"
  sudo chown -R root:root <WEBROOT>
  sudo ln -sfn "$REL" <WEBROOT>/current
  rm -f /tmp/dist.tar.gz
  echo "выложено: $REL"'

# 4. Очистка локального архива
rm -f dist.tar.gz
```

Перезагружать веб-сервер не нужно: он открывает файлы через симлинк на каждый
запрос и подхватывает новый выпуск сразу.

### Откат на предыдущий выпуск

```bash
# Список выпусков, свежие сверху. Сортировка по имени, а не по времени файла:
# имя каталога и есть отметка времени выкладки, а mtime сбивается при любом
# копировании и правке внутри выпуска.
ssh -p <PORT> <USER>@<SERVER_IP> 'ls -1 <WEBROOT>/releases | sort -r | head -5'
ssh -p <PORT> <USER>@<SERVER_IP> 'sudo ln -sfn <WEBROOT>/releases/<ВЫПУСК> <WEBROOT>/current'
```

### Уборка старых выпусков

Каждый выпуск занимает около 0.5 МБ, но копить их бесконечно незачем — оставляем
пять последних. Выпуск, на который смотрит `current`, исключается явно: после
отката он может оказаться и не в пятёрке свежих, а удалить работающий сайт из-под
себя — худшее, что может сделать команда уборки.

```bash
ssh -p <PORT> <USER>@<SERVER_IP> 'set -e
  CUR=$(basename "$(readlink <WEBROOT>/current)")
  cd <WEBROOT>/releases
  ls -1 | sort -r | tail -n +6 | grep -vx "$CUR" | xargs -r sudo rm -rf
  ls -1 | sort -r'
```

### Проверка после доставки

```bash
# Главная и текущий бандл отвечают 200, шрифты на месте
curl -s -o /dev/null -w "%{http_code}\n" https://<DOMAIN>/
curl -s https://<DOMAIN>/ | grep -o 'assets/index-[^"]*'
curl -s -o /dev/null -w "%{http_code}\n" https://<DOMAIN>/fonts/manrope-cyrillic.woff2
```

Хэш в `assets/index-*.js` должен совпадать с локальным `dist/assets/`. Если браузер
показывает старую версию — это Service Worker: он работает по стратегии
network-first, поэтому обновляется при первой же успешной загрузке, достаточно
обновить страницу.

### Вариант B. Через rsync (для Linux / macOS)
```bash
REL=<WEBROOT>/releases/$(date +%Y%m%d-%H%M%S)
rsync -avz --rsync-path="sudo rsync" -e "ssh -p <PORT>" dist/ <USER>@<SERVER_IP>:"$REL/"
ssh -p <PORT> <USER>@<SERVER_IP> "sudo ln -sfn $REL <WEBROOT>/current"
```

`--rsync-path="sudo rsync"` — по той же причине, что и `sudo` в варианте A: каталоги
принадлежат `root`. Если у пользователя нет `sudo` без пароля, вариант A с
предварительным `ssh` предпочтительнее.

Обратите внимание: выкладка **не** идёт прямо в `current` с `--delete`. Так сайт
несколько секунд отдавал бы полуобновлённое содержимое — ровно то, ради чего
и заведён симлинк.

---

## 🌐 Шаг 3. Конфигурация веб-сервера

### 1. Настройка Caddy (рекомендуется)
Caddy автоматически получает бесплатные Let's Encrypt SSL-сертификаты и идеально подходит для SPA.

Откройте конфигурацию `/etc/caddy/Caddyfile`:
```caddyfile
your-domain.com {
    # Корень — симлинк на текущий выпуск, а не сам каталог выпуска:
    # его перестановка атомарна (см. Шаг 2).
    root * <WEBROOT>/current
    file_server
    try_files {path} /index.html

    # Бандлы содержат хэш содержимого в имени: другое содержимое — другое имя,
    # поэтому их можно кэшировать навсегда.
    @assets path /assets/*
    header @assets Cache-Control "public, max-age=31536000, immutable"

    # Шрифты лежат под постоянными именами, поэтому без immutable: месяц кэша
    # даёт весь выигрыш, но позволяет заменить файл, не меняя ссылку.
    @fonts path /fonts/*
    header @fonts Cache-Control "public, max-age=2592000"

    # Страница, service worker и манифест обязаны проверяться при каждом заходе:
    # имена у них постоянные, и закэшированные они закрепят старую сборку.
    @nocache path / /index.html /sw.js /manifest.json
    header @nocache Cache-Control "no-cache"

    # Сжатие: zstd на уровне better обгоняет gzip примерно на 2.5%, на уровне по
    # умолчанию — наоборот, проигрывает ему. gzip остаётся запасным для браузеров
    # без поддержки zstd. Шрифты woff2 сжаты внутри — их сжимать незачем.
    @compressible path /assets/* / /index.html /sw.js /manifest.json *.svg
    encode @compressible {
        zstd better
        gzip
    }

    # Заголовки безопасности и разрешений микрофона
    header {
        Permissions-Policy "microphone=(self)"
        X-Content-Type-Options "nosniff"
        X-Frame-Options "DENY"
        Referrer-Policy "strict-origin-when-cross-origin"
    }
}
```

Эффект сжатия на текущей сборке: бандл **320 КБ → 97 КБ**, стили 9.4 → 3.1 КБ.

Перечитайте конфигурацию (без простоя):
```bash
sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
sudo systemctl reload caddy
```

> Если этот же блок Caddy обслуживает что-то помимо статики (прокси, API), не
> переписывайте его целиком и не вешайте `encode` без матчера пути: обработчик
> сжатия встанет и на пути остального трафика. Матчер `@compressible` выше
> ограничивает сжатие файлами сайта.

### 2. Настройка Nginx
Если на сервере используется Nginx, создайте конфигурацию в `/etc/nginx/sites-available/guitar-tuner`:
```nginx
server {
    listen 80;
    listen [::]:80;
    server_name your-domain.com;

    # Редирект на HTTPS
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    # Симлинк на текущий выпуск (см. Шаг 2). Nginx кэширует открытые
    # дескрипторы, поэтому после перестановки симлинка полезен reload.
    root <WEBROOT>/current;
    index index.html;

    # Поддержка SPA-роутинга
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Кэширование статических ассетов
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, no-transform";
    }

    # Service Worker и HTML не должны кэшироваться надолго
    location ~* (sw\.js|manifest\.json|index\.html)$ {
        expires -1;
        add_header Cache-Control "no-store, no-cache, must-revalidate";
    }

    # Разрешение на микрофон в PWA
    add_header Permissions-Policy "microphone=(self)";
}
```
Активируйте сайт и проверьте конфигурацию:
```bash
sudo ln -s /etc/nginx/sites-available/guitar-tuner /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## 🔒 Шаг 4. Важные нюансы Web Audio и микрофона

1. **Обязательность HTTPS / Secure Context**:
   Браузеры (Chrome, Safari, Firefox) блокируют вызовы `navigator.mediaDevices.getUserMedia()` на незащищенных соединениях (`http://`), за исключением `localhost`. Для работы микрофона на сервере **обязательно наличие валидного SSL-сертификата (HTTPS)**.
2. **PWA и Service Worker обновления**:
   В проекте настроена стратегия `Network-First`. При деплое новой сборки пользователи получают обновленный контент сразу при перезагрузке страницы.
3. **Безопасность конфигураций**:
   Никогда не коммитьте IP-адреса серверов, приватные ключи или персональные токены в репозиторий. Конфигурации окружения хранятся локально в `.env.local`.
