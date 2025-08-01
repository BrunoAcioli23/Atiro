import { db, auth, onAuthStateChanged, signInAnonymously, getDocs, doc, setDoc, updateDoc, deleteDoc, onSnapshot, collection } from './firebase-config.js';

// --- ELEMENTOS DO DOM (ATUALIZADOS PARA A NOVA INTERFACE) ---
const canvas = document.getElementById('canvas');
const world = document.getElementById('world');
const cardLayer = document.getElementById('card-layer');
const imageLayer = document.getElementById('image-layer');
const svgLayer = document.getElementById('svg-layer');
const projectNameEl = document.getElementById('projectName');

// Novos elementos da UI
const toolButtons = document.querySelectorAll('.tool-btn');
const zoomOutBtn = document.getElementById('zoomOutBtn');
const zoomInBtn = document.getElementById('zoomInBtn');
const zoomPercentage = document.getElementById('zoomPercentage');
const fitToScreenBtn = document.getElementById('fitToScreenBtn');

// Modais e outros elementos (mantidos)
const editorContainer = document.getElementById('editor-container');
const viewPageContainer = document.getElementById('view-page-container');
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
const selectionBox = document.getElementById('selection-box');

// --- ESTADO DO APLICATIVO ---
let state = {
    name: "Carregando...",
    objects: [],
    connections: [],
    pan: { x: 0, y: 0, scale: 1 },
    activeTool: 'select',
    editingCardId: null,
};

let history = [], historyIndex = -1, chartId = null;
let dragging = { isDown: false, id: null, offset: { x: 0, y: 0 }, dragStartPos: { x: 0, y: 0 }, hasDragged: false };
let lineDragging = { isDown: false, connId: null };
let resizing = { isDown: false, id: null, startPos: { x: 0, y: 0 }, startSize: { w: 0, h: 0 } };
let selecting = { isDown: false, startPos: { x: 0, y: 0 } };
let selectedItems = { objects: [] };

const CARD_WIDTH = 250, CARD_HEIGHT = 75;

// --- FUNÇÕES DO FIREBASE (sem alterações) ---
async function saveStateToFirestore() {
    if (!chartId) return;
    const stateToSave = { name: state.name, objects: state.objects, connections: state.connections, pan: state.pan };
    try { await setDoc(doc(db, "charts", chartId), stateToSave); }
    catch (e) { console.error("Error saving state:", e); }
}
async function loadStateFromFirestore(id) {
    const docRef = doc(db, "charts", id);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
        const data = docSnap.data();
        state = { ...state, ...data };
        if (data.cards || data.images) {
            state.objects = [...(data.cards || []), ...(data.images || [])];
        }
        history = [JSON.parse(JSON.stringify(state))];
        historyIndex = 0;
    } else {
        state.name = "Meu Novo Projeto";
        pushStateToHistory();
    }
    render();
}

// --- GERENCIAMENTO DE HISTÓRICO (sem alterações) ---
function pushStateToHistory() {
    if (historyIndex < history.length - 1) history = history.slice(0, historyIndex + 1);
    history.push(JSON.parse(JSON.stringify(state)));
    historyIndex = history.length - 1;
    saveStateToFirestore();
}
function updateAndRender() { pushStateToHistory(); render(); }
function undo() { /* ... */ }
function redo() { /* ... */ }

// --- FUNÇÕES DE RENDERIZAÇÃO ---
function render(isViewOnly = false) {
    if (projectNameEl) projectNameEl.textContent = state.name;
    if (zoomPercentage) zoomPercentage.textContent = `${Math.round(state.pan.scale * 100)}%`;

    world.style.transform = `translate(${state.pan.x}px, ${state.pan.y}px) scale(${state.pan.scale})`;
    
    cardLayer.innerHTML = '';
    imageLayer.innerHTML = '';
    svgLayer.innerHTML = '';

    (state.objects || []).forEach(obj => {
        if (obj.type === 'employee' || obj.type === 'department') {
            renderCard(obj);
        } else if (obj.src) {
            renderImage(obj);
        }
    });
    (state.connections || []).forEach(conn => renderConnection(conn));
}
function renderCard(cardData) {
    const cardEl = document.createElement('div');
    cardEl.className = 'card';
    if (cardData.type === 'department') cardEl.classList.add('card-department');
    if (selectedItems.objects.includes(cardData.id)) cardEl.classList.add('selected-item');
    cardEl.style.left = `${cardData.x}px`;
    cardEl.style.top = `${cardData.y}px`;
    cardEl.dataset.id = cardData.id;
    cardEl.dataset.type = 'card';
    const placeholderImg = `https://placehold.co/75x75/e2e8f0/64748b?text=${(cardData.name || 'N').charAt(0)}&font=sans`;
    cardEl.innerHTML = `<img class="card-photo" src="${cardData.imageUrl || placeholderImg}" onerror="this.src='${placeholderImg}'"><div class="card-info"><h3 class="name">${cardData.name}</h3><p class="title">${cardData.title}</p></div>`;
    cardLayer.appendChild(cardEl);
}
function renderImage(imgData) {
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
    const resizeHandle = document.createElement('div');
    resizeHandle.className = 'resize-handle';
    container.appendChild(resizeHandle);
    imageLayer.appendChild(container);
}
function renderConnection(conn) { /* ... (sem alterações) ... */ }
function fitToScreen() { /* ... (sem alterações) ... */ }

