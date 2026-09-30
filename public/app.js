const socket = io();
let mesaSeleccionada = null;
let pedido = [];
let productos = [];

const $ = id => document.getElementById(id);
const money = value => `S/ ${Number(value || 0).toFixed(2)}`;

function toast(message, type = 'success') {
  const el = $('toast');
  el.textContent = message;
  el.className = `toast show ${type}`;
  clearTimeout(window.toastTimer);
  window.toastTimer = setTimeout(() => el.className = 'toast', 3000);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
}

socket.on('connect', () => toast('Conectado al cafetín en tiempo real'));
socket.on('disconnect', () => toast('Se perdió la conexión temporalmente', 'error'));

socket.on('cargar_mesas', mesas => renderMesas(mesas));
socket.on('cargar_productos', data => { productos = data; renderProductos(data); });
socket.on('pedido_actualizado', data => toast(`Pedido #${data.id}: ${data.estado}`));

function renderMesas(mesas) {
  const container = $('mesas-container');
  if (!container) return;
  container.innerHTML = mesas.map(m => {
    const libre = m.estado === 'Libre';
    const selected = mesaSeleccionada === m.id;
    return `<button type="button" class="table-card ${libre ? 'free' : 'busy'} ${selected ? 'selected' : ''}" ${libre ? `onclick="seleccionarMesa(${m.id}, ${m.numero})"` : 'disabled'}>
      <span class="table-icon">${libre ? '○' : '●'}</span><strong>Mesa ${m.numero}</strong><small>${libre ? 'Disponible' : 'Reservada'}</small>${selected ? '<span class="selected-check">✓</span>' : ''}
    </button>`;
  }).join('');
}

function renderProductos(data) {
  const container = $('productos-container');
  if (!container) return;
  container.innerHTML = data.map(p => {
    const disabled = p.stock <= 0;
    return `<article class="product-card ${disabled ? 'sold-out' : ''}">
      <div class="product-icon">${productIcon(p.nombre)}</div>
      <div class="product-info"><h3>${escapeHtml(p.nombre)}</h3><strong>${money(p.precio)}</strong><span class="stock ${p.stock < 5 ? 'low' : ''}">${disabled ? 'Agotado' : `${p.stock} disponibles`}</span></div>
      <button type="button" class="add-btn" ${disabled ? 'disabled' : ''} onclick="agregarAlCarrito(${p.id})">+</button>
    </article>`;
  }).join('');
}

function productIcon(name) {
  const n = String(name).toLowerCase();
  if (n.includes('café') || n.includes('cafe')) return '☕';
  if (n.includes('jugo')) return '🍊';
  return '🥪';
}

function seleccionarMesa(id, numero) {
  mesaSeleccionada = id;
  $('mesa-elegida').textContent = `Mesa ${numero}`;
  renderMesasFromCurrent();
  toast(`Mesa ${numero} seleccionada`);
}

async function renderMesasFromCurrent() {
  try { const r = await fetch('/api/mesas'); renderMesas(await r.json()); } catch (e) {}
}

function agregarAlCarrito(id) {
  const product = productos.find(p => p.id === id);
  if (!product || product.stock <= 0) return;
  const existing = pedido.find(item => item.id === id);
  if (existing) {
    if (existing.cantidad >= product.stock) return toast('No hay más stock disponible', 'error');
    existing.cantidad++;
  } else {
    pedido.push({ id, nombre: product.nombre, precio: product.precio, cantidad: 1 });
  }
  actualizarResumen();
  toast(`${product.nombre} agregado`);
}

function cambiarCantidad(id, delta) {
  const item = pedido.find(i => i.id === id);
  const product = productos.find(p => p.id === id);
  if (!item || !product) return;
  item.cantidad += delta;
  if (item.cantidad > product.stock) item.cantidad = product.stock;
  if (item.cantidad <= 0) pedido = pedido.filter(i => i.id !== id);
  actualizarResumen();
}

function actualizarResumen() {
  const container = $('resumen-pedido');
  if (!pedido.length) {
    container.innerHTML = '<div class="empty-state">Aún no agregas productos.<br><small>Elige algo del menú para comenzar.</small></div>';
    $('total-consumo').textContent = money(0);
    return;
  }
  let total = 0;
  container.innerHTML = pedido.map(item => {
    const subtotal = item.precio * item.cantidad;
    total += subtotal;
    return `<div class="cart-item"><div><strong>${escapeHtml(item.nombre)}</strong><span>${money(item.precio)} c/u</span></div><div class="qty"><button type="button" onclick="cambiarCantidad(${item.id},-1)">−</button><b>${item.cantidad}</b><button type="button" onclick="cambiarCantidad(${item.id},1)">+</button></div><strong>${money(subtotal)}</strong></div>`;
  }).join('');
  $('total-consumo').textContent = money(total);
}

async function confirmarPedido() {
  const cliente = $('nombre-cliente').value.trim();
  if (!cliente) return toast('Ingresa tu nombre para continuar', 'error');
  if (!pedido.length) return toast('Agrega al menos un producto', 'error');

  const button = $('confirmar-btn');
  button.disabled = true;
  button.innerHTML = 'Enviando…';
  try {
    const response = await fetch('/api/pedidos', {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ cliente, mesaId: mesaSeleccionada, items: pedido })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'No se pudo enviar el pedido');
    toast(`Pedido #${data.id} enviado correctamente`);
    pedido = [];
    mesaSeleccionada = null;
    $('mesa-elegida').textContent = 'Ninguna';
    actualizarResumen();
    await renderMesasFromCurrent();
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    button.disabled = false;
    button.innerHTML = 'Enviar pedido <span>→</span>';
  }
}

$('confirmar-btn').addEventListener('click', confirmarPedido);
actualizarResumen();