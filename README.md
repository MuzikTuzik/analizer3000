# Анализатор продаж крепежа

Next.js приложение для анализа продаж из Google Sheets (матрица «позиция × заказ»).

## Что показывает

По выбранной позиции:

- сколько раз покупали
- какими партиями (25 / 50 / 100 / …)
- сколько клиентов
- кто сколько купил и по каким количествам

## Запуск локально

```bash
npm install
cp .env.example .env.local
npm run dev
```

Откройте [http://localhost:3000](http://localhost:3000).

## Переменные окружения

| Переменная | Описание |
|---|---|
| `GOOGLE_SHEET_ID` | ID таблицы из URL |
| `GOOGLE_API_KEY` | Рекомендуется на Vercel. Sheets API надёжнее, чем CSV export |

Таблица должна быть доступна по ссылке: **«Все, у кого есть ссылка» → Читатель**.

### Как получить GOOGLE_API_KEY

1. [Google Cloud Console](https://console.cloud.google.com/) → создайте проект
2. APIs & Services → Enable **Google Sheets API**
3. Credentials → Create credentials → **API key**
4. Вставьте ключ в Vercel → Project Settings → Environment Variables

## Деплой на Vercel

1. Import репозитория в Vercel
2. Добавьте env: `GOOGLE_SHEET_ID` и `GOOGLE_API_KEY`
3. Deploy
