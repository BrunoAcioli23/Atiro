// Importa as funções que você precisa dos SDKs USANDO AS URLs COMPLETAS
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-analytics.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, getDocs, doc, setDoc, updateDoc, deleteDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Sua configuração do Firebase
const firebaseConfig = {
  apiKey: "AIzaSyDqt76qq0dJaNC9nMJg9J_UXk_Dqs1suZs",
  authDomain: "azuriba-d26c8.firebaseapp.com",
  projectId: "azuriba-d26c8",
  storageBucket: "azuriba-d26c8.appspot.com",
  messagingSenderId: "293666862117",
  appId: "1:293666862117:web:306619f6f87a32fa7e7bcc",
  measurementId: "G-JGVG4B1WZG"
};

// Inicializa o Firebase
const app = initializeApp(firebaseConfig);

// Inicializa e exporta os serviços principais
export const db = getFirestore(app);
export const auth = getAuth(app);
export const analytics = getAnalytics(app);

// Re-exporta todas as funções que seus outros scripts vão precisar, para que eles só precisem importar deste arquivo
export { 
    signInAnonymously, 
    onAuthStateChanged,
    collection,
    getDocs,
    doc,
    setDoc,
    updateDoc,
    deleteDoc,
    onSnapshot
};