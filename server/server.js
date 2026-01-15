require('dotenv').config();
const { Telegraf, session } = require('telegraf');
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const helmet = require('helmet'); // npm install helmet
const rateLimit = require('express-rate-limit'); // npm install express-rate-limit
const compression = require('compression'); // npm install compression

// Environment variables
const BOT_TOKEN = (process.env.BOT_TOKEN || "").trim();
const ADMIN_PASSWORD_HASH = (process.env.ADMIN_PASSWORD_HASH || "").trim();
const JWT_SECRET = (process.env.JWT_SECRET || "").trim();
const SUPABASE_URL = (process.env.SUPABASE_URL || "").trim();
const SUPABASE_KEY = (process.env.SUPABASE_SERVICE_KEY || "").trim();
const JWT_EXPIRES_IN = '24h';
const NODE_ENV = process.env.NODE_ENV || 'development';

// Configuration validation
if (!BOT_TOKEN || !ADMIN_PASSWORD_HASH || !JWT_SECRET || !SUPABASE_URL || !SUPABASE_KEY) {
    console.error('Configuration Error: Missing required environment variables');
    process.exit(1);
}

// Initialize Supabase client с пулом соединений
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false },
    db: {
        schema: 'public'
    },
    global: {
        headers: { 'x-client-info': 'it-helper-system' }
    }
});

const bot = new Telegraf(BOT_TOKEN);
const app = express();

// ============================================
// ОПТИМИЗАЦИЯ: Сжатие ответов
// ============================================
app.use(compression({
    filter: (req, res) => {
        if (req.headers['x-no-compression']) return false;
        return compression.filter(req, res);
    },
    level: 6 // Баланс между скоростью и степенью сжатия
}));

// ============================================
// БЕЗОПАСНОСТЬ: Helmet (защита заголовков)
// ============================================
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "https://unpkg.com"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:"],
            connectSrc: ["'self'", "http://localhost:3000"],
            fontSrc: ["'self'", "data:"],
            frameAncestors: ["'none'"]
        }
    },
    hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
    }
}));

// ============================================
// БЕЗОПАСНОСТЬ: Rate Limiting
// ============================================

// Общий лимит для API
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 минут
    max: 100, // 100 запросов с одного IP
    message: { error: 'Слишком много запросов, попробуйте позже' },
    standardHeaders: true,
    legacyHeaders: false
});

// Строгий лимит для логина
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 минут
    max: 5, // только 5 попыток логина
    message: { error: 'Слишком много попыток входа, попробуйте через 15 минут' },
    skipSuccessfulRequests: true
});

// ============================================
// MIDDLEWARE
// ============================================
app.use(cors({
    origin: NODE_ENV === 'production' 
        ? ['https://yourdomain.com'] // Замените на ваш домен
        : ['http://localhost:3000', 'http://127.0.0.1:3000'],
    credentials: true
}));

app.use(bodyParser.json({ limit: '1mb' })); // Ограничение размера запроса
app.use(express.static(path.join(__dirname, '..'), {
    maxAge: NODE_ENV === 'production' ? '1d' : 0 // Кеширование статики
}));

bot.use(session());

// ============================================
// КЭШ: Простой in-memory кэш
// ============================================
class SimpleCache {
    constructor(ttl = 5000) { // 5 секунд по умолчанию
        this.cache = new Map();
        this.ttl = ttl;
    }

    set(key, value) {
        this.cache.set(key, {
            value,
            expiry: Date.now() + this.ttl
        });
    }

    get(key) {
        const item = this.cache.get(key);
        if (!item) return null;
        
        if (Date.now() > item.expiry) {
            this.cache.delete(key);
            return null;
        }
        
        return item.value;
    }

    clear() {
        this.cache.clear();
    }
}

const ticketsCache = new SimpleCache(5000); // Кэш на 5 секунд

// ============================================
// МАППИНГ: Supabase → Frontend (ОПТИМИЗИРОВАНО)
// ============================================

