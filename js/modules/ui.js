export const UI = {
    renderTickets: (tickets, config) => {
        const list = document.getElementById('ticketsList');
        if (!list) return;

        const { search, statusFilter } = config;
        
        const filtered = tickets.filter(t => {
            const name = (t.userRealName || "").toLowerCase();
            const tg = (t.telegramUser || "").toLowerCase();
            const num = (t.number || "").toLowerCase();
            const dept = (t.department || "").toLowerCase();
            
            const matchesSearch = name.includes(search) || tg.includes(search) || num.includes(search) || dept.includes(search);
            const matchesStatus = statusFilter === 'all' || t.status === statusFilter;
            return matchesSearch && matchesStatus;
        });

        if (filtered.length === 0) {
            list.innerHTML = '<div style="grid-column: 1/-1; text-align:center; padding:40px; color:#94a3b8;">Заявок нет</div>';
            return;
        }

        list.innerHTML = filtered.map(t => `
            <div class="ticket-card" style="border-left: 5px solid ${UI.getStatusColor(t.status)}; display: flex; flex-direction: column; height: 500px;">
                <div style="display:flex; justify-content:space-between; align-items: start;">
                    <div>
                        <span style="font-size: 0.75rem; color: #64748b; font-weight:bold;">${t.number}</span>
                        <h3 style="margin: 2px 0;">${t.userRealName}</h3>
                        <small style="color: #3b82f6;">${t.telegramUser || ''}</small>
                    </div>
                    <button class="history-btn" data-id="${t.id}" style="padding: 4px 8px; font-size: 11px; cursor:pointer;">История</button>
                </div>

                <div id="chat-${t.id}" style="flex: 1; overflow-y: auto; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px; display: flex; flex-direction: column; gap: 8px; margin: 10px 0;">
                    ${(t.messages || []).map(m => `
                        <div style="max-width: 80%; padding: 8px 12px; border-radius: 12px; font-size: 0.85rem; 
                            ${m.role === 'admin' 
                                ? 'align-self: flex-end; background: #1e293b; color: white;' 
                                : 'align-self: flex-start; background: #e2e8f0; color: #1e293b;'
                            }">
                            ${m.text}
                            <div style="font-size: 0.6rem; opacity: 0.7; margin-top: 4px;">
                                ${new Date(m.time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                            </div>
                        </div>
                    `).join('')}
                </div>

                <div style="display: flex; gap: 5px; margin-bottom: 10px;">
                    <input type="text" id="reply-${t.id}" placeholder="Сообщение..." style="flex:1; padding: 8px; border-radius: 4px; border: 1px solid #cbd5e1;">
                    <button class="reply-btn" data-id="${t.id}" style="background: #1e293b; color: white; border: none; padding: 0 12px; border-radius: 4px; cursor: pointer;">Отправить</button>
                </div>

                <div style="display:flex; justify-content:space-between; align-items: center;">
                    <select class="status-select" data-id="${t.id}" style="padding: 4px; border-radius: 4px;">
                        <option value="new" ${t.status === 'new' ? 'selected' : ''}>Новая</option>
                        <option value="in_progress" ${t.status === 'in_progress' ? 'selected' : ''}>В работе</option>
                        <option value="resolved" ${t.status === 'resolved' ? 'selected' : ''}>Решена</option>
                    </select>
                    <small style="color: #94a3b8;">${t.department}</small>
                </div>
            </div>
        `).join('');

        filtered.forEach(t => {
            const chat = document.getElementById(`chat-${t.id}`);
            if (chat) chat.scrollTop = chat.scrollHeight;
        });
    },

    getStatusColor: (status) => {
        const colors = { new: '#3b82f6', in_progress: '#f59e0b', resolved: '#10b981' };
        return colors[status] || '#ccc';
    },

    updateStats: (tickets) => {
        const container = document.getElementById('stats-container');
        if (!container) return;
        const s = {
            new: tickets.filter(t => t.status === 'new').length,
            in_progress: tickets.filter(t => t.status === 'in_progress').length,
            resolved: tickets.filter(t => t.status === 'resolved').length
        };
        container.innerHTML = `
            <div class="stat-card">Новые: <b>${s.new}</b></div>
            <div class="stat-card">В работе: <b>${s.in_progress}</b></div>
            <div class="stat-card">Решено: <b>${s.resolved}</b></div>
        `;
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