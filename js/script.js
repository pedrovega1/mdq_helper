import { Auth } from './modules/auth.js';
import { API } from './modules/api.js';
import { UI } from './modules/ui.js';

let allTickets = [];
let currentActiveTicketId = null; 

document.addEventListener('DOMContentLoaded', () => {
    // Инициализируем иконки Lucide, если скрипт доступен
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons();
    }

    if (Auth.isLoggedIn()) {
        initAdminPanel();
    } else {
        const loginBtn = document.getElementById('login-btn');
        const passwordInput = document.getElementById('admin-password');
        const togglePassword = document.getElementById('toggle-password');

        if (loginBtn) loginBtn.onclick = handleLogin;

        // Вход по Enter
        if (passwordInput) {
            passwordInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    handleLogin();
                }
            });
        }

        // Показ/скрытие пароля
        if (togglePassword && passwordInput) {
            togglePassword.onclick = () => {
                const isPassword = passwordInput.type === 'password';
                passwordInput.type = isPassword ? 'text' : 'password';
                togglePassword.setAttribute('aria-label', isPassword ? 'Скрыть пароль' : 'Показать пароль');
                // Меняем иконку
                const iconName = isPassword ? 'eye-off' : 'eye';
                togglePassword.innerHTML = `<i data-lucide="${iconName}"></i>`;
                if (window.lucide && typeof window.lucide.createIcons === 'function') {
                    window.lucide.createIcons();
                }
            };
        }
    }
});

async function handleLogin() {
    const input = document.getElementById('admin-password');
    if (!input) return;
    try {
        const data = await API.login(input.value);
        if (data && data.token) {
            Auth.setToken(data.token);
            initAdminPanel();
            const errorEl = document.getElementById('login-error');
            if (errorEl) errorEl.style.display = 'none';
        }
    } catch (e) {
        const errorEl = document.getElementById('login-error');
        if (errorEl) {
            errorEl.textContent = 'Неверный пароль. Попробуйте ещё раз.';
            errorEl.style.display = 'block';
        } else {
            alert("Неверный пароль");
        }
    }
}

function initAdminPanel() {
    const loginScreen = document.getElementById('login-screen');
    const adminPanel = document.getElementById('admin-panel');
    
    if (loginScreen) loginScreen.style.display = 'none';
    if (adminPanel) adminPanel.style.display = 'flex';
    
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) logoutBtn.onclick = () => Auth.logout();
    
    setupEventListeners();
    refreshData();
    setInterval(refreshData, 5000); 
}

async function refreshData() {
    try {
        const tickets = await API.getTickets();
        if (Array.isArray(tickets)) {
            allTickets = tickets;
            
            if (currentActiveTicketId) {
                const updated = allTickets.find(t => String(t.id) === String(currentActiveTicketId));
                if (updated) UI.updateChatOnly(updated);
            } else {
                updateDisplay();
            }
        }
    } catch (e) {
        console.error("Data refresh error", e);
    }
}

function updateDisplay() {
    const search = document.getElementById('searchInput');
    const filter = document.getElementById('statusFilter');
    UI.renderTickets(allTickets, {
        search: search ? search.value.toLowerCase() : '',
        statusFilter: filter ? filter.value : 'all'
    });
    UI.updateStats(allTickets);
}

