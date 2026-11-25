const token = localStorage.getItem('token');
if (!token) window.location.href = '/';

const $ = (sel) => document.querySelector(sel);
const flash = $('#flash');

async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(options.headers || {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (res.status === 401) {
    logout();
    throw new Error('Sesión expirada');
  }
  if (!res.ok) throw new Error(body.data?.[0]?.error || `Error ${res.status}`);
  return body.data;
}

function showFlash(msg) {
  flash.textContent = msg;
  flash.hidden = false;
  clearTimeout(showFlash.t);
  showFlash.t = setTimeout(() => { flash.hidden = true; }, 3000);
}

function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  window.location.href = '/';
}

function cell(text) {
  const td = document.createElement('td');
  td.textContent = text ?? '';
  return td;
}

function actionCell(onEdit, onDelete, label) {
  const td = document.createElement('td');
  const edit = document.createElement('button');
  edit.textContent = 'Editar';
  edit.className = 'small';
  edit.setAttribute('aria-label', `Editar ${label}`);
  edit.onclick = onEdit;
  const del = document.createElement('button');
  del.textContent = 'Eliminar';
  del.className = 'small danger';
  del.setAttribute('aria-label', `Eliminar ${label}`);
  del.onclick = onDelete;
  td.append(edit, del);
  return td;
}

function showFormError(form, msg) {
  const p = form.querySelector('.error');
  p.textContent = msg;
  p.hidden = !msg;
}

// ---------- Sesión ----------
const me = JSON.parse(localStorage.getItem('user') || '{}');
$('#current-user').textContent = me.email || '';
$('#logout').onclick = logout;

// ---------- Tabs ----------
document.querySelectorAll('.tab').forEach((btn) => {
  btn.onclick = () => {
    document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b === btn));
    $('#users').hidden = btn.dataset.tab !== 'users';
    $('#products').hidden = btn.dataset.tab !== 'products';
  };
});

document.querySelectorAll('[data-close]').forEach((b) => { b.onclick = () => b.closest('dialog').close(); });

// ---------- Usuarios ----------
const userDialog = $('#user-dialog');
const userForm = $('#user-form');

async function loadUsers() {
  const users = await api('/api/users');
  const body = $('#users-body');
  body.replaceChildren();
  users.forEach((u) => {
    const tr = document.createElement('tr');
    tr.setAttribute('data-testid', 'user-row');
    tr.append(cell(u.id), cell(u.nombre), cell(u.email), cell(u.rol),
      actionCell(() => openUser(u), () => deleteUser(u), u.email));
    body.append(tr);
  });
}

function openUser(u) {
  userForm.reset();
  showFormError(userForm, '');
  $('#user-dialog-title').textContent = u ? 'Editar usuario' : 'Nuevo usuario';
  userForm.id.value = u?.id || '';
  userForm.nombre.value = u?.nombre || '';
  userForm.email.value = u?.email || '';
  userForm.rol.value = u?.rol || 'usuario';
  userDialog.showModal();
}

async function deleteUser(u) {
  if (!confirm(`¿Eliminar al usuario ${u.email}?`)) return;
  try {
    await api(`/api/users/${u.id}`, { method: 'DELETE' });
    showFlash('Usuario eliminado');
    loadUsers();
  } catch (err) { showFlash(err.message); }
}

userForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(userForm));
  const id = data.id;
  delete data.id;
  if (id && !data.password) delete data.password;
  try {
    await api(id ? `/api/users/${id}` : '/api/users', { method: id ? 'PUT' : 'POST', body: JSON.stringify(data) });
    userDialog.close();
    showFlash(id ? 'Usuario actualizado' : 'Usuario creado');
    loadUsers();
  } catch (err) { showFormError(userForm, err.message); }
});

$('#new-user').onclick = () => openUser(null);

// ---------- Productos ----------
const productDialog = $('#product-dialog');
const productForm = $('#product-form');
const money = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

async function loadProducts() {
  const products = await api('/api/products');
  const body = $('#products-body');
  body.replaceChildren();
  products.forEach((p) => {
    const tr = document.createElement('tr');
    tr.setAttribute('data-testid', 'product-row');
    tr.append(cell(p.id), cell(p.nombre), cell(p.descripcion), cell(money.format(p.precio)), cell(p.stock),
      actionCell(() => openProduct(p), () => deleteProduct(p), p.nombre));
    body.append(tr);
  });
}

function openProduct(p) {
  productForm.reset();
  showFormError(productForm, '');
  $('#product-dialog-title').textContent = p ? 'Editar producto' : 'Nuevo producto';
  productForm.id.value = p?.id || '';
  productForm.nombre.value = p?.nombre || '';
  productForm.descripcion.value = p?.descripcion || '';
  productForm.precio.value = p?.precio ?? '';
  productForm.stock.value = p?.stock ?? '';
  productDialog.showModal();
}

async function deleteProduct(p) {
  if (!confirm(`¿Eliminar el producto ${p.nombre}?`)) return;
  try {
    await api(`/api/products/${p.id}`, { method: 'DELETE' });
    showFlash('Producto eliminado');
    loadProducts();
  } catch (err) { showFlash(err.message); }
}

productForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(productForm));
  const id = data.id;
  delete data.id;
  try {
    await api(id ? `/api/products/${id}` : '/api/products', { method: id ? 'PUT' : 'POST', body: JSON.stringify(data) });
    productDialog.close();
    showFlash(id ? 'Producto actualizado' : 'Producto creado');
    loadProducts();
  } catch (err) { showFormError(productForm, err.message); }
});

$('#new-product').onclick = () => openProduct(null);

loadUsers().catch((err) => showFlash(err.message));
loadProducts().catch((err) => showFlash(err.message));
