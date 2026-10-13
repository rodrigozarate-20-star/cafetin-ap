import { db, auth } from "./firebase.js";
import { collection, doc, getDoc, onSnapshot, query, orderBy, limit, updateDoc, addDoc, deleteDoc,
         runTransaction, writeBatch, increment, deleteField }
  from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut }
  from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import { $, money, esc, emojiDe, fechaCorta, docs, toast } from "./ui.js";

let pedidos = [], mesas = [], productos = [], contadorOk = false, stops = [];
const slug = s => s.toLowerCase().replaceAll(' ', '-').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const SIGUIENTE = { 'Pendiente': 'En preparación', 'En preparación': 'Listo', 'Listo': 'Entregado' };

/* ---------- Acceso ---------- */
onAuthStateChanged(auth, async user => {
  stops.forEach(s => s()); stops = [];
  $('salir').hidden = !user;
  if (!user) { $('panel').hidden = true; $('login').hidden = false; return; }
  try {
    const admin = await getDoc(doc(db, 'admins', user.uid));
    if (!admin.exists()) {
      await signOut(auth);
      $('login-err').textContent = 'Esta cuenta no tiene permisos de administrador.';
      return;
    }
  } catch { await signOut(auth); return; }
  $('login').hidden = true; $('panel').hidden = false;
  escuchar();
});

$('login-form').addEventListener('submit', async e => {
  e.preventDefault(); $('login-err').textContent = '';
  try { await signInWithEmailAndPassword(auth, $('email').value.trim(), $('pass').value); }
  catch { $('login-err').textContent = 'Correo o contraseña incorrectos.'; }
});
$('salir').addEventListener('click', () => signOut(auth));

/* ---------- Tiempo real ---------- */
function escuchar() {
  const fail = e => { console.error(e); toast('Error de lectura. Revisa las reglas de Firestore.', 'error'); };
  stops.push(
    onSnapshot(query(collection(db, 'pedidos'), orderBy('fecha', 'desc'), limit(100)), s => { pedidos = docs(s); render(); }, fail),
    onSnapshot(query(collection(db, 'mesas'), orderBy('numero')), s => { mesas = docs(s); render(); }, fail),
    onSnapshot(query(collection(db, 'productos'), orderBy('nombre')), s => { productos = docs(s); render(); }, fail),
    onSnapshot(doc(db, 'meta', 'contador'), s => { contadorOk = s.exists(); render(); }, fail)
  );
  let primera = true;
  stops.push(onSnapshot(query(collection(db, 'pedidos'), orderBy('fecha', 'desc'), limit(1)), s => {
    if (primera) { primera = false; return; }
    s.docChanges().forEach(c => { if (c.type === 'added' && !c.doc.metadata.hasPendingWrites) toast(`Nuevo pedido #${c.doc.data().numero} de ${c.doc.data().cliente}`); });
  }));
}

/* ---------- Render ---------- */
const cls = s => 's-' + slug(s);
function tarjeta(p) {
  const sig = SIGUIENTE[p.estado];
  return `<article class="order">
    <header><div><h4>#${p.numero ?? '–'} · ${esc(p.cliente)}</h4><div class="meta">${p.mesaNumero ? `Mesa ${p.mesaNumero} · ` : ''}${fechaCorta(p.fecha)}</div></div>
      <span class="status ${cls(p.estado)}">${esc(p.estado)}</span></header>
    <ul>${(p.items || []).map(i => `<li>${i.cantidad}× ${esc(i.nombre)}</li>`).join('')}</ul>
    <div class="foot"><strong>${money(p.total)}</strong></div>
    <div class="acts">${sig ? `<button class="btn sm" data-estado="${sig}" data-id="${p.id}">Pasar a ${sig.toLowerCase()}</button>` : ''}
      ${p.estado !== 'Listo' ? `<button class="btn sm danger" data-cancel="${p.id}">Cancelar</button>` : ''}</div>
  </article>`;
}

