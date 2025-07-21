 document.addEventListener('DOMContentLoaded', () => {
        // DOM Elements
        const editorContainer = document.getElementById('editor-container');
        const viewPageContainer = document.getElementById('view-page-container');
        const canvas = document.getElementById('canvas');
        const world = document.getElementById('world');
        const cardLayer = document.getElementById('card-layer');
        const svgLayer = document.getElementById('svg-layer');
        const addCardBtn = document.getElementById('addCardBtn');
        const connectModeBtn = document.getElementById('connectModeBtn');
        const toggleGuideBtn = document.getElementById('toggleGuideBtn');
        const resolutionGuide = document.getElementById('resolution-guide');
        const resetViewBtn = document.getElementById('resetViewBtn');
        const clearAllBtn = document.getElementById('clearAllBtn');
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
        
        // View Page Elements
        const viewCanvas = document.getElementById('view-canvas');
        const viewWorld = document.getElementById('view-world');
        const viewCardLayer = document.getElementById('view-card-layer');
        const viewSvgLayer = document.getElementById('view-svg-layer');


        let state = {
            cards: [],
            connections: [],
            pan: { x: 0, y: 0, scale: 1 },
            isConnectMode: false,
            firstConnectionTarget: null,
            editingCardId: null,
            dragging: {
                isDown: false,
                cardId: null,
                offset: { x: 0, y: 0 },
                dragStartPos: { x: 0, y: 0 },
                axisLock: null,
                hasDragged: false
            },
            lineDragging: {
                isDown: false,
                connId: null,
                startY: 0
            }
        };

        let history = [];
        let historyIndex = -1;

        const CARD_WIDTH = 180;
        const CARD_HEIGHT = 90;
        const SPACING_X = 80;
        const SPACING_Y = 80;

        // --- History Management ---
        function pushStateToHistory() {
            if (historyIndex < history.length - 1) {
                history = history.slice(0, historyIndex + 1);
            }
            const stateToSave = {
                cards: JSON.parse(JSON.stringify(state.cards)),
                connections: JSON.parse(JSON.stringify(state.connections)),
                pan: JSON.parse(JSON.stringify(state.pan)) // Save pan state as well
            };
            history.push(stateToSave);
            historyIndex = history.length - 1;
            localStorage.setItem('orgChartBuilderState', JSON.stringify(stateToSave));
        }

        function undo() {
            if (historyIndex > 0) {
                historyIndex--;
                loadStateFromHistory();
            }
        }

        function redo() {
             if (historyIndex < history.length - 1) {
                historyIndex++;
                loadStateFromHistory();
            }
        }

        function loadStateFromHistory() {
            const historicState = history[historyIndex];
            state.cards = JSON.parse(JSON.stringify(historicState.cards));
            state.connections = JSON.parse(JSON.stringify(historicState.connections));
            state.pan = JSON.parse(JSON.stringify(historicState.pan || { x: 0, y: 0, scale: 1 }));
            render();
        }

        // --- State Management ---
        function loadState() {
            const savedState = localStorage.getItem('orgChartBuilderState');
            if (savedState) {
                const loadedData = JSON.parse(savedState);
                state.cards = loadedData.cards || [];
                state.connections = loadedData.connections || [];
                state.pan = loadedData.pan || { x: 0, y: 0, scale: 1 };
                // Don't push to history on initial load, only on user action
                history = [loadedData];
                historyIndex = 0;
            }
        }

        // --- Rendering ---
        function render(isViewOnly = false) {
            const currentCardLayer = isViewOnly ? viewCardLayer : cardLayer;
            const currentSvgLayer = isViewOnly ? viewSvgLayer : svgLayer;
            const currentWorld = isViewOnly ? viewWorld : world;
            const currentCanvas = isViewOnly ? viewCanvas : canvas;

            currentCardLayer.innerHTML = '';
            currentSvgLayer.innerHTML = '';
            
            const transform = `translate(${state.pan.x}px, ${state.pan.y}px) scale(${state.pan.scale})`;
            currentWorld.style.transform = transform;
            
            if (!isViewOnly) {
                currentCanvas.classList.toggle('connect-mode-active', state.isConnectMode);
            }

            state.cards.forEach(cardData => renderCard(cardData, isViewOnly));
            state.connections.forEach(conn => renderConnection(conn, isViewOnly));
        }

        function renderCard(cardData, isViewOnly) {
            const cardEl = document.createElement('div');
            cardEl.className = 'card';
            if (cardData.type === 'department') cardEl.classList.add('card-department');
            if (!isViewOnly && state.firstConnectionTarget && state.firstConnectionTarget.type === 'card' && cardData.id === state.firstConnectionTarget.id) {
                cardEl.classList.add('selected-for-connection');
            }
            
            cardEl.style.left = `${cardData.x}px`;
            cardEl.style.top = `${cardData.y}px`;
            cardEl.dataset.id = cardData.id;

            const placeholderImg = `https://placehold.co/60x60/e2e8f0/64748b?text=${cardData.name.charAt(0)}`;
            let innerHTML = `
                <img class="card-photo" src="${cardData.imageUrl || placeholderImg}" onerror="this.src='${placeholderImg}'">
                <h3 class="name font-bold text-gray-800 text-sm">${cardData.name}</h3>
                <p class="title text-xs text-gray-500">${cardData.title}</p>
            `;
            if (!isViewOnly) {
                innerHTML += `
                    <div class="add-btn add-btn-top" data-direction="top">+</div>
                    <div class="add-btn add-btn-right" data-direction="right">+</div>
                    <div class="add-btn add-btn-bottom" data-direction="bottom">+</div>
                    <div class="add-btn add-btn-left" data-direction="left">+</div>
                `;
            }
            cardEl.innerHTML = innerHTML;
            (isViewOnly ? viewCardLayer : cardLayer).appendChild(cardEl);
        }

        function getElbowPath(p1, p2, customMidY) {
            const midY = customMidY !== undefined ? customMidY : (p1.y + p2.y) / 2;
            return `M${p1.x},${p1.y} L${p1.x},${midY} L${p2.x},${midY} L${p2.x},${p2.y}`;
        }
        
        function getPointFromTarget(target) {
            if (!target) return null;
            if (target.type === 'card') {
                const card = state.cards.find(c => c.id === target.id);
                if (!card) return null;
                return { x: card.x + CARD_WIDTH / 2, y: card.y + CARD_HEIGHT / 2 };
            } else if (target.type === 'connection') {
                return target.point;
            }
            return null;
        }

        function renderConnection(conn, isViewOnly) {
            const currentSvgLayer = isViewOnly ? viewSvgLayer : svgLayer;
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('stroke', '#94a3b8');
            path.setAttribute('stroke-width', '2');
            path.setAttribute('fill', 'none');
            path.dataset.connId = conn.id;
            if (!isViewOnly && state.firstConnectionTarget && state.firstConnectionTarget.type === 'connection' && conn.id === state.firstConnectionTarget.id) {
                path.classList.add('selected-for-connection');
            }

            const p1 = getPointFromTarget(conn.from);
            const p2 = getPointFromTarget(conn.to);
            
            if (p1 && p2) {
                const d = getElbowPath(p1, p2, conn.customMidY);
                path.setAttribute('d', d);
                currentSvgLayer.appendChild(path);

                if (!isViewOnly) {
                    const handle = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                    handle.setAttribute('d', `M${p1.x},${conn.customMidY || (p1.y + p2.y) / 2} L${p2.x},${conn.customMidY || (p1.y + p2.y) / 2}`);
                    handle.setAttribute('stroke-width', '10');
                    handle.classList.add('line-handle');
                    handle.dataset.connId = conn.id;
                    currentSvgLayer.appendChild(handle);
                }
            }
        }

        // --- Card & Modal Logic ---
        function addCard(fromCardId = null, direction = null) {
            const newCard = {
                id: Date.now(),
                name: 'Novo Card',
                title: 'Descrição',
                imageUrl: '',
                type: 'employee',
                x: 0, y: 0
            };

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
                const viewCenterX = (canvas.clientWidth / 2) - (CARD_WIDTH / 2);
                const viewCenterY = (canvas.clientHeight / 2) - (CARD_HEIGHT / 2);
                newCard.x = (viewCenterX - state.pan.x) / state.pan.scale;
                newCard.y = (viewCenterY - state.pan.y) / state.pan.scale;
            }
            state.cards.push(newCard);
            updateAndRender();
        }

        function deleteCard(cardId) {
            state.connections = state.connections.filter(conn => conn.from.id !== cardId && conn.to.id !== cardId);
            state.cards = state.cards.filter(c => c.id !== cardId);
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
        
        function toggleImageType() {
            const isEmployee = cardTypeSelect.value === 'employee';
            imageUrlWrapper.style.display = isEmployee ? 'block' : 'none';
        }

        cardTypeSelect.addEventListener('change', toggleImageType);

        function closeEditModal() {
            state.editingCardId = null;
            editModal.classList.add('hidden');
        }

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
                deleteCard(state.editingCardId);
            }
            closeEditModal();
        });

        cancelModalBtn.addEventListener('click', closeEditModal);
        editModal.addEventListener('click', (e) => {
            if (e.target === editModal) closeEditModal();
        });

        // --- Event Handlers ---
        addCardBtn.addEventListener('click', () => {
            addCard();
        });
        
        clearAllBtn.addEventListener('click', () => {
            if (confirm('Tem certeza que deseja apagar todo o organograma? Esta ação não pode ser desfeita.')) {
                state.cards = [];
                state.connections = [];
                updateAndRender();
            }
        });

        resetViewBtn.addEventListener('click', () => {
            state.pan = { x: 0, y: 0, scale: 1 };
            render();
        });

        viewModeBtn.addEventListener('click', () => {
            window.open(window.location.href + '?view=true', '_blank');
        });

        connectModeBtn.addEventListener('click', () => {
            state.isConnectMode = !state.isConnectMode;
            state.firstConnectionTarget = null;
            connectModeBtn.classList.toggle('active', state.isConnectMode);
            render();
        });
        
        toggleGuideBtn.addEventListener('click', () => {
            resolutionGuide.classList.toggle('hidden');
        });

        // --- Pan and Drag Logic ---
        let isPanning = false;
        let startPos = { x: 0, y: 0 };
        let startPan = { x: 0, y: 0 };

        canvas.addEventListener('mousedown', (e) => {
            if (state.isViewMode) return;
            
            const cardEl = e.target.closest('.card');
            const lineHandleEl = e.target.closest('.line-handle');

            if (lineHandleEl && !state.isConnectMode) {
                state.lineDragging.isDown = true;
                state.lineDragging.connId = parseInt(lineHandleEl.dataset.connId);
                state.lineDragging.startY = (e.clientY - state.pan.y) / state.pan.scale;
            } else if (cardEl && !state.isConnectMode) {
                state.dragging.isDown = true;
                state.dragging.hasDragged = false; // Reset hasDragged flag
                state.dragging.cardId = parseInt(cardEl.dataset.id);
                const card = state.cards.find(c => c.id === state.dragging.cardId);
                cardEl.classList.add('dragging');
                state.dragging.dragStartPos = { x: e.clientX, y: e.clientY };
                state.dragging.axisLock = null;
                const mouseX = (e.clientX - state.pan.x) / state.pan.scale;
                const mouseY = (e.clientY - state.pan.y) / state.pan.scale;
                state.dragging.offset.x = mouseX - card.x;
                state.dragging.offset.y = mouseY - card.y;
            } else if (e.target === canvas) {
                isPanning = true;
                canvas.style.cursor = 'grabbing';
                startPos = { x: e.clientX, y: e.clientY };
                startPan = { ...state.pan };
            }
        });

        window.addEventListener('mousemove', (e) => {
            if (state.lineDragging.isDown) {
                const conn = state.connections.find(c => c.id === state.lineDragging.connId);
                if (conn) {
                    conn.customMidY = (e.clientY - state.pan.y) / state.pan.scale;
                    render();
                }
            } else if (state.dragging.isDown) {
                const card = state.cards.find(c => c.id === state.dragging.cardId);
                if (card) {
                    const dx = Math.abs(e.clientX - state.dragging.dragStartPos.x);
                    const dy = Math.abs(e.clientY - state.dragging.dragStartPos.y);
                    if (dx > 3 || dy > 3) {
                        state.dragging.hasDragged = true; // It's a drag
                    }

                    const mouseX = (e.clientX - state.pan.x) / state.pan.scale;
                    const mouseY = (e.clientY - state.pan.y) / state.pan.scale;
                    
                    let newX = mouseX - state.dragging.offset.x;
                    let newY = mouseY - state.dragging.offset.y;

                    if (e.shiftKey) {
                        if (!state.dragging.axisLock) {
                            if (dx > 5 || dy > 5) {
                                state.dragging.axisLock = (dx > dy) ? 'Y' : 'X';
                            }
                        }
                        if (state.dragging.axisLock === 'Y') newY = card.y;
                        if (state.dragging.axisLock === 'X') newX = card.x;
                    } else {
                        state.dragging.axisLock = null;
                    }
                    card.x = newX;
                    card.y = newY;
                    render();
                }
            } else if (isPanning && !state.isViewMode) {
                const dx = e.clientX - startPos.x;
                const dy = e.clientY - startPos.y;
                state.pan.x = startPan.x + dx;
                state.pan.y = startPan.y + dy;
                render();
            }
        });

        window.addEventListener('mouseup', (e) => {
            const wasDragged = state.dragging.hasDragged;
            if (state.dragging.isDown) {
                document.querySelector(`[data-id='${state.dragging.cardId}']`)?.classList.remove('dragging');
                state.dragging.isDown = false;
                state.dragging.cardId = null;
                if (wasDragged) {
                    updateAndRender(); // Only save to history if it was a drag
                }
            }
             if (state.lineDragging.isDown) {
                state.lineDragging.isDown = false;
                state.lineDragging.connId = null;
                updateAndRender();
            }
            if (isPanning) {
                isPanning = false;
                canvas.style.cursor = 'grab';
            }
            
            // This ensures a click is processed if it wasn't a drag
            if (!wasDragged) {
                handleCanvasClick(e);
            }
        });
        
        function handleCanvasClick(e) {
            if (state.isViewMode) return;
            const cardEl = e.target.closest('.card');
            const pathEl = e.target.closest('path');

            if (state.isConnectMode) {
                if (cardEl) {
                    handleConnectionClick({ type: 'card', id: parseInt(cardEl.dataset.id) });
                } else if (pathEl) {
                    const worldPoint = {
                        x: (e.clientX - state.pan.x) / state.pan.scale,
                        y: (e.clientY - state.pan.y) / state.pan.scale
                    };
                    handleConnectionClick({ type: 'connection', id: parseInt(pathEl.dataset.connId), point: worldPoint });
                }
                return;
            }
            
            if (e.target.classList.contains('add-btn')) {
                addCard(parseInt(cardEl.dataset.id), e.target.dataset.direction);
            } else if (cardEl) {
                openEditModal(parseInt(cardEl.dataset.id));
            }
        }


        function handleConnectionClick(target) {
            // Snap point to line if target is a connection
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
                        
                        if (distToH <= distToV1 && distToH <= distToV2) {
                            target.point.y = midY; 
                        } else if (distToV1 < distToV2) {
                            target.point.x = p1.x; 
                        } else {
                            target.point.x = p2.x; 
                        }
                    }
                }
            }

            if (!state.firstConnectionTarget) {
                state.firstConnectionTarget = target;
            } else {
                const from = state.firstConnectionTarget;
                const to = target;
                
                if (from.id === to.id && from.type === to.type) {
                    state.firstConnectionTarget = null;
                    render();
                    return;
                }
                
                state.connections.push({ id: Date.now(), from: from, to: to });
                state.firstConnectionTarget = null;
            }
            updateAndRender();
        }

        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 'z') {
                e.preventDefault();
                undo();
            }
             if (e.ctrlKey && e.key === 'y') {
                e.preventDefault();
                redo();
            }
        });

        canvas.addEventListener('wheel', (e) => {
            if (state.isViewMode) return;
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
        
        // --- Initialization ---
        function initialize() {
            const urlParams = new URLSearchParams(window.location.search);
            const isViewOnly = urlParams.get('view') === 'true';
            
            loadState();

            if (isViewOnly) {
                editorContainer.style.display = 'none';
                viewPageContainer.style.display = 'flex';
                // timestampEl.textContent = new Date().toLocaleString('pt-BR');
                render(true);
                window.addEventListener('storage', (e) => {
                    if (e.key === 'orgChartBuilderState') {
                        loadState();
                        render(true);
                    }
                });
            } else {
                render();
            }
        }
        
        function updateAndRender() {
            pushStateToHistory();
            render();
        }

        initialize();
    });