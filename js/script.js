import { Auth } from './modules/auth.js';
import { API } from './modules/api.js';
import { UI } from './modules/ui.js';

let allTickets = [];

document.addEventListener('DOMContentLoaded', () => {
    if (Auth.isLoggedIn()) {
        initAdminPanel();
    } else {
        const btn = document.getElementById('login-btn');
        if (btn) btn.onclick = handleLogin;
    }
});

async function handleLogin() {
    const input = document.getElementById('admin-password');
    if (!input) return;
    try {
        const data = await API.login(input.value);
        Auth.setToken(data.token);
        initAdminPanel();
    } catch (e) {
        const err = document.getElementById('login-error');
        if (err) err.style.display = 'block';
    }
}

function initAdminPanel() {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('admin-panel').style.display = 'flex';
    document.getElementById('logout-btn').onclick = () => Auth.logout();
    
    setupEventListeners();
    refreshData();
    setInterval(refreshData, 5000);
}

async function refreshData() {
    try {
        const tickets = await API.getTickets();
        if (Array.isArray(tickets)) {
            allTickets = tickets;
            updateDisplay();
        }
    } catch (e) {
        console.error("Data fetch error", e);
    }
}

function updateDisplay() {
    const search = document.getElementById('searchInput');
    const filter = document.getElementById('statusFilter');
    
    const config = {
        search: search ? search.value.toLowerCase() : '',
        statusFilter: filter ? filter.value : 'all'
    };
    
    UI.renderTickets(allTickets, config);
    UI.updateStats(allTickets);
}

function setupEventListeners() {
    const search = document.getElementById('searchInput');
    const filter = document.getElementById('statusFilter');

    if (search) search.oninput = updateDisplay;
    if (filter) filter.onchange = updateDisplay;

    document.addEventListener('click', async (e) => {
        const id = e.target.dataset.id;
        if (!id) return;

        if (e.target.classList.contains('reply-btn')) {
            const replyInput = document.getElementById(`reply-${id}`);
            const comment = replyInput.value.trim();
            if (!comment) return;
            
            const ticket = allTickets.find(t => t.id == id);
            await API.updateTicket(id, ticket.status, comment);
            replyInput.value = '';
            refreshData();
        }
        
        if (e.target.classList.contains('history-btn')) {
            const t = allTickets.find(x => x.id == id);
            if (!t) return;
            document.getElementById('historyLogs').innerHTML = t.history.map(h => 
                `<div style="padding: 5px 0; border-bottom: 1px solid #eee; font-size: 0.8rem;">
                    <b>${new Date(h.time).toLocaleTimeString()}</b>: ${h.action}
                </div>`
            ).join('');
            document.getElementById('historyModal').style.display = 'block';
        }

        if (e.target.classList.contains('tab-trigger')) {
            switchTab(e.target.dataset.tab);
        }
    });

    document.addEventListener('change', async (e) => {
        if (e.target.classList.contains('status-select')) {
            await API.updateTicket(e.target.dataset.id, e.target.value);
            refreshData();
        }
    });

    const close = document.getElementById('close-modal');
    if (close) close.onclick = () => document.getElementById('historyModal').style.display = 'none';
}

function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-trigger').forEach(el => el.classList.remove('active'));
    
    const target = document.getElementById(tabId);
    if (target) target.classList.add('active');
    
    const btn = document.querySelector(`[data-tab="${tabId}"]`);
    if (btn) btn.classList.add('active');
}