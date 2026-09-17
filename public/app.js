const socket = io();

let mesaSeleccionada = null;
let pedido = [];
let total = 0;

socket.on('cargar_mesas', (mesas) => {
    const contenedor = document.getElementById('mesas-container');
    if (!contenedor) return;
    contenedor.innerHTML = '';
    mesas.forEach(m => {
        const div = document.createElement('div');
        div.className = 'mesa ' + m.estado.toLowerCase();
        div.innerText = 'Mesa ' + m.numero + ' (' + m.estado + ')';
        if (m.estado === 'Libre') {
            div.onclick = () => seleccionarMesa(m.id, m.numero);
        }
        contenedor.appendChild(div);
    });
});

socket.on('cargar_productos', (productos) => {
    const contenedor = document.getElementById('productos-container');
    if (!contenedor) return;
    contenedor.innerHTML = '';
    productos.forEach(p => {
        const div = document.createElement('div');
        div.className = 'producto-card';
        div.innerHTML = 
            '<h4>' + p.nombre + '</h4>' +
            '<p>Precio: S/ ' + p.precio.toFixed(2) + '</p>' +
            '<p>Stock: ' + p.stock + '</p>' +
            '<button onclick="agregarAlCarrito(' + p.id + ', \'' + p.nombre + '\', ' + p.precio + ', ' + p.stock + ')" ' + (p.stock <= 0 ? 'disabled' : '') + '>Agregar</button>';
        contenedor.appendChild(div);
    });
});

function seleccionarMesa(id, numero) {
    mesaSeleccionada = id;
    const txt = document.getElementById('mesa-elegida');
    if (txt) txt.innerText = 'Mesa ' + numero;
}

function agregarAlCarrito(id, nombre, precio, stock) {
    const existe = pedido.find(item => item.id === id);
    if (existe) {
        if (existe.cantidad < stock) {
            existe.cantidad++;
        } else {
            alert('No hay más stock disponible');
            return;
        }
    } else {
        pedido.push({ id, nombre, precio, cantidad: 1 });
    }
    actualizarResumen();
}

function actualizarResumen() {
    const contenedor = document.getElementById('resumen-pedido');
    const totalElemento = document.getElementById('total-consumo');
    if (!contenedor) return;
    
    contenedor.innerHTML = '';
    total = 0;

    pedido.forEach(item => {
        const subtotal = item.precio * item.cantidad;
        total += subtotal;
        contenedor.innerHTML += '<p>' + item.nombre + ' x' + item.cantidad + ' - S/ ' + subtotal.toFixed(2) + '</p>';
    });

    if (totalElemento) totalElemento.innerText = 'Total: S/ ' + total.toFixed(2);
}

function confirmarPedido() {
    const nombreCliente = document.getElementById('nombre-cliente')?.value;
    if (!nombreCliente) {
        alert('Ingresa tu nombre primero');
        return;
    }
    if (pedido.length === 0) {
        alert('Agrega al menos un producto al pedido');
        return;
    }

    socket.emit('nuevo_pedido', {
        cliente: nombreCliente,
        items: pedido,
        total: total
    });

    if (mesaSeleccionada) {
        socket.emit('nueva_reserva', { cliente: nombreCliente, mesaId: mesaSeleccionada });
    }

    alert('¡Pedido enviado con éxito!');
    pedido = [];
    actualizarResumen();
}