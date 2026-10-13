import { db } from "./firebase.js";
import { collection, doc, onSnapshot, query, orderBy, runTransaction, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { $, money, esc, emojiDe, docs, toast } from "./ui.js";

let productos = [], mesas = [], mesaSel = null;
const carrito = new Map();            // productoId -> cantidad
let stopTrack = null;

/* ---------- Tiempo real ---------- */
const live = (ok, text) => { $('live').className = `live ${ok ? '' : 'off'}`; $('live').lastElementChild.textContent = text; };
const onErr = e => { console.error(e); live(false, 'Sin conexión'); };

onSnapshot(query(collection(db, 'mesas'), orderBy('numero')), snap => {
  mesas = docs(snap);
  if (mesaSel && !mesas.some(m => m.id === mesaSel && m.estado === 'Libre')) mesaSel = null;
  renderMesas(); renderTicketMesa(); live(true, 'Conectado en vivo');
}, onErr);

onSnapshot(query(collection(db, 'productos'), orderBy('nombre')), snap => {
  productos = docs(snap);
  for (const [id, q] of carrito) {            // ajusta el carrito si cambió el stock
    const p = productos.find(x => x.id === id);
    if (!p || p.stock <= 0) carrito.delete(id); else if (q > p.stock) carrito.set(id, p.stock);
  }
  renderCarta(); renderCarrito();
}, onErr);

/* ---------- Render ---------- */
function renderMesas() {
  if (!mesas.length) { $('mesas').innerHTML = '<div class="empty">Aún no hay mesas configuradas.</div>'; return; }
  $('mesas').innerHTML = mesas.map(m => {
    const libre = m.estado === 'Libre', sel = m.id === mesaSel;
    return `<button type="button" class="mesa ${libre ? '' : 'ocupada'} ${sel ? 'sel' : ''}" data-id="${m.id}" ${libre ? '' : 'disabled'} aria-pressed="${sel}">
      <strong>${m.numero}</strong><small>${sel ? 'Elegida' : libre ? 'Libre' : 'Reservada'}</small></button>`;
  }).join('');
}

function renderTicketMesa() {
  const m = mesas.find(x => x.id === mesaSel);
  $('mesa-elegida').textContent = m ? `Mesa ${m.numero}` : 'Sin mesa';
  $('mesa-elegida').className = `chip ${m ? '' : 'quiet'}`;
  $('ticket-mesa').textContent = m ? `Mesa ${m.numero} reservada para este pedido.` : 'Todavía no elegiste mesa (opcional).';
}

function renderCarta() {
  if (!productos.length) { $('carta').innerHTML = '<div class="empty">La carta aún está vacía.</div>'; return; }
  $('carta').innerHTML = productos.map(p => {
    const out = p.stock <= 0;
    return `<article class="item ${out ? 'out' : ''}">
      <span class="em">${emojiDe(p)}</span>
      <div><h3>${esc(p.nombre)}</h3><span class="sub ${p.stock > 0 && p.stock < 5 ? 'low' : ''}">${out ? 'Agotado' : p.stock < 5 ? `¡Quedan ${p.stock}!` : `${p.stock} disponibles`}</span></div>
      <div class="right"><span class="price">${money(p.precio)}</span>
        <button class="add" type="button" data-add="${p.id}" ${out ? 'disabled' : ''} aria-label="Agregar ${esc(p.nombre)}">+</button></div>
    </article>`;
  }).join('');
}

function totalPedido() {
  let t = 0;
  for (const [id, q] of carrito) t += (productos.find(p => p.id === id)?.precio || 0) * q;
  return Math.round(t * 100) / 100;
}

function renderCarrito() {
  if (!carrito.size) { $('carrito').innerHTML = '<div class="empty">Agrega algo de la carta para empezar.</div>'; }
  else $('carrito').innerHTML = [...carrito].map(([id, q]) => {
    const p = productos.find(x => x.id === id);
    return `<div class="line"><div><strong>${esc(p.nombre)}</strong><span>${money(p.precio)} c/u</span></div>
      <div class="qty"><button type="button" data-q="-1" data-id="${id}" aria-label="Quitar uno">−</button><b>${q}</b><button type="button" data-q="1" data-id="${id}" aria-label="Agregar uno">+</button></div>
      <strong>${money(p.precio * q)}</strong></div>`;
  }).join('');
  $('total').textContent = money(totalPedido());
}

/* ---------- Eventos ---------- */
$('mesas').addEventListener('click', e => {
  const b = e.target.closest('[data-id]'); if (!b) return;
  mesaSel = mesaSel === b.dataset.id ? null : b.dataset.id;
  renderMesas(); renderTicketMesa();
});
$('carta').addEventListener('click', e => {
  const b = e.target.closest('[data-add]'); if (!b) return;
  cambiar(b.dataset.add, 1);
});
$('carrito').addEventListener('click', e => {
  const b = e.target.closest('[data-q]'); if (!b) return;
  cambiar(b.dataset.id, Number(b.dataset.q));
});
$('enviar').addEventListener('click', enviar);

function cambiar(id, delta) {
  const p = productos.find(x => x.id === id); if (!p) return;
  const q = (carrito.get(id) || 0) + delta;
  if (q > p.stock) return toast('No hay más stock de este producto', 'error');
  if (q <= 0) carrito.delete(id); else carrito.set(id, q);
  renderCarrito();
}

/* ---------- Enviar pedido (transacción: stock + mesa + número) ---------- */
async function enviar() {
  const cliente = $('cliente').value.trim();
  if (!cliente) return toast('Escribe tu nombre para continuar', 'error');
  if (!carrito.size) return toast('Agrega al menos un producto', 'error');

  const items = [...carrito].map(([id, cantidad]) => {
    const p = productos.find(x => x.id === id);
    return { id, nombre: p.nombre, precio: p.precio, cantidad };
  });
  const total = Math.round(items.reduce((s, i) => s + i.precio * i.cantidad, 0) * 100) / 100;
  const btn = $('enviar'); btn.disabled = true; btn.textContent = 'Enviando…';

  try {
    const res = await runTransaction(db, async tx => {
      const contRef = doc(db, 'meta', 'contador');
      const cont = await tx.get(contRef);
      if (!cont.exists()) throw new Error('El cafetín aún no está configurado. Avisa al dueño.');
      const snaps = await Promise.all(items.map(i => tx.get(doc(db, 'productos', i.id))));

      let mesaRef = null, mesaNumero = null;
      if (mesaSel) {
        mesaRef = doc(db, 'mesas', mesaSel);
        const m = await tx.get(mesaRef);
        if (!m.exists() || m.data().estado !== 'Libre') throw new Error('Esa mesa ya fue reservada. Elige otra.');
        mesaNumero = m.data().numero;
      }
      snaps.forEach((s, i) => {
        if (!s.exists() || s.data().stock < items[i].cantidad) throw new Error(`Stock insuficiente: ${items[i].nombre}`);
      });

      const numero = cont.data().pedidos + 1;
      tx.update(contRef, { pedidos: numero });
      snaps.forEach((s, i) => tx.update(s.ref, { stock: s.data().stock - items[i].cantidad }));
      if (mesaRef) tx.update(mesaRef, { estado: 'Reservada', reservadaPor: cliente });
      const pedRef = doc(collection(db, 'pedidos'));
      tx.set(pedRef, { numero, cliente, mesaId: mesaSel || null, mesaNumero, items, total, estado: 'Pendiente', fecha: serverTimestamp() });
      return { id: pedRef.id, numero };
    });

    toast(`Pedido #${res.numero} enviado`);
    carrito.clear(); mesaSel = null;
    renderCarrito(); renderMesas(); renderTicketMesa();
    seguir(res.id);
    try { localStorage.setItem('cafetin:pedido', res.id); } catch {}
  } catch (e) {
    console.error(e);
    toast(e.code === 'permission-denied' ? 'No se pudo enviar. Revisa las reglas de Firestore.' : e.message, 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Enviar pedido';
  }
}

/* ---------- Seguimiento del pedido ---------- */
const FLUJO = ['Pendiente', 'En preparación', 'Listo', 'Entregado'];
function seguir(id) {
  stopTrack?.();
  stopTrack = onSnapshot(doc(db, 'pedidos', id), snap => {
    if (!snap.exists()) { $('track').hidden = true; return; }
    const p = snap.data(), idx = FLUJO.indexOf(p.estado), cancel = p.estado === 'Cancelado';
    $('track').hidden = false;
    $('track').className = `track ${cancel ? 'cancel' : ''}`;
    $('track-title').textContent = cancel ? `Pedido #${p.numero} cancelado` : `Pedido #${p.numero}: ${p.estado.toLowerCase()}`;
    [...$('steps').children].forEach((li, i) => li.classList.toggle('done', i <= idx));
  }, () => { $('track').hidden = true; });
}
try { const last = localStorage.getItem('cafetin:pedido'); if (last) seguir(last); } catch {}

renderCarrito();
