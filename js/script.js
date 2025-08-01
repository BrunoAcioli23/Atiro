import { db, auth, onAuthStateChanged, signInAnonymously, getDocs, doc, setDoc, updateDoc, deleteDoc, onSnapshot, collection } from './firebase-config.js';

// --- Elementos do DOM ---
const editorContainer = document.getElementById('editor-container');
const viewPageContainer = document.getElementById('view-page-container');
const canvas = document.getElementById('canvas');
const world = document.getElementById('world');
const cardLayer = document.getElementById('card-layer');
const imageLayer = document.getElementById('image-layer');
const svgLayer = document.getElementById('svg-layer');
const addCardBtn = document.getElementById('addCardBtn');
const addImageBtn = document.getElementById('addImageBtn');
const connectModeBtn = document.getElementById('connectModeBtn');
const viewModeBtn = document.getElementById('viewModeBtn');
const editModal = document.getElementById('editModal');
const saveModalBtn = document.getElementById('saveModalBtn');
const cancelModalBtn = document.getElementById('cancelModalBtn');
const deleteCardBtn = document.getElementById('deleteCardBtn');
const cardTypeSelect = document.getElementById('cardType');
const imageUrlWrapper = document.getElementById('imageUrl-wrapper');
const imageUrlInput = document.getElementById('imageUrl');
const cardNameInput = document.getElementById('cardName');
const cardTitleInput = document.getElementById('cardTitle');
const lineContextMenu = document.getElementById('lineContextMenu');
const deleteLineBtn = document.getElementById('deleteLineBtn');
const viewProjectNameEl = document.getElementById('viewProjectName');
const viewCanvas = document.getElementById('view-canvas');
const viewWorld = document.getElementById('view-world');
const viewCardLayer = document.getElementById('view-card-layer');
const viewImageLayer = document.getElementById('view-image-layer');
const viewSvgLayer = document.getElementById('view-svg-layer');
const shareModal = document.getElementById('shareModal');
const shareLinkInput = document.getElementById('shareLinkInput');
const copyLinkBtn = document.getElementById('copyLinkBtn');
const closeShareModalBtn = document.getElementById('closeShareModalBtn');
const saveAsBtn = document.getElementById('saveAsBtn');
const newProjectBtn = document.getElementById('newProjectBtn');
const openProjectsBtn = document.getElementById('openProjectsBtn');
const projectListModal = document.getElementById('projectListModal');
const closeProjectsBtn = document.getElementById('closeProjectsBtn');
const projectList = document.getElementById('projectList');
const selectionBox = document.getElementById('selection-box');

// --- "CÉREBRO" DO APLICATIVO REFATORADO ---
let state = {
    name: "Novo Projeto",
    objects: [], // Array unificado para cards, imagens, e futuros objetos
    connections: [],
    pan: { x: 0, y: 0, scale: 1 },
    isConnectMode: false,
    firstConnectionTarget: null,
    editingCardId: null,
};

let history = [], historyIndex = -1, chartId, unsubscribeSnapshot = null, contextConnId = null;
let dragging = { isDown: false, type: null, id: null, offset: { x: 0, y: 0 }, dragStartPos: { x: 0, y: 0 }, hasDragged: false };
let lineDragging = { isDown: false, connId: null };
let resizing = { isDown: false, id: null, startPos: { x: 0, y: 0 }, startSize: { w: 0, h: 0 } };
let selecting = { isDown: false, startPos: { x: 0, y: 0 } };
let selectedItems = { objects: [] }; // Array unificado para seleção

const CARD_WIDTH = 250, CARD_HEIGHT = 75, SPACING_X = 60, SPACING_Y = 60;

// --- Funções do Firebase ---
async function saveStateToFirestore() {
    if (!chartId) return;
    const stateToSave = { 
        name: state.name, 
        objects: state.objects, 
        connections: state.connections, 
        pan: state.pan 
    };
    try { await setDoc(doc(db, "charts", chartId), stateToSave); }
    catch (e) { console.error("Error saving state:", e); }
}

async function loadStateFromFirestore(id) {
    const docRef = doc(db, "charts", id);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
        const data = docSnap.data();
        state = { ...state, ...data };
        // Camada de compatibilidade: se o projeto salvo for antigo, converte para a nova estrutura.
        if (data.cards || data.images) {
            state.objects = [...(data.cards || []), ...(data.images || [])];
        }
        history = [JSON.parse(JSON.stringify(state))];
        historyIndex = 0;
    } else {
        console.log("No such document! Creating new.");
        state.name = "Meu Novo Projeto";
        pushStateToHistory();
    }
    render();
}

