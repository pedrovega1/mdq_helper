const { test, expect } = require('@playwright/test');

test('ticket modal stays open after sending reply', async ({ page }) => {
  // Токен администратора берём из переменной окружения API_KEY,
  // чтобы он совпадал с тем, что использует сервер.
  const adminToken = process.env.API_KEY || '';

  await page.addInitScript((token) => {
    if (token) {
      window.localStorage.setItem('admin_token', token);
    }
  }, adminToken);

  await page.goto('/index.html');

  // Ждём, пока загрузится админ-панель
  await expect(page.locator('#admin-panel')).toBeVisible();

  // Кликаем по первой заявке
  const firstTicket = page.locator('.ticket-card').first();
  await expect(firstTicket).toBeVisible();
  await firstTicket.click();

  // Модалка должна открыться
  const modal = page.locator('#ticketModal');
  await expect(modal).toBeVisible();

  // Пишем ответ и отправляем
  await page.fill('#adminReplyText', 'Авто-тест: проверка, что модалка не закрывается');
  await page.click('#sendReplyBtn');

  // После отправки модалка должна оставаться открытой
  await expect(modal).toBeVisible();
});


