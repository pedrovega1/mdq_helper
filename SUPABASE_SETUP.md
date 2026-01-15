# Supabase Setup - Полная инструкция

## Зачем нужна нормальная БД?

### Проблемы JSON файла:
- Нет транзакций (данные могут повредиться)
- Медленный поиск (читает весь файл)
- Нет параллельного доступа (блокировки)
- Нет резервных копий
- Не масштабируется

### Что даёт Supabase:
- PostgreSQL (промышленная БД)
- Автоматические бэкапы
- Быстрые запросы (индексы)
- Реляционная структура
- Безопасность (RLS)
- Бесплатно до 500MB

---

## Шаг 1: Создание проекта Supabase

### 1.1 Регистрация

1. Открой https://supabase.com
2. Нажми "Start your project"
3. Войди через GitHub или email
4. Подтверди email

### 1.2 Создание проекта

1. Нажми "New project"
2. Заполни:
   - Name: `it-helper-system`
   - Database Password: придумай сильный пароль (сохрани его!)
   - Region: выбери ближайший (Europe West для Казахстана)
3. Нажми "Create new project"
4. Подожди 2-3 минуты (создаётся база)

### 1.3 Получение ключей

После создания проекта:

1. Перейди в Settings (левая панель внизу)
2. Выбери "API"
3. Найди секцию "Project API keys"
4. Скопируй:
   - `Project URL` → это SUPABASE_URL
   - `service_role` key → это SUPABASE_SERVICE_KEY

**ВАЖНО:** Используй `service_role`, а не `anon` key!

---

## Шаг 2: Создание таблиц

### 2.1 Открой SQL Editor

1. Слева нажми "SQL Editor"
2. Нажми "New query"

### 2.2 Выполни SQL скрипт

Скопируй весь файл `supabase-schema.sql` и вставь в редактор.

Нажми "Run" (или Ctrl+Enter).

Должен увидеть:
```
Success. No rows returned
```

### 2.3 Проверь таблицы

1. Слева нажми "Table Editor"
2. Должен увидеть таблицы:
   - tickets
   - messages
   - ticket_history
   - attachments

---

## Шаг 3: Настройка проекта

### 3.1 Установи зависимости

```bash
npm install @supabase/supabase-js
```

### 3.2 Обнови .env

Добавь в файл `.env`:

```env
# Existing variables
BOT_TOKEN=твой_токен
ADMIN_PASSWORD_HASH=твой_хеш
JWT_SECRET=твой_секрет

# NEW: Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=твой_service_role_ключ

PORT=3000
```

**Где взять:**
- SUPABASE_URL: Settings > API > Project URL
- SUPABASE_SERVICE_KEY: Settings > API > service_role key

### 3.3 Замени server.js

```bash
cp server-supabase.js server/server.js
```

### 3.4 Перезапусти сервер

```bash
node server/server.js
```

Должен увидеть:
```
HTTP Server started on port 3000
Database: Supabase (PostgreSQL)
Telegram Bot started
```

---

## Шаг 4: Миграция данных (опционально)

Если у тебя уже есть заявки в `database.json`, можно перенести их:

### 4.1 Создай migration скрипт

```javascript
// migrate-to-supabase.js
require('dotenv').config();
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

async function migrate() {
    // Read old database
    const oldData = JSON.parse(fs.readFileSync('server/database.json', 'utf8'));
    
    console.log(`Migrating ${oldData.length} tickets...`);
    
    for (const ticket of oldData) {
        // Insert ticket
        const { error: ticketError } = await supabase
            .from('tickets')
            .insert([{
                id: ticket.id,
                number: ticket.number,
                user_real_name: ticket.userRealName,
                telegram_user: ticket.telegramUser,
                department: ticket.department,
                telegram_id: ticket.telegramId,
                status: ticket.status,
                created_at: ticket.created
            }]);
        
        if (ticketError) {
            console.error(`Error migrating ticket ${ticket.number}:`, ticketError);
            continue;
        }
        
        // Insert messages
        if (ticket.messages) {
            for (const msg of ticket.messages) {
                await supabase
                    .from('messages')
                    .insert([{
                        ticket_id: ticket.id,
                        role: msg.role,
                        text: msg.text,
                        created_at: msg.time
                    }]);
            }
        }
        
        // Insert history
        if (ticket.history) {
            for (const hist of ticket.history) {
                await supabase
                    .from('ticket_history')
                    .insert([{
                        ticket_id: ticket.id,
                        action: hist.action,
                        admin: hist.admin,
                        created_at: hist.time
                    }]);
            }
        }
        
        console.log(`Migrated: ${ticket.number}`);
    }
    
    console.log('Migration complete!');
}

migrate().catch(console.error);
```

