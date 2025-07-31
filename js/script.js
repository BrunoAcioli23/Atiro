import { db, auth, onAuthStateChanged, signInAnonymously, collection, getDocs, doc, setDoc } from './firebase-config.js';

        // DOM Elements
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
        
        // App State
        let state = {
            cards: [],
            connections: [],
            images: [],
            pan: { x: 0, y: 0, scale: 1 },
            name: "Novo Projeto",
            isConnectMode: false,
            firstConnectionTarget: null,
            editingCardId: null,
        };
        let history = [], historyIndex = -1, db, auth, currentUserId, chartId, unsubscribeSnapshot = null, contextConnId = null;
        let dragging = { isDown: false, type: null, id: null, offset: { x: 0, y: 0 }, dragStartPos: { x: 0, y: 0 }, axisLock: null, hasDragged: false };
        let lineDragging = { isDown: false, connId: null };
        let resizing = { isDown: false, id: null, startPos: {x:0, y:0}, startSize: {w:0, h:0} };
        let selecting = { isDown: false, startPos: {x:0, y:0} };
        let selectedItems = { cards: [], images: [] };
        
        const CARD_WIDTH = 250, CARD_HEIGHT = 75, SPACING_X = 60, SPACING_Y = 60;

        // --- Firebase Functions ---
        async function initializeFirebase() {
            const firebaseConfig = { apiKey: "AIzaSyAqKldfFxYGgL-9cqUgIxReQlNkqjiJhfU", authDomain: "construtor-fc3c1.firebaseapp.com", projectId: "construtor-fc3c1", storageBucket: "construtor-fc3c1.appspot.com", messagingSenderId: "318667364700", appId: "1:318667364700:web:e6be714c386ab6e7bb0999" };
            const app = initializeApp(firebaseConfig);
            db = getFirestore(app);
            auth = getAuth(app);
            return new Promise(resolve => onAuthStateChanged(auth, user => {
                if (user) { currentUserId = user.uid; resolve(user); }
                else { signInAnonymously(auth).then(cred => { currentUserId = cred.user.uid; resolve(cred.user); }); }
            }));
        }
        
        async function saveStateToFirestore() {
            if (!db || !chartId) return;
            const stateToSave = { name: state.name, cards: state.cards, connections: state.connections, images: state.images, pan: state.pan };
            try { await setDoc(doc(db, "charts", chartId), stateToSave); }
            catch (e) { console.error("Error saving state:", e); }
        }
        
        async function loadStateFromFirestore(id) {
            if (!db) return;
            const docRef = doc(db, "charts", id);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                const data = docSnap.data();
                state = { ...state, ...data };
                state.images = state.images || []; // Ensure images array exists
                history = [JSON.parse(JSON.stringify(state))];
                historyIndex = 0;
            } else {
                state.name = "Meu Novo Projeto";
                pushStateToHistory();
            }
            // Project name is not displayed in the header in the provided HTML, but if it were:
            // const projectNameEl = document.getElementById('projectName');
            // if(projectNameEl) projectNameEl.textContent = state.name;
            render();
        }
        
        function listenForRealtimeUpdates(id) {
            if (unsubscribeSnapshot) unsubscribeSnapshot();
            const docRef = doc(db, "charts", id);
            unsubscribeSnapshot = onSnapshot(docRef, (doc) => {
                if (doc.exists()) {
                    const data = doc.data();
                    state = { ...state, ...data };
                    state.images = state.images || [];
                    viewProjectNameEl.textContent = state.name;
                    render(true);
                }
            });
        }

        // --- History Management ---
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

        // --- Rendering Functions ---
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

            (state.images || []).forEach(imgData => renderImage(imgData, isViewOnly));
            (state.cards || []).forEach(cardData => renderCard(cardData, isViewOnly));
            (state.connections || []).forEach(conn => renderConnection(conn, isViewOnly));
        }

        function renderCard(cardData, isViewOnly) {
            const cardEl = document.createElement('div');
            cardEl.className = 'card';
            if (cardData.type === 'department') cardEl.classList.add('card-department');
            if (selectedItems.cards.includes(cardData.id)) cardEl.classList.add('selected-item');
            if (!isViewOnly && state.firstConnectionTarget && state.firstConnectionTarget.type === 'card' && cardData.id === state.firstConnectionTarget.id) {
                cardEl.classList.add('selected-for-connection');
            }
            cardEl.style.left = `${cardData.x}px`;
            cardEl.style.top = `${cardData.y}px`;
            cardEl.dataset.id = cardData.id;
            cardEl.dataset.type = 'card';
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
            if (selectedItems.images.includes(imgData.id)) container.classList.add('selected-item');

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

        function getPointFromTarget(target) {
            if (!target) return null;
            if (target.type === 'card') {
                const card = state.cards.find(c => c.id === target.id);
                return card ? { x: card.x + CARD_WIDTH / 2, y: card.y + CARD_HEIGHT / 2 } : null;
            }
            return target.point;
        }

        function fitToScreen() {
            const currentCanvas = viewCanvas;
            const currentWorld = viewWorld;
            if (state.cards.length === 0 && state.images.length === 0) { currentWorld.style.transform = ''; return; };
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            state.cards.forEach(item => {
                minX = Math.min(minX, item.x); minY = Math.min(minY, item.y);
                maxX = Math.max(maxX, item.x + CARD_WIDTH); maxY = Math.max(maxY, item.y + CARD_HEIGHT);
            });
            state.images.forEach(item => {
                minX = Math.min(minX, item.x); minY = Math.min(minY, item.y);
                maxX = Math.max(maxX, item.x + item.width); maxY = Math.max(maxY, item.y + item.height);
            });
            const chartWidth = maxX - minX; const chartHeight = maxY - minY;
            const scale = Math.min(currentCanvas.clientWidth / chartWidth, currentCanvas.clientHeight / chartHeight) * 0.9;
            const newWidth = chartWidth * scale; const newHeight = chartHeight * scale;
            const offsetX = (currentCanvas.clientWidth - newWidth) / 2 - (minX * scale);
            const offsetY = (currentCanvas.clientHeight - newHeight) / 2 - (minY * scale);
            currentWorld.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
        }

        // --- Card & Modal Logic ---
        function updateAndRender() {
            pushStateToHistory();
            render();
        }

        function addCard(fromCardId = null, direction = null) {
            const newCard = { id: Date.now(), name: 'Novo Card', title: 'Descrição', type: 'employee', x: 0, y: 0, imageUrl: '' };
            if (fromCardId && direction) {
                const fromCard = state.cards.find(c => c.id === fromCardId);
                if (fromCard) {
                    switch (direction) {
                        case 'top': newCard.x = fromCard.x; newCard.y = fromCard.y - CARD_HEIGHT - SPACING_Y; break;
                        case 'right': newCard.x = fromCard.x + CARD_WIDTH + SPACING_X; newCard.y = fromCard.y; break;
                        case 'bottom': newCard.x = fromCard.x; newCard.y = fromCard.y + CARD_HEIGHT + SPACING_Y; break;
                        case 'left': newCard.x = fromCard.x - CARD_WIDTH - SPACING_X; newCard.y = fromCard.y; break;
                    }
                    state.connections.push({ id: Date.now(), from: {type: 'card', id: fromCard.id}, to: {type: 'card', id: newCard.id} });
                }
            } else {
                newCard.x = (canvas.clientWidth / 2 - state.pan.x) / state.pan.scale - CARD_WIDTH / 2;
                newCard.y = (canvas.clientHeight / 2 - state.pan.y) / state.pan.scale - CARD_HEIGHT / 2;
            }
            state.cards.push(newCard);
            updateAndRender();
        }

        function openEditModal(cardId) {
            const card = state.cards.find(c => c.id === cardId);
            if (card) {
                state.editingCardId = cardId;
                cardTypeSelect.value = card.type || 'employee';
                imageUrlInput.value = card.imageUrl || '';
                cardNameInput.value = card.name;
                cardTitleInput.value = card.title;
                toggleImageType();
                editModal.classList.remove('hidden');
            }
        }

        function closeEditModal() {
            state.editingCardId = null;
            editModal.classList.add('hidden');
        }

        function toggleImageType() {
            imageUrlWrapper.style.display = cardTypeSelect.value === 'employee' ? 'block' : 'none';
        }
        
        function deleteConnection(connId) {
            state.connections = state.connections.filter(conn => conn.id !== connId);
            updateAndRender();
        }

        // --- Event Listeners ---
        addCardBtn.addEventListener('click', () => addCard());
        addImageBtn.addEventListener('click', () => {
            const url = prompt("Insira a URL da imagem:");
            if (url) {
                const img = { id: Date.now(), src: url, x: (canvas.clientWidth / 2 - state.pan.x) / state.pan.scale - 100, y: (canvas.clientHeight / 2 - state.pan.y) / state.pan.scale - 100, width: 200, height: 200 };
                state.images.push(img);
                updateAndRender();
            }
        });
        connectModeBtn.addEventListener('click', () => {
            state.isConnectMode = !state.isConnectMode;
            state.firstConnectionTarget = null;
            connectModeBtn.classList.toggle('active', state.isConnectMode);
            render();
        });
        saveModalBtn.addEventListener('click', () => {
            if (state.editingCardId) {
                const card = state.cards.find(c => c.id === state.editingCardId);
                if (card) {
                    card.type = cardTypeSelect.value;
                    card.imageUrl = imageUrlInput.value;
                    card.name = cardNameInput.value;
                    card.title = cardTitleInput.value;
                    updateAndRender();
                }
            }
            closeEditModal();
        });
        deleteCardBtn.addEventListener('click', () => {
            if (state.editingCardId && confirm('Tem certeza que deseja excluir este card?')) {
                state.connections = state.connections.filter(conn => conn.from.id !== state.editingCardId && conn.to.id !== state.editingCardId);
                state.cards = state.cards.filter(c => c.id !== state.editingCardId);
                updateAndRender();
            }
            closeEditModal();
        });
        cancelModalBtn.addEventListener('click', closeEditModal);
        cardTypeSelect.addEventListener('change', toggleImageType);

        saveAsBtn.addEventListener('click', () => {
            const newName = prompt("Digite o nome para a cópia do projeto:", (state.name || "") + " - Cópia");
            if (!newName) return;
            const newChartId = doc(collection(db, "charts")).id;
            const newState = { ...JSON.parse(JSON.stringify(state)), name: newName };
            setDoc(doc(db, "charts", newChartId), newState).then(() => {
                alert(`Projeto copiado como "${newName}"!`);
                window.location.href = `${window.location.origin}${window.location.pathname}?id=${newChartId}`;
            }).catch(e => console.error("Erro ao salvar como:", e));
        });

        newProjectBtn.addEventListener('click', () => {
            const newName = prompt("Digite o nome para o novo projeto:", "Novo Projeto Sem Título");
            if (!newName) return;
            const newChartId = doc(collection(db, "charts")).id;
            const newState = { name: newName, cards: [], connections: [], images: [], pan: { x: 0, y: 0, scale: 1 } };
            setDoc(doc(db, "charts", newChartId), newState).then(() => {
                window.location.href = `${window.location.origin}${window.location.pathname}?id=${newChartId}`;
            }).catch(e => console.error("Erro ao criar novo projeto:", e));
        });
        
        viewModeBtn.addEventListener('click', () => {
            if(!chartId) {
                alert("Salve o projeto primeiro para poder compartilhar.");
                return;
            }
            window.open(`${window.location.origin}${window.location.pathname}?viewId=${chartId}`, '_blank');
        });
        
        closeShareModalBtn.addEventListener('click', () => shareModal.classList.add('hidden'));
        copyLinkBtn.addEventListener('click', () => {
            shareLinkInput.select();
            document.execCommand('copy');
            copyLinkBtn.textContent = 'Copiado!';
            setTimeout(() => { copyLinkBtn.textContent = 'Copiar'; }, 2000);
        });

        async function openProjectList() {
            projectListModal.classList.remove('hidden');
            projectList.innerHTML = `<li class="loading-text">Carregando...</li>`;
            try {
                const querySnapshot = await getDocs(collection(db, "charts"));
                projectList.innerHTML = '';
                if (querySnapshot.empty) {
                    projectList.innerHTML = `<li class="loading-text">Nenhum projeto encontrado.</li>`; return;
                }
                querySnapshot.forEach((docSnapshot) => {
                    const data = docSnapshot.data();
                    const listItem = document.createElement('li');
                    
                    const link = document.createElement('a');
                    link.href = `?id=${docSnapshot.id}`;
                    link.textContent = data.name || "Projeto Sem Nome";
                    if (docSnapshot.id === chartId) link.classList.add('active-project');
                    
                    const controlsDiv = document.createElement('div');
                    controlsDiv.className = 'controls';

                    const renameButton = document.createElement('button');
                    renameButton.textContent = 'Renomear';
                    renameButton.className = "list-btn rename-btn";
                    renameButton.onclick = async (e) => {
                        e.preventDefault();
                        const newName = prompt("Digite o novo nome:", data.name);
                        if (newName && newName !== data.name) {
                            await updateDoc(doc(db, "charts", docSnapshot.id), { name: newName });
                            openProjectList(); // Refresh list
                            if (docSnapshot.id === chartId) {
                                // Update current project name if it's the one being edited
                                state.name = newName;
                            }
                        }
                    };
                    const deleteButton = document.createElement('button');
                    deleteButton.textContent = 'Deletar';
                    deleteButton.className = "list-btn delete-btn";
                    deleteButton.onclick = async (e) => {
                        e.preventDefault();
                        if (confirm(`Deletar "${data.name}"?`)) {
                            await deleteDoc(doc(db, "charts", docSnapshot.id));
                            if (docSnapshot.id === chartId) window.location.href = window.location.origin + window.location.pathname;
                            else openProjectList(); // Refresh list
                        }
                    };
                    controlsDiv.appendChild(renameButton);
                    controlsDiv.appendChild(deleteButton);
                    listItem.appendChild(link);
                    listItem.appendChild(controlsDiv);
                    projectList.appendChild(listItem);
                });
            } catch (e) {
                console.error("Erro ao buscar projetos:", e);
                projectList.innerHTML = `<li class="error-text">Erro ao carregar.</li>`;
            }
        }
        
        openProjectsBtn.addEventListener('click', openProjectList);
        closeProjectsBtn.addEventListener('click', () => projectListModal.classList.add('hidden'));

        let isPanning = false, startPos = { x: 0, y: 0 }, startPan = { x: 0, y: 0 };
        canvas.addEventListener('mousedown', (e) => {
            const clickedItem = e.target.closest('.card, .sticker-image');
            const lineHandleEl = e.target.closest('.line-handle');
            const resizeHandleEl = e.target.closest('.resize-handle');

            if (resizeHandleEl) {
                resizing.isDown = true;
                resizing.id = parseInt(resizeHandleEl.parentElement.dataset.id);
                const image = state.images.find(img => img.id === resizing.id);
                resizing.startPos = { x: e.clientX, y: e.clientY };
                resizing.startSize = { w: image.width, h: image.height };
                return;
            }
            
            if (lineHandleEl && !state.isConnectMode) {
                lineDragging.isDown = true;
                lineDragging.connId = parseInt(lineHandleEl.dataset.connId);
            } else if (clickedItem && !state.isConnectMode) {
                dragging.isDown = true;
                dragging.hasDragged = false;
                dragging.type = clickedItem.dataset.type;
                dragging.id = parseInt(clickedItem.dataset.id);
                clickedItem.classList.add('dragging');
                dragging.dragStartPos = { x: e.clientX, y: e.clientY };
                dragging.axisLock = null;
                const mouseX = (e.clientX - state.pan.x) / state.pan.scale;
                const mouseY = (e.clientY - state.pan.y) / state.pan.scale;
                
                if (selectedItems.cards.length > 0 || selectedItems.images.length > 0) {
                    const isSelected = dragging.type === 'card' ? selectedItems.cards.includes(dragging.id) : selectedItems.images.includes(dragging.id);
                    if (!isSelected) {
                        selectedItems = { cards: [], images: [] };
                        render();
                    }
                }

                const item = dragging.type === 'card' ? state.cards.find(c => c.id === dragging.id) : state.images.find(i => i.id === dragging.id);
                dragging.offset.x = mouseX - item.x;
                dragging.offset.y = mouseY - item.y;
            } else if (e.target === canvas) {
                if (e.ctrlKey) {
                    selecting.isDown = true;
                    selecting.startPos = { x: e.clientX, y: e.clientY };
                    selectionBox.style.left = `${e.clientX}px`;
                    selectionBox.style.top = `${e.clientY}px`;
                    selectionBox.style.width = '0px';
                    selectionBox.style.height = '0px';
                    selectionBox.classList.remove('hidden');
                } else {
                    isPanning = true;
                    canvas.style.cursor = 'grabbing';
                    startPos = { x: e.clientX, y: e.clientY };
                    startPan = { ...state.pan };
                }
            }
        });

        window.addEventListener('mousemove', (e) => {
            if (resizing.isDown) {
                const image = state.images.find(img => img.id === resizing.id);
                if (image) {
                    const dx = (e.clientX - resizing.startPos.x) / state.pan.scale;
                    const dy = (e.clientY - resizing.startPos.y) / state.pan.scale;
                    image.width = Math.max(50, resizing.startSize.w + dx);
                    image.height = Math.max(50, resizing.startSize.h + dy);
                    render();
                }
            }
            else if (lineDragging.isDown) {
                const conn = state.connections.find(c => c.id === lineDragging.connId);
                if (conn) { conn.customMidY = (e.clientY - state.pan.y) / state.pan.scale; render(); }
            } else if (dragging.isDown) {
                dragging.hasDragged = true;
                const dx = (e.clientX - dragging.dragStartPos.x) / state.pan.scale;
                const dy = (e.clientY - dragging.dragStartPos.y) / state.pan.scale;

                if (selectedItems.cards.length > 0 || selectedItems.images.length > 0) {
                    selectedItems.cards.forEach(id => {
                        const card = state.cards.find(c => c.id === id);
                        const originalPos = history[historyIndex].cards.find(c => c.id === id);
                        if(card && originalPos) { card.x = originalPos.x + dx; card.y = originalPos.y + dy; }
                    });
                    selectedItems.images.forEach(id => {
                        const img = state.images.find(i => i.id === id);
                        const originalPos = history[historyIndex].images.find(i => i.id === id);
                        if(img && originalPos) { img.x = originalPos.x + dx; img.y = originalPos.y + dy; }
                    });

                } else {
                    const item = dragging.type === 'card' ? state.cards.find(c => c.id === dragging.id) : state.images.find(i => i.id === dragging.id);
                    if (item) {
                        let newX = (e.clientX - state.pan.x) / state.pan.scale - dragging.offset.x;
                        let newY = (e.clientY - state.pan.y) / state.pan.scale - dragging.offset.y;
                        if (e.shiftKey) {
                            if (!dragging.axisLock) {
                                const dx_abs = Math.abs(e.clientX - dragging.dragStartPos.x);
                                const dy_abs = Math.abs(e.clientY - dragging.dragStartPos.y);
                                if (dx_abs > 5 || dy_abs > 5) {
                                    dragging.axisLock = (dx_abs > dy_abs) ? 'Y' : 'X';
                                }
                            }
                            if (dragging.axisLock === 'Y') newY = item.y;
                            if (dragging.axisLock === 'X') newX = item.x;
                        } else {
                            dragging.axisLock = null;
                        }
                        item.x = newX;
                        item.y = newY;
                    }
                }
                render();

            } else if (isPanning) {
                state.pan.x = startPan.x + e.clientX - startPos.x;
                state.pan.y = startPan.y + e.clientY - startPos.y;
                render();
            } else if (selecting.isDown) {
                const x1 = Math.min(selecting.startPos.x, e.clientX);
                const y1 = Math.min(selecting.startPos.y, e.clientY);
                const x2 = Math.max(selecting.startPos.x, e.clientX);
                const y2 = Math.max(selecting.startPos.y, e.clientY);
                selectionBox.style.left = `${x1}px`;
                selectionBox.style.top = `${y1}px`;
                selectionBox.style.width = `${x2 - x1}px`;
                selectionBox.style.height = `${y2 - y1}px`;
            }
        });

        window.addEventListener('mouseup', (e) => {
            if (resizing.isDown) {
                resizing.isDown = false;
                updateAndRender();
            }
            const wasDragged = dragging.hasDragged;
            if (dragging.isDown) {
                document.querySelector(`[data-id='${dragging.id}']`)?.classList.remove('dragging');
                if (wasDragged) updateAndRender();
                dragging.isDown = false;
            }
            if (lineDragging.isDown) {
                lineDragging.isDown = false; updateAndRender();
            }
            if (isPanning) {
                isPanning = false; canvas.style.cursor = 'grab'; saveStateToFirestore();
            }
            if (selecting.isDown) {
                selecting.isDown = false;
                selectionBox.classList.add('hidden');
                
                const rect = selectionBox.getBoundingClientRect();
                const worldX1 = (rect.left - state.pan.x) / state.pan.scale;
                const worldY1 = (rect.top - state.pan.y) / state.pan.scale;
                const worldX2 = (rect.right - state.pan.x) / state.pan.scale;
                const worldY2 = (rect.bottom - state.pan.y) / state.pan.scale;

                if (!e.shiftKey) selectedItems = { cards: [], images: [] };
                
                state.cards.forEach(card => {
                    if (card.x < worldX2 && card.x + CARD_WIDTH > worldX1 && card.y < worldY2 && card.y + CARD_HEIGHT > worldY1) {
                        if (!selectedItems.cards.includes(card.id)) selectedItems.cards.push(card.id);
                    }
                });
                state.images.forEach(img => {
                    if (img.x < worldX2 && img.x + img.width > worldX1 && img.y < worldY2 && img.y + img.height > worldY1) {
                        if (!selectedItems.images.includes(img.id)) selectedItems.images.push(img.id);
                    }
                });
                render();
            }
            if (!wasDragged && !selecting.isDown) {
                const clickedOnObject = e.target.closest('.card, .sticker-image');
                if (!clickedOnObject) {
                    selectedItems = { cards: [], images: [] };
                    render();
                }
                handleCanvasClick(e);
            }
        });

        canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            const scaleAmount = 0.1;
            const oldScale = state.pan.scale;
            state.pan.scale *= (e.deltaY > 0 ? (1 - scaleAmount) : (1 + scaleAmount));
            state.pan.scale = Math.max(0.1, Math.min(state.pan.scale, 3));
            const rect = canvas.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            state.pan.x = mouseX - (mouseX - state.pan.x) * (state.pan.scale / oldScale);
            state.pan.y = mouseY - (mouseY - state.pan.y) * (state.pan.scale / oldScale);
            render();
        });

        function handleCanvasClick(e) {
            const cardEl = e.target.closest('.card');
            const pathEl = e.target.closest('path');

            if (state.isConnectMode) {
                if (cardEl) {
                    handleConnectionClick({ type: 'card', id: parseInt(cardEl.dataset.id) });
                } else if (pathEl) {
                    const worldPoint = { x: (e.clientX - state.pan.x) / state.pan.scale, y: (e.clientY - state.pan.y) / state.pan.scale };
                    handleConnectionClick({ type: 'connection', id: parseInt(pathEl.dataset.connId), point: worldPoint });
                }
                return;
            }
            
            if (e.target.classList.contains('add-btn')) {
                addCard(parseInt(cardEl.dataset.id), e.target.dataset.direction);
            } else if (cardEl && e.detail === 2) {
                openEditModal(parseInt(cardEl.dataset.id));
            }
        }
        
        function handleConnectionClick(target) {
            if (target.type === 'connection') {
                const conn = state.connections.find(c => c.id === target.id);
                if (conn && conn.from && conn.to) {
                    const p1 = getPointFromTarget(conn.from);
                    const p2 = getPointFromTarget(conn.to);
                    if(p1 && p2) {
                        const midY = conn.customMidY !== undefined ? conn.customMidY : (p1.y + p2.y) / 2;
                        const distToV1 = Math.abs(target.point.x - p1.x);
                        const distToH = Math.abs(target.point.y - midY);
                        const distToV2 = Math.abs(target.point.x - p2.x);
                        if (distToH <= distToV1 && distToH <= distToV2) { target.point.y = midY; } 
                        else if (distToV1 < distToV2) { target.point.x = p1.x; } 
                        else { target.point.x = p2.x; }
                    }
                }
            }
            if (!state.firstConnectionTarget) {
                state.firstConnectionTarget = target;
            } else {
                if (state.firstConnectionTarget.id !== target.id || state.firstConnectionTarget.type !== target.type) {
                    state.connections.push({ id: Date.now(), from: state.firstConnectionTarget, to: target });
                }
                state.firstConnectionTarget = null;
            }
            updateAndRender();
        }

        canvas.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            const targetPath = e.target.closest('path');
            if (targetPath && targetPath.dataset.connId && !state.isConnectMode) {
                contextConnId = parseInt(targetPath.dataset.connId);
                lineContextMenu.style.top = `${e.clientY}px`;
                lineContextMenu.style.left = `${e.clientX}px`;
                lineContextMenu.classList.remove('hidden');
            }
        });

        deleteLineBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (contextConnId) {
                deleteConnection(contextConnId);
                contextConnId = null;
            }
            lineContextMenu.classList.add('hidden');
        });

        window.addEventListener('click', (e) => {
            if (!lineContextMenu.classList.contains('hidden')) {
                lineContextMenu.classList.add('hidden');
            }
            if (!e.target.closest('.card, .sticker-image, #edit-controls, #editModal, #projectListModal, .resize-handle, #openProjectsBtn')) {
                if (selectedItems.cards.length > 0 || selectedItems.images.length > 0) {
                    selectedItems = { cards: [], images: [] };
                    render();
                }
            }
        }, true);

        document.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            if (e.ctrlKey && e.key === 'z') { e.preventDefault(); undo(); }
            if (e.ctrlKey && e.key === 'y') { e.preventDefault(); redo(); }
            if (e.key === 'Delete' || e.key === 'Backspace') {
                if (selectedItems.cards.length > 0 || selectedItems.images.length > 0) {
                    if (confirm(`Excluir ${selectedItems.cards.length + selectedItems.images.length} item(s) selecionado(s)?`)) {
                        state.cards = state.cards.filter(c => !selectedItems.cards.includes(c.id));
                        state.images = state.images.filter(i => !selectedItems.images.includes(i.id));
                        state.connections = state.connections.filter(conn => 
                            !selectedItems.cards.includes(conn.from.id) && !selectedItems.cards.includes(conn.to.id)
                        );
                        selectedItems = { cards: [], images: [] };
                        updateAndRender();
                    }
                }
            }
        });
        
        async function initialize() {
            await initializeFirebase();
            const urlParams = new URLSearchParams(window.location.search);
            const viewId = urlParams.get('viewId');
            const chartId = urlParams.get('id');

            if (!viewId && !chartId) {
                window.location.href = 'dashboard.html'; // Redireciona para o dashboard
                return; // Para a execução
            }

            if (viewId) {
                chartId = viewId;
                editorContainer.style.display = 'none';
                viewPageContainer.style.display = 'flex';
                listenForRealtimeUpdates(chartId);
            } else {
                chartId = urlParams.get('id');
                if (!chartId) {
                    const newName = prompt("Digite o nome para o novo projeto:", "Novo Projeto Sem Título");
                    if (!newName) {
                        // If user cancels, create a default one anyway or show a message
                        const tempId = doc(collection(db, "charts")).id;
                        const newState = { name: "Novo Projeto", cards: [], connections: [], images: [], pan: { x: 0, y: 0, scale: 1 } };
                        await setDoc(doc(db, "charts", tempId), newState);
                        window.location.href = `${window.location.origin}${window.location.pathname}?id=${tempId}`;
                    } else {
                       const newChartId = doc(collection(db, "charts")).id;
                        const newState = { name: newName, cards: [], connections: [], images: [], pan: { x: 0, y: 0, scale: 1 } };
                        await setDoc(doc(db, "charts", newChartId), newState);
                        window.location.href = `${window.location.origin}${window.location.pathname}?id=${newChartId}`;
                    }
                    return;
                }
                await loadStateFromFirestore(chartId);
            }
        }

        // Initial call
        initialize();
