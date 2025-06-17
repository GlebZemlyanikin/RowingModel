# Решение проблем с Railway.app

## Ошибка "Failed to build an image"

### Возможные причины и решения:

#### 1. Проблемы с конфигурацией

**Решение**: Упростили `railway.json`:

```json
{
    "$schema": "https://railway.app/railway.schema.json",
    "build": {
        "builder": "NIXPACKS"
    },
    "deploy": {
        "startCommand": "npm start"
    }
}
```

#### 2. Проблемы с файловыми операциями

**Решение**: Добавили обработку ошибок для:

-   Создания директорий
-   Сохранения сессий
-   Создания бэкапов

#### 3. Проблемы с зависимостями

**Решение**: Убрали `node-fetch`, так как он больше не используется

#### 4. Проблемы с Node.js версией

**Решение**: Добавили `nixpacks.toml`:

```toml
[phases.setup]
nixPkgs = ["nodejs_18"]

[phases.install]
cmds = ["npm install"]

[phases.build]
cmds = ["echo 'Build completed'"]

[start]
cmd = "npm start"
```

### Пошаговое решение:

1. **Перейдите в Railway Dashboard**
2. **Удалите текущий проект** (если есть)
3. **Создайте новый проект** → "Deploy from GitHub repo"
4. **Выберите репозиторий** `GlebZemlyanikin/RowingModel`
5. **Добавьте переменную окружения**:
    - Key: `TELEGRAM_BOT_TOKEN`
    - Value: ваш*токен*бота
6. **Дождитесь деплоя**

### Если проблема остается:

#### Вариант 1: Использовать Docker

Railway автоматически обнаружит `Dockerfile` и использует его

#### Вариант 2: Ручная настройка

1. В настройках проекта выберите "Dockerfile" как метод деплоя
2. Убедитесь, что порт 3000 открыт
3. Проверьте логи в Railway Dashboard

#### Вариант 3: Проверить логи

1. Откройте проект в Railway Dashboard
2. Перейдите в "Deployments"
3. Нажмите на последний деплой
4. Посмотрите логи сборки

### Проверка работы:

1. **Откройте URL бота** в браузере
2. **Должно показать**: "Bot is running!"
3. **Отправьте `/start`** боту в Telegram
4. **Проверьте логи** в Railway Dashboard

### Частые ошибки:

#### "Cannot find module"

-   Убедитесь, что все файлы в репозитории
-   Проверьте `package.json`

#### "Permission denied"

-   Railway автоматически решает проблемы с правами
-   Проверьте логи

#### "Port already in use"

-   Railway автоматически назначает порты
-   Убедитесь, что код слушает `process.env.PORT`

### Поддержка:

-   Логи: Railway Dashboard → ваш проект → Deployments
-   Документация: [RAILWAY_DEPLOY.md](RAILWAY_DEPLOY.md)
-   GitHub: [GlebZemlyanikin/RowingModel](https://github.com/GlebZemlyanikin/RowingModel)
