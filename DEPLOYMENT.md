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

Для быстрой и атомарной доставки рекомендуется упаковать каталог `dist/` в архив `tar.gz`, передать его через `scp` и распаковать в целевую директорию веб-сервера.

### Вариант A. Через архив tar (рекомендуемый, быстрый)

> **Распаковывать только через `sudo`.** Каталог `/var/www/html` принадлежит `root`,
> и `tar` без прав суперпользователя не может выставить каталогам режим и время —
> он валится с `Cannot change mode ... Operation not permitted` (код возврата 2)
> **уже после** записи файлов. Со стороны это выглядит как «деплой упал», хотя
> файлы частично обновились. Не пытайтесь обойти это флагами `--no-same-permissions`:
> на существующие каталоги они не влияют.

> **Старые бандлы удаляются вместе с каталогом `assets/`.** Имена файлов содержат
> хэш содержимого, поэтому распаковка поверх не удаляет предыдущие сборки — они
> копятся годами. `index.html` всегда ссылается на актуальные, так что снос
> каталога целиком безопасен.

**PowerShell (Windows):**
```powershell
# 1. Упаковка папки dist
tar -czf dist.tar.gz -C dist .

# 2. Копирование архива на сервер во временную папку
scp -P <PORT> dist.tar.gz <USER>@<SERVER_IP>:/tmp/dist.tar.gz

# 3. Снос старых бандлов, распаковка и выставление прав
ssh -p <PORT> <USER>@<SERVER_IP> "sudo rm -rf /var/www/html/assets && sudo mkdir -p /var/www/html && sudo tar -xzf /tmp/dist.tar.gz -C /var/www/html/ && sudo chown -R root:root /var/www/html && rm -f /tmp/dist.tar.gz"

# 4. Удаление локального временного архива
Remove-Item -Force dist.tar.gz
```

**Bash / macOS / Linux:**
```bash
# 1. Упаковка папки dist
tar -czf dist.tar.gz -C dist .

# 2. Копирование на сервер
scp -P <PORT> dist.tar.gz <USER>@<SERVER_IP>:/tmp/dist.tar.gz

# 3. Снос старых бандлов, распаковка и права
ssh -p <PORT> <USER>@<SERVER_IP> "sudo rm -rf /var/www/html/assets && sudo mkdir -p /var/www/html && sudo tar -xzf /tmp/dist.tar.gz -C /var/www/html/ && sudo chown -R root:root /var/www/html && rm -f /tmp/dist.tar.gz"

# 4. Очистка локального архива
rm -f dist.tar.gz
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
rsync -avz --delete --rsync-path="sudo rsync" -e "ssh -p <PORT>" dist/ <USER>@<SERVER_IP>:/var/www/html/
```

`--delete` сам убирает бандлы прошлых сборок, отдельный `rm -rf assets` не нужен.
`--rsync-path="sudo rsync"` — по той же причине, что и `sudo` в варианте A: каталог
принадлежит `root`. Если у пользователя нет `sudo` без пароля, вариант A с
предварительным `ssh` предпочтительнее.

---

## 🌐 Шаг 3. Конфигурация веб-сервера

### 1. Настройка Caddy (рекомендуется)
Caddy автоматически получает бесплатные Let's Encrypt SSL-сертификаты и идеально подходит для SPA.

Откройте конфигурацию `/etc/caddy/Caddyfile`:
```caddyfile
your-domain.com {
    root * /var/www/html
    file_server
    try_files {path} /index.html
    encode gzip zstd

    # Заголовки безопасности и разрешений микрофона
    header {
        Permissions-Policy "microphone=(self)"
        X-Content-Type-Options "nosniff"
        X-Frame-Options "DENY"
        Referrer-Policy "strict-origin-when-cross-origin"
    }
}
```
Перезапустите Caddy:
```bash
sudo systemctl reload caddy
```

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

    root /var/www/html;
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