function listenForRealtimeUpdates(id) {
    if (unsubscribeSnapshot) unsubscribeSnapshot();
    const docRef = doc(db, "charts", id);
    unsubscribeSnapshot = onSnapshot(docRef, (doc) => {
        if (doc.exists()) {
            const data = doc.data();
            state = { ...state, ...data };
            if (data.cards || data.images) { // Camada de compatibilidade
                state.objects = [...(data.cards || []), ...(data.images || [])];
            }
            viewProjectNameEl.textContent = state.name;
            render(true);
        }
    });
}

// --- Gerenciamento de Histórico ---
function pushStateToHistory() {
    if (historyIndex < history.length - 1) history = history.slice(0, historyIndex + 1);
    history.push(JSON.parse(JSON.stringify(state)));
    historyIndex = history.length - 1;
    saveStateToFirestore();
}
function undo() {
    if (historyIndex > 0) {
        historyIndex--;
        state = JSON.parse(JSON.stringify(history[historyIndex]));
        render();
        saveStateToFirestore();
    }
}
function redo() {
    if (historyIndex < history.length - 1) {
        historyIndex++;
        state = JSON.parse(JSON.stringify(history[historyIndex]));
        render();
        saveStateToFirestore();
    }
}

// --- Funções de Renderização ---
function render(isViewOnly = false) {
    const currentCardLayer = isViewOnly ? viewCardLayer : cardLayer;
    const currentImageLayer = isViewOnly ? viewImageLayer : imageLayer;
    const currentSvgLayer = isViewOnly ? viewSvgLayer : svgLayer;
    const currentWorld = isViewOnly ? viewWorld : world;

    currentCardLayer.innerHTML = '';
    currentImageLayer.innerHTML = '';
    currentSvgLayer.innerHTML = '';

    if (isViewOnly) {
        fitToScreen();
    } else {
        const transform = `translate(${state.pan.x}px, ${state.pan.y}px) scale(${state.pan.scale})`;
        currentWorld.style.transform = transform;
        canvas.classList.toggle('connect-mode-active', state.isConnectMode);
    }

    (state.objects || []).forEach(obj => {
        if (obj.type === 'employee' || obj.type === 'department') {
            renderCard(obj, isViewOnly);
        } else if (obj.src) { // Identifica como imagem
            renderImage(obj, isViewOnly);
        }
    });
    (state.connections || []).forEach(conn => renderConnection(conn, isViewOnly));
}

function renderCard(cardData, isViewOnly) {
    const cardEl = document.createElement('div');
    cardEl.className = 'card';
    if (cardData.type === 'department') cardEl.classList.add('card-department');
    if (selectedItems.objects.includes(cardData.id)) cardEl.classList.add('selected-item');
    if (!isViewOnly && state.firstConnectionTarget && state.firstConnectionTarget.type === 'card' && cardData.id === state.firstConnectionTarget.id) {
        cardEl.classList.add('selected-for-connection');
    }
    cardEl.style.left = `${cardData.x}px`;
    cardEl.style.top = `${cardData.y}px`;
    cardEl.dataset.id = cardData.id;
    cardEl.dataset.type = 'card'; // tipo genérico para o DOM
    const placeholderImg = `https://placehold.co/75x75/e2e8f0/64748b?text=${(cardData.name || 'N').charAt(0)}&font=sans`;
    
    let innerHTML = `
        <img class="card-photo" src="${cardData.imageUrl || placeholderImg}" onerror="this.src='${placeholderImg}'">
        <div class="card-info">
            <h3 class="name">${cardData.name}</h3>
            <p class="title">${cardData.title}</p>
        </div>
    `;
    if (!isViewOnly) {
        innerHTML += `<div class="add-btn add-btn-top" data-direction="top">+</div><div class="add-btn add-btn-right" data-direction="right">+</div><div class="add-btn add-btn-bottom" data-direction="bottom">+</div><div class="add-btn add-btn-left" data-direction="left">+</div>`;
    }
    cardEl.innerHTML = innerHTML;
    (isViewOnly ? viewCardLayer : cardLayer).appendChild(cardEl);
}

