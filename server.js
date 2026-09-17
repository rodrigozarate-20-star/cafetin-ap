const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const db = new sqlite3.Database('./cafetin.db');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

db.serialize(() => {
    db.run("CREATE TABLE IF NOT EXISTS mesas (id INTEGER PRIMARY KEY, numero INTEGER, estado TEXT)");
    db.run("CREATE TABLE IF NOT EXISTS productos (id INTEGER PRIMARY KEY, nombre TEXT, precio REAL, stock INTEGER)");
    db.run("CREATE TABLE IF NOT EXISTS reservas (id INTEGER PRIMARY KEY, cliente TEXT, mesa_id INTEGER, fecha TEXT)");
    db.run("CREATE TABLE IF NOT EXISTS pedidos (id INTEGER PRIMARY KEY, cliente TEXT, total REAL, estado TEXT)");

    db.get("SELECT COUNT(*) as count FROM productos", (err, row) => {
        if (row && row.count === 0) {
            db.run("INSERT INTO productos (nombre, precio, stock) VALUES ('Café Americano', 5.0, 20)");
            db.run("INSERT INTO productos (nombre, precio, stock) VALUES ('Sandwich de Pollo', 8.5, 15)");
            db.run("INSERT INTO productos (nombre, precio, stock) VALUES ('Jugo de Naranja', 6.0, 10)");
        }
    });

    db.get("SELECT COUNT(*) as count FROM mesas", (err, row) => {
        if (row && row.count === 0) {
            for (let i = 1; i <= 6; i++) {
                db.run("INSERT INTO mesas (numero, estado) VALUES (?, 'Libre')", [i]);
            }
        }
    });
});

io.on('connection', (socket) => {
    db.all("SELECT * FROM productos", (err, productos) => {
        socket.emit('cargar_productos', productos);
    });
    db.all("SELECT * FROM mesas", (err, mesas) => {
        socket.emit('cargar_mesas', mesas);
    });

    socket.on('nueva_reserva', (data) => {
        const { cliente, mesaId } = data;
        db.run("UPDATE mesas SET estado = 'Reservada' WHERE id = ?", [mesaId], function(err) {
            if (!err) {
                db.run("INSERT INTO reservas (cliente, mesa_id, fecha) VALUES (?, ?, datetime('now'))", [cliente, mesaId]);
                io.emit('actualizacion_mesa', { mesaId, estado: 'Reservada', cliente });
            }
        });
    });

    socket.on('nuevo_pedido', (pedido) => {
        const { cliente, items, total } = pedido;

        db.run("INSERT INTO pedidos (cliente, total, estado) VALUES (?, ?, 'Pendiente')", [cliente, total], function(err) {
            const pedidoId = this.lastID;

            items.forEach(item => {
                db.run("UPDATE productos SET stock = stock - ? WHERE id = ?", [item.cantidad, item.id]);
            });

            db.all("SELECT * FROM productos", (err, productos) => {
                io.emit('cargar_productos', productos);
            });

            io.emit('notificacion_dueno_pedido', { pedidoId, cliente, items, total });
        });
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {

});