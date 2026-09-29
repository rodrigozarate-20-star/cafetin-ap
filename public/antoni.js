// Cargar las mesas al iniciar la página
document.addEventListener("DOMContentLoaded", () => {
    cargarMesas();
});

// Función para obtener y mostrar las mesas
function cargarMesas() {
    fetch("/api/mesas")
        .then(res => {
            if (!res.ok) {
                throw new Error("Error al obtener las mesas");
            }
            return res.json();
        })
        .then(mesas => {
            const container = document.getElementById("mesas-container");

            if (!container) return;

            container.innerHTML = "";

            mesas.forEach(mesa => {
                const div = document.createElement("div");
                div.className = `mesa ${mesa.estado}`;

                div.innerHTML = `
                    <span>
                        Mesa ${mesa.id} - 
                        ${mesa.estado === "libre" ? "Libre" : "Reservada"}
                    </span>

                    ${
                        mesa.estado === "reservada"
                            ? `<button 
                                class="btn-liberar" 
                                onclick="liberarMesa(${mesa.id})">
                                Liberar
                              </button>`
                            : ""
                    }
                `;

                container.appendChild(div);
            });
        })
        .catch(err => {
            console.error("Error al cargar mesas:", err);
        });
}

// Función para liberar una mesa
window.liberarMesa = function (idMesa) {
    console.log("Liberando la mesa número:", idMesa);

    fetch(`/api/mesas/${idMesa}`, {
        method: "PATCH",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            estado: "libre"
        })
    })
        .then(res => {
            if (!res.ok) {
                throw new Error("No se pudo liberar la mesa");
            }

            return res.json();
        })
        .then(data => {
            console.log("Respuesta del servidor:", data);

            // Mostrar notificación DESPUÉS de liberar correctamente
            mostrarNotificacionLiberacion(idMesa);

            // Actualizar las mesas
            cargarMesas();
        })
        .catch(err => {
            console.error(
                "Error al intentar liberar la mesa:",
                err
            );
        });
};

// Notificación al liberar una mesa
window.mostrarNotificacionLiberacion = function (idMesa) {
    const mensaje = document.createElement("div");

    mensaje.innerText = `¡Mesa ${idMesa} liberada correctamente!`;

    mensaje.style.position = "fixed";
    mensaje.style.top = "20px";
    mensaje.style.right = "20px";
    mensaje.style.backgroundColor = "#28a745";
    mensaje.style.color = "#fff";
    mensaje.style.padding = "12px 20px";
    mensaje.style.borderRadius = "8px";
    mensaje.style.boxShadow = "0 4px 6px rgba(0,0,0,0.1)";
    mensaje.style.zIndex = "1000";
    mensaje.style.fontFamily = "sans-serif";

    document.body.appendChild(mensaje);

    setTimeout(() => {
        mensaje.remove();
    }, 3000);
};