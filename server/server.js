require('dotenv').config();
const { Telegraf, session } = require('telegraf');
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');

// Переменные окружения (используем API_KEY как пароль, как в твоем .env)
const BOT_TOKEN = (process.env.BOT_TOKEN || "").trim();
const ADMIN_PASSWORD = (process.env.API_KEY || "").trim();
const DB_FILE = path.join(__dirname, 'database.json');

// Строгая проверка: если данных нет, сервер не запустится
if (!BOT_TOKEN || !ADMIN_PASSWORD) {
    console.error('--- ОШИБКА КОНФИГУРАЦИИ ---');
    if (!BOT_TOKEN) console.error('BOT_TOKEN не найден в .env');
    if (!ADMIN_PASSWORD) console.error('API_KEY (пароль) не найден в .env');
    process.exit(1); 
}

const bot = new Telegraf(BOT_TOKEN);
const app = express();

app.use(cors());
app.use(bodyParser.json());
bot.use(session());

// Базовые защитные HTTP‑заголовки (не ломают текущую логику)
app.use((req, res, next) => {
    // Запрет MIME‑sniffing
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // Защита от clickjacking
    res.setHeader('X-Frame-Options', 'DENY');
    // Минимизация утечки реферера
    res.setHeader('Referrer-Policy', 'no-referrer');
    // Базовый CSP: разрешаем только наш домен и скрипт lucide с unpkg,
    // стили оставляем с 'unsafe-inline', чтобы не ломать текущие inline‑стили.
    res.setHeader(
        'Content-Security-Policy',
        "default-src 'self'; " +
        "script-src 'self' https://unpkg.com; " +
        "style-src 'self' 'unsafe-inline'; " +
        "img-src 'self' data:; " +
        "connect-src 'self' http://localhost:3000; " +
        "font-src 'self' data:; " +
        "frame-ancestors 'none';"
    );
    next();
});

// Раздаём статику фронтенда тем же сервером, что и API,
// чтобы можно было открывать панель по http://localhost:3000/index.html
// и не зависеть от live-server (который перезагружает страницу при изменении БД).
app.use(express.static(path.join(__dirname, '..')));

// База данных
let tickets = [];
if (fs.existsSync(DB_FILE)) {
    try {
        tickets = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    } catch (e) {
        tickets = [];
    }
}

const saveToDB = () => fs.writeFileSync(DB_FILE, JSON.stringify(tickets, null, 2));

// Защита API
const authenticate = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (authHeader === `Bearer ${ADMIN_PASSWORD}`) {
        next();
    } else {
        res.status(401).json({ error: "Unauthorized" });
    }
};

// --- Логика Бота ---
bot.on('text', async (ctx) => {
    const userId = ctx.from.id;
    const activeTicket = tickets.find(t => t.telegramId === userId && t.status !== 'resolved');

    if (activeTicket) {
        if (!activeTicket.messages) activeTicket.messages = [];
        activeTicket.messages.push({
            role: 'user',
            text: ctx.message.text,
            time: new Date().toISOString()
        });
        saveToDB();
        return ctx.reply('Сообщение добавлено к заявке.');
    }

    const state = ctx.session || {};
    if (!state.step) {
        ctx.session = { step: 'name' };
        return ctx.reply('Введите ваше ФИО:');
    }

    if (state.step === 'name') {
        ctx.session.userName = ctx.message.text;
        ctx.session.step = 'dept';
        return ctx.reply('Укажите ваш отдел:');
    }

    if (state.step === 'dept') {
        ctx.session.dept = ctx.message.text;
        ctx.session.step = 'desc';
        return ctx.reply('Опишите проблему:');
    }

    if (state.step === 'desc') {
        const tgUser = ctx.from.username ? `@${ctx.from.username}` : `ID: ${ctx.from.id}`;
        const newTicket = {
            id: Date.now(),
            number: `IT-${String(tickets.length + 1).padStart(4, '0')}`,
            userRealName: ctx.session.userName,
            telegramUser: tgUser,
            department: ctx.session.dept,
            telegramId: userId,
            status: 'new',
            created: new Date().toISOString(),
            messages: [{ role: 'user', text: ctx.message.text, time: new Date().toISOString() }],
            history: [{ action: "Создано", time: new Date().toISOString() }]
        };
        tickets.unshift(newTicket);
        saveToDB();
        ctx.session = null;
        ctx.reply(`Заявка ${newTicket.number} создана.`);
    }
});

// --- API ---
app.get('/api/tickets', authenticate, (req, res) => {
    res.json(tickets);
});

app.post('/api/tickets/update', authenticate, async (req, res) => {
    const { id, status, comment } = req.body;
    const ticket = tickets.find(t => String(t.id) === String(id));

    if (ticket) {
        ticket.status = status;
        if (!ticket.messages) ticket.messages = [];
        if (comment && comment.trim() !== "") {
            ticket.messages.push({ role: 'admin', text: comment, time: new Date().toISOString() });
            try {
                await bot.telegram.sendMessage(ticket.telegramId, `Ответ поддержки:\n\n${comment}`);
            } catch (err) {}
        }
        saveToDB();
        res.json({ success: true });
    } else {
        res.status(404).json({ error: "Not found" });
    }
});

app.post('/api/login', (req, res) => {
    if (req.body.password && req.body.password === ADMIN_PASSWORD) {
        res.json({ token: ADMIN_PASSWORD });
    } else {
        res.status(403).json({ error: "Forbidden" });
    }
});

// --- ЗАПУСК ---
// Сначала Express, потом Bot
app.listen(3000, () => {
    console.log('HTTP Server: OK (Port 3000)');
    bot.launch()
        .then(() => console.log('Telegram Bot: OK'))
        .catch(() => console.error('Telegram Bot: Error (Check Token)'));
});