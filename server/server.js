require('dotenv').config();
const { Telegraf, session } = require('telegraf');
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');

// Настройки
const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'jB7.O$p|,Gks5D;DCj7Z';
const DB_FILE = './database.json';

const bot = new Telegraf(BOT_TOKEN);
const app = express();

app.use(cors());
app.use(bodyParser.json());
bot.use(session());

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

// Middleware для защиты API
const authenticate = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (authHeader === `Bearer ${ADMIN_PASSWORD}`) {
        next();
    } else {
        res.status(401).json({ error: "Unauthorized" });
    }
};

// Логика бота
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
        
        if (!activeTicket.history) activeTicket.history = [];
        activeTicket.history.push({ action: `Сообщение от пользователя`, time: new Date().toISOString() });
        
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
            history: [{ action: "Заявка создана", time: new Date().toISOString() }]
        };
        tickets.unshift(newTicket);
        saveToDB();
        ctx.session = null;
        ctx.reply(`Заявка ${newTicket.number} создана. Вы можете писать сюда дополнения.`);
    }
});

// Эндпоинты API
app.get('/api/tickets', authenticate, (req, res) => {
    res.json(tickets);
});

app.post('/api/tickets/update', authenticate, async (req, res) => {
    const { id, status, comment } = req.body;
    const ticket = tickets.find(t => String(t.id) === String(id));

    if (ticket) {
        ticket.status = status;
        if (!ticket.messages) ticket.messages = [];
        if (!ticket.history) ticket.history = [];

        if (comment && comment.trim() !== "") {
            ticket.messages.push({ role: 'admin', text: comment, time: new Date().toISOString() });
            ticket.history.push({ action: `Ответ админа: ${comment}`, time: new Date().toISOString() });
            
            try {
                await bot.telegram.sendMessage(ticket.telegramId, `Ответ поддержки:\n\n${comment}`);
            } catch (err) {
                console.error("Ошибка отправки в TG:", err);
            }
        }
        saveToDB();
        res.json({ success: true });
    } else {
        res.status(404).json({ error: "Ticket not found" });
    }
});

app.post('/api/login', (req, res) => {
    // Используем .trim() чтобы исключить ошибки с пробелами при вводе
    if (req.body.password && req.body.password.trim() === ADMIN_PASSWORD.trim()) {
        res.json({ token: ADMIN_PASSWORD });
    } else {
        res.status(403).json({ error: "Forbidden" });
    }
});

bot.launch();
app.listen(3000, () => console.log('Server running on port 3000'));