function render() {
  $('setup').hidden = contadorOk && mesas.length && productos.length;
  const activos = e => pedidos.filter(p => p.estado === e);
  [['Pendiente', 'p'], ['En preparación', 'e'], ['Listo', 'l']].forEach(([estado, k]) => {
    const l = activos(estado);
    $('n-' + k).textContent = l.length;
    $('c-' + k).innerHTML = l.length ? l.map(tarjeta).join('') : '<div class="empty">Sin pedidos.</div>';
  });

  const res = mesas.filter(m => m.estado === 'Reservada').length;
  $('st-mesas').textContent = `${res}/${mesas.length}`;
  $('st-mesas-d').textContent = `${mesas.length - res} disponibles`;
  $('st-pend').textContent = activos('Pendiente').length + activos('En preparación').length;
  $('st-ventas').textContent = money(pedidos.filter(p => p.estado !== 'Cancelado').reduce((s, p) => s + (p.total || 0), 0));
  $('st-total').textContent = pedidos.length;

  $('mesas-admin').innerHTML = mesas.length ? mesas.map(m => {
    const oc = m.estado === 'Reservada';
    return `<div class="ma ${oc ? 'ocupada' : ''}"><div><strong>Mesa ${m.numero}</strong><br><small>${oc ? esc(m.reservadaPor || 'Reservada') : 'Libre'}</small></div>
      ${oc ? `<button class="btn ghost sm" data-liberar="${m.id}">Liberar</button>` : ''}</div>`;
  }).join('') : '<div class="empty">Sin mesas.</div>';

  const hist = pedidos.filter(p => p.estado === 'Entregado' || p.estado === 'Cancelado').slice(0, 12);
  $('hist').innerHTML = hist.length ? hist.map(p => `<div class="h"><span><b>#${p.numero ?? '–'}</b> ${esc(p.cliente)} · ${money(p.total)}</span><span class="status ${cls(p.estado)}">${p.estado}</span></div>`).join('') : '<div class="empty">Aún no hay historial.</div>';

  $('stock').innerHTML = productos.length ? productos.map(p => `<div class="sk"><span class="em">${emojiDe(p)}</span>
    <div><strong>${esc(p.nombre)}</strong> · ${money(p.precio)}<br><small class="${p.stock < 5 ? 'low' : ''}">${p.stock} unidades</small></div>
    <div class="qty"><button data-stock="-1" data-id="${p.id}" ${p.stock <= 0 ? 'disabled' : ''} aria-label="Restar una unidad">−</button><b>${p.stock}</b><button data-stock="1" data-id="${p.id}" aria-label="Sumar una unidad">+</button></div>
    <button class="btn danger sm" data-del="${p.id}">Quitar</button></div>`).join('') : '<div class="empty">No hay productos todavía.</div>';
}

/* ---------- Acciones ---------- */
const run = async (fn, ok) => { try { await fn(); if (ok) toast(ok); } catch (e) { console.error(e); toast('No se pudo completar la acción', 'error'); } };

document.addEventListener('click', e => {
  const t = e.target.closest('button'); if (!t) return;
  const d = t.dataset;
  if (d.estado) run(() => updateDoc(doc(db, 'pedidos', d.id), { estado: d.estado }), `Pedido: ${d.estado.toLowerCase()}`);
  else if (d.cancel) cancelar(d.cancel);
  else if (d.liberar) run(() => updateDoc(doc(db, 'mesas', d.liberar), { estado: 'Libre', reservadaPor: deleteField() }), 'Mesa liberada');
  else if (d.stock) run(() => updateDoc(doc(db, 'productos', d.id), { stock: increment(Number(d.stock)) }));
  else if (d.del && confirm('¿Quitar este producto de la carta?')) run(() => deleteDoc(doc(db, 'productos', d.del)), 'Producto quitado');
});

function cancelar(id) {
  if (!confirm('¿Cancelar el pedido? El stock se devolverá a la carta.')) return;
  run(() => runTransaction(db, async tx => {
    const ref = doc(db, 'pedidos', id), snap = await tx.get(ref);
    if (!snap.exists() || snap.data().estado === 'Cancelado') return;
    const items = snap.data().items || [];
    const prods = await Promise.all(items.map(i => tx.get(doc(db, 'productos', i.id))));
    prods.forEach((p, k) => { if (p.exists()) tx.update(p.ref, { stock: p.data().stock + items[k].cantidad }); });
    tx.update(ref, { estado: 'Cancelado' });
  }), 'Pedido cancelado');
}

$('add-mesa').addEventListener('click', () => {
  const n = mesas.reduce((m, x) => Math.max(m, x.numero), 0) + 1;
  run(() => addDoc(collection(db, 'mesas'), { numero: n, estado: 'Libre' }), `Mesa ${n} creada`);
});

$('add-form').addEventListener('submit', e => {
  e.preventDefault();
  const data = { nombre: $('n-nombre').value.trim(), precio: Number($('n-precio').value), stock: Math.floor(Number($('n-stock').value)), emoji: $('n-emoji').value.trim() };
  run(async () => { await addDoc(collection(db, 'productos'), data); e.target.reset(); }, 'Producto agregado');
});

$('seed').addEventListener('click', () => run(async () => {
  const b = writeBatch(db);
  b.set(doc(db, 'meta', 'contador'), { pedidos: pedidos.reduce((m, p) => Math.max(m, p.numero || 0), 0) });
  if (!mesas.length) for (let i = 1; i <= 6; i++) b.set(doc(db, 'mesas', `mesa-${i}`), { numero: i, estado: 'Libre' });
  if (!productos.length) [['Café Americano', 5, 20, '☕'], ['Jugo de Naranja', 6, 10, '🍊'], ['Sandwich de Pollo', 8.5, 15, '🥪']]
    .forEach(([nombre, precio, stock, emoji]) => b.set(doc(db, 'productos', slug(nombre)), { nombre, precio, stock, emoji }));
  await b.commit();
}, 'Cafetín listo para usar'));
