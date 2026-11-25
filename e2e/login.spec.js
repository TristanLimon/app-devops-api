import { test, expect } from '@playwright/test';
import { ADMIN, login } from './helpers.js';

test.describe('Frontend - Login', () => {
  test('muestra el formulario de inicio de sesión', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Iniciar sesión/);
    await expect(page.getByTestId('login-email')).toBeVisible();
    await expect(page.getByTestId('login-password')).toBeVisible();
    await expect(page.getByTestId('login-submit')).toHaveText('Entrar');
  });

  test('inicia sesión con credenciales válidas', async ({ page }) => {
    await login(page);
    await expect(page.getByTestId('users-section')).toBeVisible();
  });

  test('rechaza una contraseña incorrecta', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('login-email').fill(ADMIN.email);
    await page.getByTestId('login-password').fill('contraseña-mala');
    await page.getByTestId('login-submit').click();
    await expect(page.getByTestId('login-error')).toHaveText('Credenciales inválidas');
    await expect(page).not.toHaveURL(/app\.html/);
  });

  test('valida campos vacíos', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('login-submit').click();
    await expect(page.getByTestId('login-error')).toHaveText('Ingresa tu correo y contraseña');
  });

  test('redirige al login si no hay sesión', async ({ page }) => {
    await page.goto('/app.html');
    await expect(page).toHaveURL(/\/$/);
  });

  test('cierra sesión', async ({ page }) => {
    await login(page);
    await page.getByTestId('logout').click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByTestId('login-form')).toBeVisible();
  });
});