function mapTicketForFrontend(ticket) {
    if (!ticket) return null;
    
    return {
        id: ticket.id,
        number: ticket.number,
        userRealName: ticket.user_real_name,
        telegramUser: ticket.telegram_user,
        department: ticket.department,
        telegramId: ticket.telegram_id,
        status: ticket.status,
        created: ticket.created_at,
        updated: ticket.updated_at,
        messages: (ticket.messages || []).map(m => ({
            id: m.id,
            role: m.role,
            text: m.text,
            time: m.created_at
        })),
        history: (ticket.history || []).map(h => ({
            action: h.action,
            admin: h.admin,
            time: h.created_at
        }))
    };
}

// ============================================
// DATABASE: ОПТИМИЗИРОВАННЫЕ ЗАПРОСЫ
// ============================================
const DB = {
    // Получить тикет с использованием JOIN (1 запрос вместо 3)
    getTicketById: async (ticketId) => {
        const { data: tickets, error } = await supabase
            .from('tickets')
            .select(`
                *,
                messages (*),
                history:ticket_history (*)
            `)
            .eq('id', ticketId)
            .order('created_at', { foreignTable: 'messages', ascending: true })
            .order('created_at', { foreignTable: 'ticket_history', ascending: true })
            .limit(1);

        if (error) throw error;
        if (!tickets || tickets.length === 0) return null;

        return tickets[0];
    },

    // ОПТИМИЗИРОВАНО: Один запрос с JOIN
    getAllTickets: async () => {
        // Проверяем кэш
        const cached = ticketsCache.get('all_tickets');
        if (cached) return cached;

        const { data: tickets, error } = await supabase
            .from('tickets')
            .select(`
                *,
                messages (*),
                history:ticket_history (*)
            `)
            .order('created_at', { ascending: false })
            .order('created_at', { foreignTable: 'messages', ascending: true })
            .order('created_at', { foreignTable: 'ticket_history', ascending: true });

        if (error) throw error;

        // Сохраняем в кэш
        ticketsCache.set('all_tickets', tickets);
        
        return tickets;
    },

    // Создание тикета с транзакцией
    createTicket: async (ticketData) => {
        const ticketId = Date.now();
        const ticketNumber = await DB.generateTicketNumber();

        // Создаём тикет
        const { data: ticket, error: ticketError } = await supabase
            .from('tickets')
            .insert([{
                id: ticketId,
                number: ticketNumber,
                user_real_name: ticketData.userName,
                telegram_user: ticketData.telegramUser,
                department: ticketData.department,
                telegram_id: ticketData.telegramId,
                status: 'new'
            }])
            .select()
            .single();

        if (ticketError) throw ticketError;

        // Параллельное создание сообщения и истории
        await Promise.all([
            ticketData.initialMessage ? supabase
                .from('messages')
                .insert([{
                    ticket_id: ticketId,
                    role: 'user',
                    text: ticketData.initialMessage
                }]) : Promise.resolve(),
            
            supabase
                .from('ticket_history')
                .insert([{
                    ticket_id: ticketId,
                    action: 'Заявка создана'
                }])
        ]);

        // Очищаем кэш
        ticketsCache.clear();

        return await DB.getTicketById(ticketId);
    },

    addMessage: async (ticketId, role, text) => {
        const { error } = await supabase
            .from('messages')
            .insert([{
                ticket_id: ticketId,
                role: role,
                text: text
            }]);

        if (error) throw error;
        
        // Очищаем кэш
        ticketsCache.clear();
    },

    updateTicketStatus: async (ticketId, newStatus, admin) => {
        // Получаем старый статус и обновляем за один запрос
        const { data: ticket } = await supabase
            .from('tickets')
            .select('status')
            .eq('id', ticketId)
            .single();

        if (!ticket) throw new Error('Заявка не найдена');

        const oldStatus = ticket.status;

        // Параллельное обновление статуса и истории
        await Promise.all([
            supabase
                .from('tickets')
                .update({ status: newStatus })
                .eq('id', ticketId),
            
            supabase
                .from('ticket_history')
                .insert([{
                    ticket_id: ticketId,
                    action: `Статус изменен: ${oldStatus} → ${newStatus}`,
                    admin: admin
                }])
        ]);

        // Очищаем кэш
        ticketsCache.clear();
    },

    // ОПТИМИЗИРОВАНО: Используем индекс
    getActiveTicketByTelegramId: async (telegramId) => {
        const { data: ticket } = await supabase
            .from('tickets')
            .select('id')
            .eq('telegram_id', telegramId)
            .neq('status', 'resolved')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle(); // Не выбрасывает ошибку если не найдено

        return ticket ? await DB.getTicketById(ticket.id) : null;
    },

    // Кэшируем счётчик
    generateTicketNumber: async () => {
        const { count } = await supabase
            .from('tickets')
            .select('*', { count: 'exact', head: true });

        return `IT-${String((count || 0) + 1).padStart(4, '0')}`;
    }
};

