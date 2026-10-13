export const $ = id => document.getElementById(id);
export const money = v => `S/ ${Number(v || 0).toFixed(2)}`;
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const emojiDe = p => p.emoji || (/caf/i.test(p.nombre) ? '☕' : /jugo/i.test(p.nombre) ? '🍊' : '🍽️');
export const fechaCorta = ts => ts?.toDate ? ts.toDate().toLocaleString('es-PE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
export const docs = snap => snap.docs.map(d => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) }));

let timer;
export function toast(msg, type = 'ok') {
  const el = $('toast');
  el.textContent = msg;
  el.className = `toast show ${type}`;
  clearTimeout(timer);
  timer = setTimeout(() => (el.className = 'toast'), 3200);
}
