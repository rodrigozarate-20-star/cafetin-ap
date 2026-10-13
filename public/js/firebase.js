// Pega aquí la configuración de tu app web:
// Consola Firebase → Configuración del proyecto → Tus apps → Web (</>) → "Config"
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyBVGoNAbRaoLK5OMXsbGRxLXEuO0N3xP64",
  authDomain: "cafetin-2.firebaseapp.com",
  projectId: "cafetin-2",
  storageBucket: "cafetin-2.firebasestorage.app",
  messagingSenderId: "422251184408",
  appId: "1:422251184408:web:49bfeaf301713a40c95e6d"
};
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