// ============================================
// JWT AUTHENTICATION (с проверкой в памяти)
// ============================================
const tokenBlacklist = new Set(); // Отозванные токены

const authenticateJWT = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    
    if (!authHeader) {
        return res.status(401).json({ 
            error: 'Unauthorized', 
            message: 'Токен не предоставлен' 
        });
    }

    const token = authHeader.split(' ')[1];
    
    if (!token || tokenBlacklist.has(token)) {
        return res.status(401).json({ 
            error: 'Unauthorized', 
            message: 'Недействительный токен' 
        });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            if (err.name === 'TokenExpiredError') {
                return res.status(401).json({ 
                    error: 'Unauthorized', 
                    message: 'Токен истек. Пожалуйста, войдите снова.' 
                });
            }
            return res.status(403).json({ 
                error: 'Forbidden', 
                message: 'Ошибка проверки токена' 
            });
        }
        
        req.user = user;
        req.token = token;
        next();
    });
};

// ============================================
// TELEGRAM BOT
// ============================================
bot.on('text', async (ctx) => {
    const userId = ctx.from.id;
    
    try {
        const activeTicket = await DB.getActiveTicketByTelegramId(userId);

        if (activeTicket) {
            await DB.addMessage(activeTicket.id, 'user', ctx.message.text);
            return ctx.reply('Сообщение добавлено к вашей заявке. Служба поддержки ответит в ближайшее время.');
        }

        const state = ctx.session || {};
        
        if (!state.step) {
            ctx.session = { step: 'name' };
            return ctx.reply('Здравствуйте! Давайте создадим заявку в IT-поддержку.\n\nВведите ваше ФИО:');
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
            
            const newTicket = await DB.createTicket({
                userName: ctx.session.userName,
                telegramUser: tgUser,
                department: ctx.session.dept,
                telegramId: userId,
                initialMessage: ctx.message.text
            });

            ctx.session = null;
            
            await ctx.reply(
                `Заявка ${newTicket.number} успешно создана!\n\n` +
                `Отдел: ${newTicket.department}\n` +
                `ФИО: ${newTicket.user_real_name}\n\n` +
                `Мы свяжемся с вами в ближайшее время.`
            );
        }
    } catch (error) {
        console.error('Bot error:', error);
        ctx.reply('Произошла ошибка. Пожалуйста, попробуйте позже.');
    }
});

// ============================================
// API ENDPOINTS
// ============================================

// Login с rate limiting
app.post('/api/login', loginLimiter, async (req, res) => {
    const { password } = req.body;
    
    if (!password) {
        return res.status(400).json({ 
            error: 'Bad Request', 
            message: 'Пароль не указан' 
        });
    }

    try {
        const isValid = await bcrypt.compare(password, ADMIN_PASSWORD_HASH);
        
        if (!isValid) {
            return res.status(403).json({ 
                error: 'Forbidden', 
                message: 'Неверный пароль' 
            });
        }

        const token = jwt.sign(
            { 
                admin: true,
                iat: Math.floor(Date.now() / 1000)
            },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRES_IN }
        );

        res.json({ 
            token,
            expiresIn: JWT_EXPIRES_IN,
            message: 'Авторизация успешна'
        });
        
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ 
            error: 'Internal Server Error', 
            message: 'Ошибка аутентификации' 
        });
    }
});

