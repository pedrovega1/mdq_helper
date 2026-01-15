import { Auth } from './auth.js';

const API_URL = 'http://localhost:3000/api';

/**
 * Защищённый fetch с автоматической обработкой JWT токена
 */
async function secureFetch(endpoint, options = {}) {
    const token = Auth.getToken();
    
    if (!token) {
        throw new Error('Токен отсутствует. Необходима авторизация.');
    }

    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...options.headers
    };

    try {
        const response = await fetch(`${API_URL}${endpoint}`, { 
            ...options, 
            headers 
        });

        // Читаем ответ
        const contentType = response.headers.get('content-type') || '';
        const isJson = contentType.includes('application/json');
        const data = isJson ? await response.json() : null;

        // Обработка ошибок
        if (!response.ok) {
            // 401 - токен истёк или невалидный
            if (response.status === 401) {
                const message = data?.message || 'Сессия истекла';
                
                // Показываем уведомление пользователю
                if (typeof window !== 'undefined' && window.showNotification) {
                    window.showNotification(message, 'warning');
                }
                
                // Очищаем токен и перенаправляем на логин
                Auth.logout();
                throw new Error(message);
            }
            
            // 403 - нет доступа
            if (response.status === 403) {
                const message = data?.message || 'Доступ запрещён';
                throw new Error(message);
            }
            
            // Остальные ошибки
            const errorMessage = data?.message || data?.error || `Ошибка сервера: ${response.status}`;
            throw new Error(errorMessage);
        }

        return data ?? {};
        
    } catch (error) {
        // Если ошибка сети (сервер недоступен)
        if (error.name === 'TypeError' && error.message.includes('fetch')) {
            throw new Error('Сервер недоступен. Проверьте подключение.');
        }
        
        // Пробрасываем оригинальную ошибку
        throw error;
    }
}

export const API = {
    /**
     * Логин с получением JWT токена
     */
    login: async (password) => {
        try {
            const response = await fetch(`${API_URL}/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Неверный пароль');
            }

            return data; // { token, expiresIn, message }
            
        } catch (error) {
            if (error.message.includes('fetch')) {
                throw new Error('Сервер недоступен');
            }
            throw error;
        }
    },
    
    /**
     * Получение всех заявок
     */
    getTickets: () => secureFetch('/tickets'),
    
    /**
     * Обновление заявки (статус и/или комментарий)
     */
    updateTicket: (id, status, comment) => secureFetch('/tickets/update', {
        method: 'POST',
        body: JSON.stringify({ id, status, comment })
    }),

    /**
     * Проверка валидности токена
     */
    verifyToken: () => secureFetch('/verify')
};