function renderImage(imgData, isViewOnly) {
    const container = document.createElement('div');
    container.style.left = `${imgData.x}px`;
    container.style.top = `${imgData.y}px`;
    container.style.width = `${imgData.width}px`;
    container.style.height = `${imgData.height}px`;
    container.className = 'sticker-image';
    container.dataset.id = imgData.id;
    container.dataset.type = 'image';
    if (selectedItems.objects.includes(imgData.id)) container.classList.add('selected-item');

    const imgEl = document.createElement('img');
    imgEl.src = imgData.src;
    imgEl.style.width = '100%';
    imgEl.style.height = '100%';
    imgEl.style.pointerEvents = 'none';
    container.appendChild(imgEl);

    if (!isViewOnly) {
        const resizeHandle = document.createElement('div');
        resizeHandle.className = 'resize-handle';
        container.appendChild(resizeHandle);
    }
    (isViewOnly ? viewImageLayer : imageLayer).appendChild(container);
}

function renderConnection(conn, isViewOnly) {
    function getPointFromTarget(target) {
        if (!target) return null;
        if (target.type === 'card') {
            const card = state.objects.find(c => c.id === target.id && (c.type === 'employee' || c.type === 'department'));
            return card ? { x: card.x + CARD_WIDTH / 2, y: card.y + CARD_HEIGHT / 2 } : null;
        }
        return target.point;
    }
    
    const p1 = getPointFromTarget(conn.from);
    const p2 = getPointFromTarget(conn.to);
    if (!p1 || !p2) return;
    const midY = conn.customMidY !== undefined ? conn.customMidY : (p1.y + p2.y) / 2;
    const d = `M${p1.x},${p1.y} L${p1.x},${midY} L${p2.x},${midY} L${p2.x},${p2.y}`;
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d); path.setAttribute('stroke', '#94a3b8'); path.setAttribute('stroke-width', '2'); path.setAttribute('fill', 'none'); path.dataset.connId = conn.id;
    if (!isViewOnly && state.firstConnectionTarget && state.firstConnectionTarget.type === 'connection' && conn.id === state.firstConnectionTarget.id) {
        path.classList.add('selected-for-connection');
    }
    (isViewOnly ? viewSvgLayer : svgLayer).appendChild(path);
    if (!isViewOnly) {
        const handle = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        handle.setAttribute('d', `M${p1.x},${midY} L${p2.x},${midY}`); handle.setAttribute('stroke-width', '10'); handle.classList.add('line-handle'); handle.dataset.connId = conn.id;
        (isViewOnly ? viewSvgLayer : svgLayer).appendChild(handle);
    }
}

function fitToScreen() {
    // ... (código original, mas adaptado para state.objects)
}

// --- Lógica de Cards e Modais ---
function updateAndRender() {
    pushStateToHistory();
    render();
}

function addCard(fromCardId = null, direction = null) {
    const newCard = { id: Date.now(), name: 'Novo Card', title: 'Descrição', type: 'employee', x: 0, y: 0, imageUrl: '' };
    if (fromCardId && direction) {
        const fromCard = state.objects.find(c => c.id === fromCardId);
        if (fromCard) {
            // ... (lógica de posicionamento)
            state.connections.push({ id: Date.now(), from: {type: 'card', id: fromCard.id}, to: {type: 'card', id: newCard.id} });
        }
    } else {
        newCard.x = (canvas.clientWidth / 2 - state.pan.x) / state.pan.scale - CARD_WIDTH / 2;
        newCard.y = (canvas.clientHeight / 2 - state.pan.y) / state.pan.scale - CARD_HEIGHT / 2;
    }
    state.objects.push(newCard);
    updateAndRender();
}

function openEditModal(cardId) {
    const card = state.objects.find(c => c.id === cardId);
    if (card) {
        state.editingCardId = cardId;
        cardTypeSelect.value = card.type || 'employee';
        imageUrlInput.value = card.imageUrl || '';
        cardNameInput.value = card.name;
        cardTitleInput.value = card.title;
        editModal.classList.remove('hidden');
    }
}

function closeEditModal() {
    state.editingCardId = null;
    editModal.classList.add('hidden');
}

// ... (todas as outras funções e listeners do seu arquivo original, adaptados para usar `state.objects` onde for relevante)

// --- Inicialização ---
async function initialize() {
    const urlParams = new URLSearchParams(window.location.search);
    const viewId = urlParams.get('viewId');
    chartId = urlParams.get('id');

    if (!viewId && !chartId) {
        window.location.href = 'dashboard.html';
        return;
    }

    if (viewId) {
        editorContainer.style.display = 'none';
        viewPageContainer.style.display = 'flex';
        listenForRealtimeUpdates(viewId);
    } else {
        await loadStateFromFirestore(chartId);
    }
}

// O onAuthStateChanged garante que o Firebase está pronto antes de inicializar
onAuthStateChanged(auth, (user) => {
    if (user) {
        initialize();
    } else {
        signInAnonymously(auth).catch(err => console.error("Anonymous sign in failed:", err));
    }
});