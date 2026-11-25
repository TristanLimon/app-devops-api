import { expect } from '@playwright/test';

export const ADMIN = {
  email: process.env.ADMIN_EMAIL || 'admin@uteq.mx',
  password: process.env.ADMIN_PASSWORD || 'Admin123!',
};

export async function login(page, email = ADMIN.email, password = ADMIN.password) {
  await page.goto('/');
  await page.getByTestId('login-email').fill(email);
  await page.getByTestId('login-password').fill(password);
  await page.getByTestId('login-submit').click();
  await expect(page).toHaveURL(/\/app\.html$/);
  await expect(page.getByTestId('current-user')).toHaveText(email);
}

export const unique = (prefix) => `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
