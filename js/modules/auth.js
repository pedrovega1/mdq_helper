export const Auth = {
    getToken: () => localStorage.getItem('admin_token'),
    setToken: (token) => localStorage.setItem('admin_token', token),
    logout: () => {
        localStorage.removeItem('admin_token');
        location.reload();
    },
    isLoggedIn: () => !!localStorage.getItem('admin_token')
};