function setupEventListeners() {
    const sInput = document.getElementById('searchInput');
    if (sInput) sInput.oninput = updateDisplay;

    const sFilter = document.getElementById('statusFilter');
    if (sFilter) sFilter.onchange = updateDisplay;

    const modalStatusSelect = document.getElementById('modalStatusSelect');
    if (modalStatusSelect) {
        modalStatusSelect.onchange = () => {
            const statusWrapper = document.getElementById('statusWrapper');
            if (!statusWrapper) return;
            const value = modalStatusSelect.value;
            statusWrapper.classList.remove('status-new', 'status-in_progress', 'status-resolved');
            statusWrapper.classList.add(`status-${value}`);
        };
    }

    const list = document.getElementById('ticketsList');
    if (list) {
        list.onclick = (e) => {
            const card = e.target.closest('.ticket-card');
            if (card) {
                currentActiveTicketId = card.dataset.id;
                const ticket = allTickets.find(t => String(t.id) === String(currentActiveTicketId));
                if (ticket) UI.openTicketModal(ticket);
            }
        };
    }

    const sendBtn = document.getElementById('sendReplyBtn');
    if (sendBtn) {
        sendBtn.onclick = async (e) => {
            e.preventDefault();
            // На всякий случай: не даём клику всплывать до возможных обработчиков на модалке/оверлее
            // (чтобы "Отправить" точно не закрывало диалог).
            e.stopPropagation();
            const id = sendBtn.getAttribute('data-id');
            const replyInput = document.getElementById('adminReplyText');
            const statusSelect = document.getElementById('modalStatusSelect');
            const statusWrapper = document.getElementById('statusWrapper');
            
            const comment = replyInput.value.trim();
            const newStatus = statusSelect.value;

            if (!id) return;

            try {
                sendBtn.disabled = true;
                await API.updateTicket(id, newStatus, comment);
                replyInput.value = '';
                
                const fresh = await API.getTickets();
                allTickets = fresh;
                const updated = allTickets.find(t => String(t.id) === String(id));
                if (updated) UI.updateChatOnly(updated);

                // ВАЖНО: сохраняем контекст открытой заявки и гарантируем, что модалка не “схлопнется”
                // из‑за любых побочных действий (рендера/фокуса/ошибок).
                currentActiveTicketId = id;
                const modal = document.getElementById('ticketModal');
                if (modal) modal.style.display = 'flex';

                // Обновляем визуальный цвет статуса
                if (statusWrapper) {
                    statusWrapper.classList.remove('status-new', 'status-in_progress', 'status-resolved');
                    statusWrapper.classList.add(`status-${newStatus}`);
                }
            } catch (err) {
                console.error("Send error", err);
                alert('Ошибка при отправке ответа: ' + (err && err.message ? err.message : err));
            } finally {
                sendBtn.disabled = false;
            }
        };
    }

    // --- УЛУЧШЕННЫЕ ЛОГИ (UI/UX) ---
    const viewHistoryBtn = document.getElementById('viewHistoryBtn');
    if (viewHistoryBtn) {
        viewHistoryBtn.onclick = () => {
            const ticket = allTickets.find(t => String(t.id) === String(currentActiveTicketId));
            if (!ticket) return;

            const logsContainer = document.getElementById('historyLogs');
            
            // Простая защита от XSS в логах
            const escapeHtml = (value = '') =>
                String(value)
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;')
                    .replace(/'/g, '&#39;');

            // Формируем красивый таймлайн
            logsContainer.innerHTML = (ticket.history || []).slice().reverse().map(event => {
                const date = new Date(event.time);
                const isStatus = event.action.includes('статус') || event.action.includes('Status');
                const safeAction = escapeHtml(event.action || '');
                
                return `
                <div style="display: flex; gap: 16px; margin-bottom: 20px; position: relative;">
                    <div style="min-width: 45px; text-align: right;">
                        <div style="font-size: 12px; font-weight: 700; color: #1e293b;">${date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
                        <div style="font-size: 10px; color: #94a3b8;">${date.toLocaleDateString([], {day: '2-digit', month: '2-digit'})}</div>
                    </div>
                    
                    <div style="display: flex; flex-direction: column; align-items: center;">
                        <div style="width: 12px; height: 12px; border-radius: 50%; background: ${isStatus ? '#3b82f6' : '#e2e8f0'}; border: 2px solid white; box-shadow: 0 0 0 1px ${isStatus ? '#3b82f6' : '#cbd5e1'}; z-index: 2;"></div>
                        <div style="width: 2px; flex-grow: 1; background: #f1f5f9; margin-top: 4px;"></div>
                    </div>

                    <div style="flex: 1; padding-bottom: 10px;">
                        <div style="
                            padding: 12px; 
                            background: ${isStatus ? '#eff6ff' : '#ffffff'}; 
                            border: 1px solid ${isStatus ? '#dbeafe' : '#f1f5f9'}; 
                            border-radius: 12px;
                            font-size: 13px;
                            color: #334155;
                            box-shadow: 0 2px 4px rgba(0,0,0,0.02);
                        ">
                            ${safeAction}
                        </div>
                    </div>
                </div>
                `;
            }).join('');

            document.getElementById('historyModal').style.display = 'flex';
        };
    }

    const closeBtn = document.getElementById('close-ticket-modal');
    if (closeBtn) {
        closeBtn.onclick = () => {
            const modal = document.getElementById('ticketModal');
            if (modal) modal.style.display = 'none';
            currentActiveTicketId = null;
            updateDisplay();
        };
    }

    const closeHistoryBtn = document.getElementById('close-history-modal');
    if (closeHistoryBtn) {
        closeHistoryBtn.onclick = () => {
            document.getElementById('historyModal').style.display = 'none';
        };
    }
}