### 4.2 Запусти миграцию

```bash
node migrate-to-supabase.js
```

### 4.3 Проверь данные

В Supabase:
1. Открой "Table Editor"
2. Выбери таблицу `tickets`
3. Должен увидеть все заявки

---

## Шаг 5: Проверка

### 5.1 Создай тестовую заявку

1. Напиши боту в Telegram
2. Создай заявку
3. Проверь в Supabase Table Editor - должна появиться

### 5.2 Проверь админ-панель

1. Открой http://localhost:3000/index.html
2. Войди
3. Должен увидеть заявки из Supabase

### 5.3 Проверь обновление

1. Открой заявку
2. Добавь комментарий
3. В Supabase должна появиться запись в таблице `messages`

---

## Структура базы данных

### Таблицы:

**tickets** (главная таблица заявок)
```
id               BIGINT       - Уникальный ID
number           VARCHAR(20)  - Номер заявки (IT-0001)
user_real_name   VARCHAR(255) - ФИО пользователя
telegram_user    VARCHAR(100) - @username
department       VARCHAR(255) - Отдел
telegram_id      BIGINT       - ID для отправки сообщений
status           VARCHAR(20)  - new/in_progress/resolved
created_at       TIMESTAMPTZ  - Дата создания
updated_at       TIMESTAMPTZ  - Дата изменения
```

**messages** (сообщения в чате)
```
id          UUID         - Уникальный ID
ticket_id   BIGINT       - Связь с заявкой
role        VARCHAR(10)  - user/admin
text        TEXT         - Текст сообщения
created_at  TIMESTAMPTZ  - Дата отправки
```

**ticket_history** (история изменений)
```
id          UUID         - Уникальный ID
ticket_id   BIGINT       - Связь с заявкой
action      TEXT         - Описание действия
admin       VARCHAR(100) - Кто сделал
created_at  TIMESTAMPTZ  - Когда
```

**attachments** (вложения - для будущего)
```
id             UUID         - Уникальный ID
ticket_id      BIGINT       - Связь с заявкой
filename       VARCHAR(255) - Имя файла на сервере
original_name  VARCHAR(255) - Оригинальное имя
mime_type      VARCHAR(100) - image/jpeg и т.д.
file_size      BIGINT       - Размер в байтах
url            TEXT         - Путь к файлу
created_at     TIMESTAMPTZ  - Дата загрузки
```

### Связи:

```
tickets (1) ----< (*) messages
tickets (1) ----< (*) ticket_history
tickets (1) ----< (*) attachments
```

---

## Преимущества новой системы

### Производительность:

**Было (JSON):**
```javascript
// Чтение всего файла каждый раз
const tickets = JSON.parse(fs.readFileSync('database.json'));
const found = tickets.find(t => t.id === id);
```

**Стало (Supabase):**
```javascript
// Индексированный поиск по ID
const { data } = await supabase
    .from('tickets')
    .select('*')
    .eq('id', id)
    .single();
```

### Надёжность:

**Было:**
- Файл может повредиться при сбое
- Нет транзакций
- Нет бэкапов

**Стало:**
- ACID транзакции
- Автоматические бэкапы (Point-in-time recovery)
- Репликация данных

### Масштабируемость:

**Было:**
- 1000+ заявок = медленно
- Параллельная запись = проблемы

**Стало:**
- Миллионы записей - без проблем
- Параллельный доступ

---

## Мониторинг

### Database Dashboard

В Supabase > Database:
- Query Performance
- Table sizes
- Index usage
- Active connections

### Полезные запросы:

**Статистика по заявкам:**
```sql
SELECT 
    status,
    COUNT(*) as count
FROM tickets
GROUP BY status;
```

**Средне время решения:**
```sql
SELECT 
    AVG(EXTRACT(EPOCH FROM (updated_at - created_at))) / 3600 as avg_hours
FROM tickets
WHERE status = 'resolved';
```