// Logout (добавляем токен в blacklist)
app.post('/api/logout', authenticateJWT, (req, res) => {
    tokenBlacklist.add(req.token);
    res.json({ message: 'Выход выполнен успешно' });
});

// Get all tickets (с кэшированием)
app.get('/api/tickets', apiLimiter, authenticateJWT, async (req, res) => {
    try {
        const tickets = await DB.getAllTickets();
        const mappedTickets = tickets.map(mapTicketForFrontend);
        
        // Добавляем заголовок кэширования
        res.setHeader('Cache-Control', 'private, max-age=5');
        res.json(mappedTickets);
    } catch (error) {
        console.error('Get tickets error:', error);
        res.status(500).json({ 
            error: 'Internal Server Error', 
            message: 'Не удалось загрузить заявки' 
        });
    }
});

// Update ticket
app.post('/api/tickets/update', apiLimiter, authenticateJWT, async (req, res) => {
    const { id, status, comment } = req.body;
    
    if (!id) {
        return res.status(400).json({ 
            error: 'Bad Request', 
            message: 'ID заявки не указан' 
        });
    }

    try {
        const ticket = await DB.getTicketById(id);

        if (!ticket) {
            return res.status(404).json({ 
                error: 'Not Found', 
                message: 'Заявка не найдена' 
            });
        }

        // Параллельное обновление статуса и отправка комментария
        const updates = [];

        if (status && status !== ticket.status) {
            updates.push(DB.updateTicketStatus(id, status, 'admin'));
        }

        if (comment && comment.trim() !== "") {
            updates.push(
                DB.addMessage(id, 'admin', comment),
                supabase
                    .from('ticket_history')
                    .insert([{
                        ticket_id: id,
                        action: 'Ответ администратора',
                        admin: 'admin'
                    }])
            );

            // Отправка уведомления в Telegram (неблокирующая)
            bot.telegram.sendMessage(
                ticket.telegram_id,
                `Ответ службы поддержки по заявке ${ticket.number}:\n\n${comment}`
            ).catch(err => console.error('Failed to send Telegram message:', err.message));
        }

        await Promise.all(updates);

        const updatedTicket = await DB.getTicketById(id);

        res.json({ 
            success: true, 
            message: 'Заявка обновлена',
            ticket: mapTicketForFrontend(updatedTicket)
        });
    } catch (error) {
        console.error('Update ticket error:', error);
        res.status(500).json({ 
            error: 'Internal Server Error', 
            message: 'Не удалось обновить заявку' 
        });
    }
});

// Verify token
app.get('/api/verify', authenticateJWT, (req, res) => {
    res.json({ 
        valid: true, 
        user: req.user 
    });
});

// Health check
app.get('/api/health', async (req, res) => {
    try {
        const { error } = await supabase.from('tickets').select('count').limit(1);
        res.json({ 
            status: 'ok', 
            database: error ? 'error' : 'connected',
            cache: ticketsCache.cache.size,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({ 
            status: 'error', 
            database: 'disconnected',
            timestamp: new Date().toISOString()
        });
    }
});

// ============================================
// START SERVER
// ============================================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log('✓ HTTP Server started on port', PORT);
    console.log('✓ Database: Supabase (PostgreSQL)');
    console.log('✓ Cache: Enabled (5s TTL)');
    console.log('✓ Compression: Enabled');
    console.log('✓ Rate Limiting: Enabled');
    console.log('✓ Security: Helmet enabled');
    
    bot.launch()
        .then(() => console.log('✓ Telegram Bot started'))
        .catch((err) => {
            console.error('✗ Telegram Bot error:', err.message);
        });
});

// Graceful shutdown
process.once('SIGINT', () => {
    console.log('Shutting down gracefully...');
    ticketsCache.clear();
    bot.stop('SIGINT');
});

process.once('SIGTERM', () => {
    console.log('Shutting down gracefully...');
    ticketsCache.clear();
    bot.stop('SIGTERM');
});