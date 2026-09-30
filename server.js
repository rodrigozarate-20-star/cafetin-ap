const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const db = new sqlite3.Database(path.join(__dirname, 'cafetin.db'));

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const emitState = () => {
    db.all('SELECT * FROM mesas ORDER BY numero', (err, mesas) => {
        if (!err) io.emit('cargar_mesas', mesas);
    });
    db.all('SELECT * FROM productos ORDER BY id', (err, productos) => {
        if (!err) io.emit('cargar_productos', productos);
    });
    db.all(`SELECT id, cliente, total, estado, fecha FROM pedidos ORDER BY id DESC`, (err, pedidos) => {
        if (!err) io.emit('cargar_pedidos', pedidos || []);
    });
};

const getDashboard = (callback) => {
    const result = {};
    db.get("SELECT COUNT(*) AS total FROM mesas", (err, row) => {
        if (err) return callback(err);
        result.totalMesas = row.total;
        db.get("SELECT COUNT(*) AS ocupadas FROM mesas WHERE estado = 'Reservada'", (err2, row2) => {
            if (err2) return callback(err2);
            result.mesasOcupadas = row2.ocupadas;
            db.get("SELECT COUNT(*) AS pendientes FROM pedidos WHERE estado IN ('Pendiente','En preparación')", (err3, row3) => {
                if (err3) return callback(err3);
                result.pedidosPendientes = row3.pendientes;
                db.get("SELECT COALESCE(SUM(total), 0) AS ventas FROM pedidos WHERE estado <> 'Cancelado'", (err4, row4) => {
                    if (err4) return callback(err4);
                    result.ventas = Number(row4.ventas || 0);
                    callback(null, result);
                });
            });
        });
    });
};

// Crear estructura inicial si todavía no existe.
db.serialize(() => {
    db.run("CREATE TABLE IF NOT EXISTS mesas (id INTEGER PRIMARY KEY, numero INTEGER, estado TEXT NOT NULL DEFAULT 'Libre')");
    db.run("CREATE TABLE IF NOT EXISTS productos (id INTEGER PRIMARY KEY, nombre TEXT, precio REAL, stock INTEGER NOT NULL DEFAULT 0)");
    db.run("CREATE TABLE IF NOT EXISTS reservas (id INTEGER PRIMARY KEY, cliente TEXT, mesa_id INTEGER, fecha TEXT)");
    db.run("CREATE TABLE IF NOT EXISTS pedidos (id INTEGER PRIMARY KEY, cliente TEXT, total REAL, estado TEXT, fecha TEXT)");

    db.run("ALTER TABLE pedidos ADD COLUMN fecha TEXT", () => {});

    db.get("SELECT COUNT(*) AS count FROM productos", (err, row) => {
        if (!err && row.count === 0) {
            const stmt = db.prepare("INSERT INTO productos (nombre, precio, stock) VALUES (?, ?, ?)");
            stmt.run('Café Americano', 5.00, 20);
            stmt.run('Jugo de Naranja', 6.00, 10);
            stmt.run('Sandwich de Pollo', 8.50, 15);
            stmt.finalize();
        }
    });

    db.get("SELECT COUNT(*) AS count FROM mesas", (err, row) => {
        if (!err && row.count === 0) {
            const stmt = db.prepare("INSERT INTO mesas (numero, estado) VALUES (?, 'Libre')");
            for (let i = 1; i <= 6; i++) stmt.run(i);
            stmt.finalize();
        }
    });
});

// ---------- API REST ----------
app.get('/api/mesas', (req, res) => {
    db.all('SELECT * FROM mesas ORDER BY numero', (err, rows) => {
        if (err) return res.status(500).json({ error: 'No se pudieron cargar las mesas' });
        res.json(rows);
    });
});

app.get('/api/productos', (req, res) => {
    db.all('SELECT * FROM productos ORDER BY id', (err, rows) => {
        if (err) return res.status(500).json({ error: 'No se pudieron cargar los productos' });
        res.json(rows);
    });
});

app.get('/api/pedidos', (req, res) => {
    db.all('SELECT * FROM pedidos ORDER BY id DESC', (err, rows) => {
        if (err) return res.status(500).json({ error: 'No se pudieron cargar los pedidos' });
        res.json(rows);
    });
});

app.get('/api/reservas', (req, res) => {
    db.all(`SELECT r.*, m.numero AS mesa_numero
            FROM reservas r
            LEFT JOIN mesas m ON m.id = r.mesa_id
            ORDER BY r.id DESC`, (err, rows) => {
        if (err) return res.status(500).json({ error: 'No se pudieron cargar las reservas' });
        res.json(rows);
    });
});

app.get('/api/dashboard', (req, res) => {
    getDashboard((err, data) => {
        if (err) return res.status(500).json({ error: 'No se pudo cargar el resumen' });
        res.json(data);
    });
});

app.post('/api/reservas', (req, res) => {
    const cliente = String(req.body.cliente || '').trim();
    const mesaId = Number(req.body.mesaId);
    if (!cliente || !Number.isInteger(mesaId)) {
        return res.status(400).json({ error: 'Cliente y mesa son obligatorios' });
    }

    db.get('SELECT * FROM mesas WHERE id = ?', [mesaId], (err, mesa) => {
        if (err) return res.status(500).json({ error: 'Error de base de datos' });
        if (!mesa) return res.status(404).json({ error: 'Mesa no encontrada' });
        if (mesa.estado !== 'Libre') return res.status(409).json({ error: 'La mesa ya está reservada' });

        db.run("UPDATE mesas SET estado = 'Reservada' WHERE id = ?", [mesaId], function (updateErr) {
            if (updateErr) return res.status(500).json({ error: 'No se pudo reservar la mesa' });
            db.run("INSERT INTO reservas (cliente, mesa_id, fecha) VALUES (?, ?, datetime('now','localtime'))", [cliente, mesaId], function (insertErr) {
                if (insertErr) return res.status(500).json({ error: 'No se pudo guardar la reserva' });
                emitState();
                res.status(201).json({ id: this.lastID, message: `Mesa ${mesa.numero} reservada correctamente` });
            });
        });
    });
});