// --- LÓGICA DE AÇÕES E FERRAMENTAS ---
function addCard() {
    const newCard = {
        id: Date.now(), type: 'employee', name: 'Novo Card', title: 'Descrição',
        x: (canvas.clientWidth / 2 - state.pan.x) / state.pan.scale - CARD_WIDTH / 2,
        y: (canvas.clientHeight / 2 - state.pan.y) / state.pan.scale - CARD_HEIGHT / 2,
        imageUrl: ''
    };
    state.objects.push(newCard);
    updateAndRender();
}
function addImage() {
    const url = prompt("Insira a URL da imagem:");
    if (url) {
        const img = {
            id: Date.now(), src: url,
            x: (canvas.clientWidth / 2 - state.pan.x) / state.pan.scale - 100,
            y: (canvas.clientHeight / 2 - state.pan.y) / state.pan.scale - 100,
            width: 200, height: 200
        };
        state.objects.push(img);
        updateAndRender();
    }
}
function handleToolSelect(selectedTool) {
    state.activeTool = selectedTool;
    toolButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.tool === selectedTool));
    canvas.classList.toggle('connect-mode-active', selectedTool === 'connection');

    if (selectedTool === 'shape') {
        addCard();
        handleToolSelect('select');
    } else if (selectedTool === 'upload') {
        addImage();
        handleToolSelect('select');
    }
}

// --- EVENT LISTENERS ---
toolButtons.forEach(btn => {
    btn.addEventListener('click', () => handleToolSelect(btn.dataset.tool));
});
zoomInBtn.addEventListener('click', () => { state.pan.scale = Math.min(3, state.pan.scale * 1.1); render(); });
zoomOutBtn.addEventListener('click', () => { state.pan.scale = Math.max(0.2, state.pan.scale * 0.9); render(); });
fitToScreenBtn.addEventListener('click', fitToScreen);

// Listeners de Mouse para Pan, Drag, etc. (lógica completa)
canvas.addEventListener('mousedown', (e) => {
    const clickedItem = e.target.closest('.card, .sticker-image');
    if (clickedItem) {
        dragging.isDown = true;
        dragging.id = parseInt(clickedItem.dataset.id);
        const item = state.objects.find(o => o.id === dragging.id);
        const mouseX = (e.clientX - state.pan.x) / state.pan.scale;
        const mouseY = (e.clientY - state.pan.y) / state.pan.scale;
        dragging.offset.x = mouseX - item.x;
        dragging.offset.y = mouseY - item.y;
    } else {
        dragging.isDown = true; // Para o Pan
        dragging.id = null;
        canvas.style.cursor = 'grabbing';
        dragging.dragStartPos = { x: e.clientX, y: e.clientY };
        dragging.startPan = { ...state.pan };
    }
});
window.addEventListener('mousemove', (e) => {
    if (!dragging.isDown) return;
    const mouseX = (e.clientX - state.pan.x) / state.pan.scale;
    const mouseY = (e.clientY - state.pan.y) / state.pan.scale;
    if (dragging.id !== null) {
        const item = state.objects.find(o => o.id === dragging.id);
        if (item) {
            item.x = mouseX - dragging.offset.x;
            item.y = mouseY - dragging.offset.y;
            render();
        }
    } else { // Pan
        state.pan.x = dragging.startPan.x + e.clientX - dragging.dragStartPos.x;
        state.pan.y = dragging.startPan.y + e.clientY - dragging.dragStartPos.y;
        render();
    }
});
window.addEventListener('mouseup', () => {
    if (dragging.id !== null) {
        updateAndRender(); // Salva no histórico apenas no final do arraste
    }
    dragging.isDown = false;
    canvas.style.cursor = 'grab';
});
canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const scaleAmount = e.deltaY > 0 ? 0.9 : 1.1;
    const oldScale = state.pan.scale;
    state.pan.scale = Math.max(0.2, Math.min(state.pan.scale * scaleAmount, 3));
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    state.pan.x = mouseX - (mouseX - state.pan.x) * (state.pan.scale / oldScale);
    state.pan.y = mouseY - (mouseY - state.pan.y) * (state.pan.scale / oldScale);
    render();
});
document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'z') undo();
    if (e.ctrlKey && e.key === 'y') redo();
});

// --- INICIALIZAÇÃO ---
async function initialize() {
    const urlParams = new URLSearchParams(window.location.search);
    chartId = urlParams.get('id');
    if (!chartId) {
        window.location.href = 'dashboard.html';
        return;
    }
    await loadStateFromFirestore(chartId);
}
onAuthStateChanged(auth, (user) => {
    if (user) {
        initialize();
    } else {
        signInAnonymously(auth).catch(err => console.error("Anonymous sign in failed:", err));
    }
});