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

    if (response.status === 401) {
        Auth.logout();
        throw new Error('Unauthorized');
    }

    // Проверяем, что сервер вернул именно JSON, прежде чем его парсить
    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
        return await response.json();
    }
    
    if (!response.ok) throw new Error(`Server error: ${response.status}`);
    return {}; 
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