app.patch('/api/mesas/:id', (req, res) => {
    const id = Number(req.params.id);
    const estado = req.body.estado === 'Reservada' ? 'Reservada' : 'Libre';
    db.run('UPDATE mesas SET estado = ? WHERE id = ?', [estado, id], function (err) {
        if (err) return res.status(500).json({ error: 'No se pudo actualizar la mesa' });
        if (!this.changes) return res.status(404).json({ error: 'Mesa no encontrada' });
        emitState();
        res.json({ message: `Mesa actualizada a ${estado}` });
    });
});

app.post('/api/pedidos', (req, res) => {
    const cliente = String(req.body.cliente || '').trim();
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    const mesaId = req.body.mesaId ? Number(req.body.mesaId) : null;

    if (!cliente || items.length === 0) {
        return res.status(400).json({ error: 'Cliente y productos son obligatorios' });
    }

    const ids = items.map(item => Number(item.id)).filter(Number.isInteger);
    if (ids.length !== items.length) return res.status(400).json({ error: 'Hay productos inválidos' });

    db.serialize(() => {
        db.all(`SELECT * FROM productos WHERE id IN (${ids.map(() => '?').join(',')})`, ids, (err, productos) => {
            if (err) return res.status(500).json({ error: 'No se pudieron validar los productos' });
            const mapa = new Map(productos.map(p => [p.id, p]));
            let total = 0;

            for (const item of items) {
                const producto = mapa.get(Number(item.id));
                const cantidad = Number(item.cantidad);
                if (!producto || !Number.isInteger(cantidad) || cantidad < 1) {
                    return res.status(400).json({ error: 'Producto o cantidad inválida' });
                }
                if (producto.stock < cantidad) {
                    return res.status(409).json({ error: `Stock insuficiente para ${producto.nombre}` });
                }
                total += producto.precio * cantidad;
            }

            db.run("INSERT INTO pedidos (cliente, total, estado, fecha) VALUES (?, ?, 'Pendiente', datetime('now','localtime'))", [cliente, total], function (insertErr) {
                if (insertErr) return res.status(500).json({ error: 'No se pudo registrar el pedido' });
                const pedidoId = this.lastID;
                let remaining = items.length;
                let failed = false;

                items.forEach(item => {
                    db.run('UPDATE productos SET stock = stock - ? WHERE id = ?', [Number(item.cantidad), Number(item.id)], updateErr => {
                        if (updateErr && !failed) {
                            failed = true;
                            return res.status(500).json({ error: 'No se pudo actualizar el stock' });
                        }
                        remaining -= 1;
                        if (remaining === 0 && !failed) {
                            if (mesaId) {
                                db.run("UPDATE mesas SET estado = 'Reservada' WHERE id = ? AND estado = 'Libre'", [mesaId]);
                                db.run("INSERT INTO reservas (cliente, mesa_id, fecha) VALUES (?, ?, datetime('now','localtime'))", [cliente, mesaId]);
                            }
                            emitState();
                            io.emit('notificacion_dueno_pedido', { pedidoId, cliente, items, total });
                            res.status(201).json({ id: pedidoId, total, message: 'Pedido enviado correctamente' });
                        }
                    });
                });
            });
        });
    });
});

app.patch('/api/pedidos/:id', (req, res) => {
    const id = Number(req.params.id);
    const estados = ['Pendiente', 'En preparación', 'Listo', 'Entregado', 'Cancelado'];
    const estado = String(req.body.estado || '');
    if (!estados.includes(estado)) return res.status(400).json({ error: 'Estado no válido' });

    db.run('UPDATE pedidos SET estado = ? WHERE id = ?', [estado, id], function (err) {
        if (err) return res.status(500).json({ error: 'No se pudo actualizar el pedido' });
        if (!this.changes) return res.status(404).json({ error: 'Pedido no encontrado' });
        io.emit('pedido_actualizado', { id, estado });
        emitState();
        res.json({ message: 'Pedido actualizado' });
    });
});

// ---------- Socket.IO ----------
io.on('connection', socket => {
    db.all('SELECT * FROM productos ORDER BY id', (err, productos) => {
        if (!err) socket.emit('cargar_productos', productos);
    });
    db.all('SELECT * FROM mesas ORDER BY numero', (err, mesas) => {
        if (!err) socket.emit('cargar_mesas', mesas);
    });
    db.all('SELECT * FROM pedidos ORDER BY id DESC', (err, pedidos) => {
        if (!err) socket.emit('cargar_pedidos', pedidos);
    });

    socket.on('liberar_mesa', mesaId => {
        const id = Number(mesaId);
        if (!Number.isInteger(id)) return;
        db.run("UPDATE mesas SET estado = 'Libre' WHERE id = ?", [id], function (err) {
            if (!err && this.changes) emitState();
        });
    });
});

app.get(/^(?!\/api\/).*/, (req, res) => {
    if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Ruta no encontrada' });
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`☕ Cafetín App ejecutándose en http://localhost:${PORT}`);
});

process.on('SIGINT', () => {
    db.close(() => process.exit(0));
});