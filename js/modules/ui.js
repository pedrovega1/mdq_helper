// Простая функция экранирования HTML
const escapeHtml = (value = '') =>
    String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

export const UI = {
    renderTickets: (tickets, config) => {
        const list = document.getElementById('ticketsList');
        if (!list) return;
        
        const { search, statusFilter } = config;
        
        // Backend уже вернул данные в правильном формате (camelCase)
        const filtered = tickets.filter(t => {
            const name = (t.userRealName || "").toLowerCase();
            const tg = (t.telegramUser || "").toLowerCase();
            const num = (t.number || "").toLowerCase();
            const dept = (t.department || "").toLowerCase();
            
            const matchesSearch = name.includes(search) || 
                                 tg.includes(search) || 
                                 num.includes(search) || 
                                 dept.includes(search);
            
            const matchesStatus = statusFilter === 'all' || t.status === statusFilter;
            
            return matchesSearch && matchesStatus;
        });

        if (filtered.length === 0) {
            list.innerHTML = '<div style="grid-column: 1/-1; text-align:center; padding:40px; color:#94a3b8;">Заявок нет</div>';
            return;
        }

        list.innerHTML = filtered.map(t => {
            const safeId = escapeHtml(t.id);
            const safeNumber = escapeHtml(t.number || '');
            const safeName = escapeHtml(t.userRealName || 'Не указано');
            const safeDept = escapeHtml(t.department || 'Не указан');
            const safeTg = escapeHtml(t.telegramUser || '@не_указан');
            const created = t.created ? new Date(t.created).toLocaleDateString('ru-RU') : '';

            const statusText = {
                'new': 'Новая',
                'in_progress': 'В работе',
                'resolved': 'Решена'
            }[t.status] || t.status;

            return `
            <div class="ticket-card" data-id="${safeId}">
                <div class="ticket-header">
                    <span class="ticket-num">${safeNumber}</span>
                    <span class="status-badge status-${t.status}">
                        ${statusText}
                    </span>
                </div>
                <h3>${safeName}</h3>
                <div class="ticket-dept">${safeDept}</div>
                <div style="display:flex; justify-content:space-between; align-items:center; margin-top:12px;">
                    <small style="color: #3b82f6; font-weight:600;">${safeTg}</small>
                    <small style="color: #94a3b8;">${created}</small>
                </div>
            </div>
            `;
        }).join('');
    },

    updateChatOnly: (ticket) => {
        const chatContainer = document.getElementById('chatMessages');
        if (!chatContainer) return;

        const html = (ticket.messages || []).map(m => {
            const isAdmin = m.role === 'admin';
            const safeText = escapeHtml(m.text || '');
            const timeStr = m.time ? new Date(m.time).toLocaleTimeString('ru-RU', {hour: '2-digit', minute:'2-digit'}) : '';
            
            return `
                <div style="display: flex; margin-bottom: 8px; flex-direction: column; align-items: ${isAdmin ? 'flex-end' : 'flex-start'};">
                    <div style="max-width: 75%; padding: 8px 12px; border-radius: 15px; font-size: 0.9rem; ${
                        isAdmin ? 'background: #2563eb; color: white; border-bottom-right-radius: 2px;' 
                                : 'background: #f1f5f9; color: #1e293b; border-bottom-left-radius: 2px;'
                    }">
                        <div style="word-break: break-word;">${safeText}</div>
                        <div style="font-size: 10px; opacity: 0.7; text-align: right; margin-top: 4px;">
                            ${timeStr}
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        if (chatContainer.innerHTML !== html) {
            chatContainer.innerHTML = html;
            chatContainer.scrollTop = chatContainer.scrollHeight;
        }
    },

    openTicketModal: (ticket) => {
        const modal = document.getElementById('ticketModal');
        if (!modal) return;

        // Backend уже вернул правильные поля (camelCase)
        document.getElementById('modalTicketNumber').textContent = ticket.number || 'N/A';
        document.getElementById('modalUserName').textContent = ticket.userRealName || 'Не указано';
        document.getElementById('modalDept').textContent = ticket.department || 'Не указан';
        document.getElementById('modalTgUser').textContent = ticket.telegramUser || '@не_указан';
        document.getElementById('modalStatusSelect').value = ticket.status;
        document.getElementById('sendReplyBtn').setAttribute('data-id', ticket.id);

        const statusWrapper = document.getElementById('statusWrapper');
        if (statusWrapper) {
            statusWrapper.classList.remove('status-new', 'status-in_progress', 'status-resolved');
            statusWrapper.classList.add(`status-${ticket.status}`);
        }

        UI.updateChatOnly(ticket);
        modal.style.display = 'flex';
    },

    updateStats: (tickets) => {
        const s = {
            new: tickets.filter(t => t.status === 'new').length,
            in_progress: tickets.filter(t => t.status === 'in_progress').length,
            resolved: tickets.filter(t => t.status === 'resolved').length
        };
        
        const cont = document.getElementById('stats-container');
        if (cont) {
            cont.innerHTML = `
                <div class="stat-card">Новые: <b>${s.new}</b></div>
                <div class="stat-card">В работе: <b>${s.in_progress}</b></div>
                <div class="stat-card">Решено: <b>${s.resolved}</b></div>
            `;
        }
    }
};

export const Auth = {
    getToken: () => localStorage.getItem('admin_token'),
    setToken: (token) => localStorage.setItem('admin_token', token),
    logout: () => { 
        localStorage.removeItem('admin_token'); 
        location.reload(); 
    },
    isLoggedIn: () => !!localStorage.getItem('admin_token')
};