# Cafetín en Firebase

Versión de tu sistema que corre 100 % en Firebase (plan gratuito Spark):

- **Hosting**: sirve la web (`public/`).
- **Firestore**: reemplaza SQLite y Socket.IO. Todo se actualiza en vivo.
- **Authentication**: protege el panel del dueño con correo y contraseña.

Rutas: `/` (clientes) y `/admin` (dueño).

## Subirlo a Firebase, paso a paso

### 1. Crear el proyecto
1. Entra a https://console.firebase.google.com → **Agregar proyecto** (puedes desactivar Google Analytics).
2. **Compilación → Firestore Database → Crear base de datos** → modo **producción** → región `southamerica-east1` (São Paulo, la más cercana a Lima).
3. **Compilación → Authentication → Comenzar → Correo electrónico/contraseña → Habilitar**.

### 2. Conectar la web con tu proyecto
1. **Configuración del proyecto (engranaje) → Tus apps → icono Web `</>`** → registra la app (no marques Hosting todavía).
2. Copia el objeto `firebaseConfig` y pégalo en `public/js/firebase.js`.
3. En `.firebaserc` cambia `TU-PROJECT-ID` por el ID de tu proyecto.

### 3. Instalar la herramienta y publicar
Necesitas Node.js 18 o superior.

```bash
npm install -g firebase-tools
firebase login
firebase init hosting   # solo si te lo pide; si ya existe firebase.json, omítelo
firebase deploy
```

`firebase deploy` sube la web **y** las reglas de seguridad (`firestore.rules`). Al terminar te muestra la URL: `https://TU-PROJECT-ID.web.app`.

> Si `firebase init` pregunta, responde: carpeta pública `public`, SPA **No**, y **no sobrescribas** `index.html`.

### 4. Crear al dueño (una sola vez)
1. **Authentication → Usuarios → Agregar usuario**: correo y contraseña. Copia su **UID**.
2. **Firestore Database → Iniciar colección** → ID `admins` → ID del documento = **el UID** → agrega un campo cualquiera (ej. `rol` = `dueno`) → Guardar.

### 5. Primer uso
1. Abre `https://TU-PROJECT-ID.web.app/admin` e inicia sesión.
2. Pulsa **Cargar datos de ejemplo** (crea 6 mesas, 3 productos y el contador de pedidos).
3. Abre `/` en otro dispositivo, haz un pedido y míralo aparecer en el panel al instante.

## Probar en tu PC
Los módulos ES no funcionan abriendo el archivo con doble clic. Usa:

```bash
firebase serve --only hosting     # o: npx http-server public
```

## Qué cambió respecto a tu proyecto
| Antes | Ahora |
|---|---|
| Node + Express | Hosting estático (sin servidor que mantener) |
| SQLite (`cafetin.db`) | Firestore (`mesas`, `productos`, `pedidos`, `meta/contador`) |
| Socket.IO | `onSnapshot` de Firestore |
| Panel `/admin.html` sin protección | `/admin` con login y reglas de seguridad |
| Stock con riesgo de pedidos simultáneos | Transacción: stock, mesa y número de pedido se validan juntos |

Novedades: seguimiento del pedido para el cliente, tablero de pedidos por estado, devolución de stock al cancelar, alta/baja de productos y mesas desde el panel.

Los datos de `cafetin.db` no se migran; eran los de ejemplo y se recrean con el botón del paso 5.

## Límite a tener en cuenta
Sin servidor propio, el total del pedido lo calcula el navegador y las reglas no pueden verificarlo contra los precios. Para un cafetín real es suficiente; si más adelante necesitas blindarlo, se mueve el cálculo a una Cloud Function (requiere plan Blaze).

## Despliegue automático con GitHub Actions (sin Azure)
Cada `git push` a `main` valida el código y publica en Firebase (`.github/workflows/deploy.yml`).

1. Sube la carpeta a un repositorio de GitHub (rama `main`).
2. En Google Cloud Console → IAM → Cuentas de servicio, crea una cuenta con los roles **Firebase Hosting Admin**, **Firebase Rules Admin** y **Service Usage Consumer**. Crea una clave JSON.
3. En GitHub → Settings → Secrets and variables → Actions:
   - Secret `FIREBASE_SERVICE_ACCOUNT`: pega el contenido completo del JSON.
   - Variable `FIREBASE_PROJECT_ID`: el ID de tu proyecto.
4. Haz un cambio y súbelo: en la pestaña **Actions** verás validar → desplegar.
