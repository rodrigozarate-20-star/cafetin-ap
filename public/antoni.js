// Cargar las mesas al iniciar la página
document.addEventListener("DOMContentLoaded", () => {
    cargarMesas();
});

// Función para obtener y mostrar las mesas
function cargarMesas() {
    fetch('/api/mesas')
        .then(res => res.json())
        .then(mesas => {
            const container = document.getElementById('mesas-container');
            if (!container) return;
            
            container.innerHTML = ''; // Limpiar contenedor

            mesas.forEach(mesa => {
                const div = document.createElement('div');
                div.className = `mesa ${mesa.estado}`;
                
                // Generar contenido dinámico con el botón e 이벤트 onclick explícito
                div.innerHTML = `
                    <span>Mesa ${mesa.id} - ${mesa.estado === 'libre' ? 'Libre' : 'Reservada'}</span>
                    ${mesa.estado === 'reservada' 
                        ? `<button class="btn-liberar" onclick="liberarMesa(${mesa.id})">Liberar</button>` 
                        : ''}
                `;
                container.appendChild(div);
            });
        })
        .catch(err => console.error("Error al cargar mesas:", err));
}

// Función global para liberar la mesa al hacer clic
window.liberarMesa = function(idMesa) {
    console.log("Liberando la mesa número:", idMesa);

    fetch(`/api/mesas/${idMesa}`, {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ estado: 'libre' })
    })
    .then(res => res.json())
    .then(data => {
        console.log("Respuesta del servidor:", data);
        cargarMesas(); // Vuelve a renderizar la lista de mesas para reflejar el cambio
    })
    .catch(err => console.error("Error al intentar liberar la mesa:", err));
};
mostrarNotificacionLiberacion(idMesa)

// Aporte adicional: Función de notificación al liberar mesa
window.mostrarNotificacionLiberacion = function(idMesa) {
    const mensaje = document.createElement('div');
    mensaje.innerText = ✅¡Mesa ${idMesa} liberada correctamente!;
    mensaje.style.position = 'fixed';
    mensaje.style.top = '20px';
    mensaje.style.right = '20px';
    mensaje.style.backgroundColor = '#28a745';
    mensaje.style.color = '#fff';
    mensaje.style.padding = '12px 20px';
    mensaje.style.borderRadius = '8px';
    mensaje.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)';
    mensaje.style.zIndex = '1000';
    mensaje.style.fontFamily = 'sans-serif';

    document.body.appendChild(mensaje);

    setTimeout(() => {
        mensaje.remove();
    }, 3000);
};