import { Auth } from './auth.js';

const API_URL = 'http://localhost:3000/api';

async function secureFetch(endpoint, options = {}) {
    const token = Auth.getToken();
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...options.headers
    };

    const response = await fetch(`${API_URL}${endpoint}`, { ...options, headers });

    // При 401 больше не делаем location.reload(), чтобы не закрывать модалки внезапно
    if (response.status === 401) {
        throw new Error('Unauthorized (401) — проверь пароль администратора / токен');
    }

    // Сначала читаем ответ (JSON, если есть), затем обязательно проверяем response.ok
    const contentType = response.headers.get('content-type') || '';
    const isJson = contentType.includes('application/json');
    const data = isJson ? await response.json() : null;

    if (!response.ok) {
        const msg = (data && (data.error || data.message)) ? (data.error || data.message) : `Server error: ${response.status}`;
        throw new Error(msg);
    }

    return data ?? {};
}

export const API = {
    login: (password) => fetch(`${API_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
    }).then(res => res.ok ? res.json() : Promise.reject()),
    
    getTickets: () => secureFetch('/tickets'),
    
    // Убедись, что тут /tickets/update
    updateTicket: (id, status, comment) => secureFetch('/tickets/update', {
        method: 'POST',
        body: JSON.stringify({ id, status, comment })
    })
};