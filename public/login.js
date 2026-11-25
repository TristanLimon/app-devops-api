const form = document.getElementById('login-form');
const errorBox = document.getElementById('login-error');

if (localStorage.getItem('token')) window.location.href = '/app.html';

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorBox.hidden = true;
  const email = form.email.value.trim();
  const password = form.password.value;
  if (!email || !password) {
    errorBox.textContent = 'Ingresa tu correo y contraseña';
    errorBox.hidden = false;
    return;
  }
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json();
  if (!res.ok) {
    errorBox.textContent = body.data?.[0]?.error || 'Error al iniciar sesión';
    errorBox.hidden = false;
    return;
  }
  localStorage.setItem('token', body.data[0].token);
  localStorage.setItem('user', JSON.stringify(body.data[0].user));
  window.location.href = '/app.html';
});