**Топ отделов по заявкам:**
```sql
SELECT 
    department,
    COUNT(*) as count
FROM tickets
GROUP BY department
ORDER BY count DESC
LIMIT 10;
```

---

## Бэкапы

### Автоматические (Supabase)

Supabase делает:
- Ежедневные бэкапы (7 дней хранения)
- Point-in-time recovery (последние 7 дней)

### Ручные бэкапы

**Экспорт всех заявок:**
```javascript
const { data } = await supabase
    .from('tickets')
    .select('*, messages(*), ticket_history(*)');

fs.writeFileSync('backup.json', JSON.stringify(data, null, 2));
```

**Или через SQL:**
```sql
COPY (
    SELECT * FROM tickets
) TO '/tmp/tickets_backup.csv' WITH CSV HEADER;
```

---

## Безопасность

### Row Level Security (RLS)

В скрипте настроено:
- Service role (твой backend) имеет полный доступ
- Anon key (если будешь использовать) - ограниченный доступ

### Рекомендации:

1. **Не передавай SUPABASE_SERVICE_KEY клиенту**
2. **Используй только через backend**
3. **Регулярно меняй пароли**
4. **Включи 2FA для Supabase аккаунта**

---

## Troubleshooting

### Ошибка: "Invalid API key"

**Проверь:**
```bash
echo $SUPABASE_SERVICE_KEY
# Должен вывести длинный ключ
```

**Решение:**
1. Перейди в Supabase > Settings > API
2. Скопируй `service_role` key заново
3. Обнови .env
4. Перезапусти сервер

### Ошибка: "relation does not exist"

**Причина:** Таблицы не созданы

**Решение:**
1. Открой SQL Editor
2. Выполни `supabase-schema.sql`
3. Проверь Table Editor

### Ошибка: "Connection refused"

**Причина:** Неверный SUPABASE_URL

**Решение:**
1. Проверь URL в .env
2. Должен быть вида: `https://xxx.supabase.co`
3. Без слеша в конце

### Медленные запросы

**Проверь индексы:**
```sql
SELECT * FROM pg_indexes WHERE tablename = 'tickets';
```

**Добавь индекс если нужно:**
```sql
CREATE INDEX idx_tickets_department ON tickets(department);
```

---

## Сравнение производительности

### Поиск заявки по ID:

**JSON файл:**
```
1000 заявок: ~5ms
10000 заявок: ~50ms
100000 заявок: ~500ms
```

**Supabase:**
```
1000 заявок: ~2ms
10000 заявок: ~2ms
100000 заявок: ~2ms
```

### Фильтрация по статусу:

**JSON файл:**
```javascript
// Читает весь файл, потом фильтрует
const tickets = JSON.parse(fs.readFileSync('db.json'));
const filtered = tickets.filter(t => t.status === 'new');
```

**Supabase:**
```javascript
// Фильтрует на стороне БД
const { data } = await supabase
    .from('tickets')
    .select('*')
    .eq('status', 'new');
```

---

## Дополнительные возможности

### Realtime подписки

Можно получать обновления в реальном времени:

```javascript
const channel = supabase
    .channel('tickets')
    .on('postgres_changes', 
        { event: 'INSERT', schema: 'public', table: 'tickets' },
        (payload) => {
            console.log('New ticket:', payload.new);
        }
    )
    .subscribe();
```

### Хранилище файлов

Supabase Storage для картинок:

```javascript
const { data, error } = await supabase
    .storage
    .from('attachments')
    .upload('ticket123/image.jpg', file);
```

### Edge Functions

Serverless функции для сложной логики:

```javascript
// Отправка email при новой заявке
// Автоматическое закрытие старых заявок
```

---

## Миграция обратно на JSON (если нужно)

Если вдруг нужно вернуться:

```javascript
const { data } = await supabase
    .from('tickets')
    .select('*, messages(*), ticket_history(*)');

fs.writeFileSync('database.json', JSON.stringify(data, null, 2));
```

---

## Итого

Ты получил:
- Промышленную PostgreSQL БД
- Автоматические бэкапы
- Быстрые запросы
- Масштабируемость
- Бесплатно до 500MB

Старый JSON файл можно удалить или оставить как backup.

**Следующий шаг:** После тестирования можно добавить:
1. Realtime обновления в админ-панели
2. Аналитику (статистика по отделам, времени решения)
3. Экспорт отчётов
4. Хранилище для изображений
