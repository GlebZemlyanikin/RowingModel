# Быстрый деплой на Railway.app

## 🚀 5 минут до работающего бота

### 1. Создайте аккаунт

-   Перейдите на [railway.app](https://railway.app)
-   Войдите через GitHub

### 2. Создайте проект

-   Нажмите "New Project"
-   Выберите "Deploy from GitHub repo"
-   Выберите репозиторий: `GlebZemlyanikin/RowingModel`

### 3. Добавьте переменную окружения

-   В настройках проекта найдите "Variables"
-   Добавьте: `TELEGRAM_BOT_TOKEN` = ваш*токен*бота

### 4. Готово!

-   Railway автоматически деплоит бота
-   Бот будет доступен по URL вида: `https://your-project-name.railway.app`
-   Отправьте `/start` боту в Telegram

## ✅ Преимущества

-   Работает 24/7 без сна
-   Получает все сообщения
-   Бесплатно до $5/месяц
-   Автоматические обновления при push в GitHub

## 🔧 Если что-то не работает

1. Проверьте логи в Railway Dashboard
2. Убедитесь, что токен бота правильный
3. Проверьте, что бот не заблокирован в Telegram

## 📞 Поддержка

-   Логи: Railway Dashboard → ваш проект → Deployments
-   Документация: [RAILWAY_DEPLOY.md](RAILWAY_DEPLOY.md)
