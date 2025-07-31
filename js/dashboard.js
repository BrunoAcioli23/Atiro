import { db, auth, onAuthStateChanged, signInAnonymously, collection, getDocs, doc, setDoc, updateDoc, deleteDoc } from './firebase-config.js';

// --- Elementos do DOM ---
const boardsListContainer = document.getElementById('boards-list-container');
const createNewBtn = document.getElementById('createNewBtn');
const templateCards = document.querySelectorAll('.template-card');
const searchBox = document.querySelector('.search-box');
const inicioBtn = document.getElementById('inicioBtn');
const favoritoBtn = document.getElementById('favoritoBtn');
const viewTitle = document.getElementById('viewTitle');
const templatesSection = document.getElementById('templatesSection');
const mainActionsSection = document.getElementById('mainActionsSection');
const boardsHeaderSection = document.getElementById('boardsHeaderSection');

let allProjects = [];
let currentView = 'inicio';

// --- FUNÇÕES DE LÓGICA DO MENU ---

function openInNewTab(projectId) {
    window.open(`index.html?id=${projectId}`, '_blank');
}

async function renameProject(projectId, currentName) {
    const newName = prompt("Digite o novo nome para o projeto:", currentName);
    if (newName && newName !== currentName) {
        const projectRef = doc(db, "charts", projectId);
        try {
            await updateDoc(projectRef, { name: newName });
            await fetchAndDisplayProjects();
        } catch (e) {
            console.error("Erro ao renomear projeto:", e);
            alert("Não foi possível renomear o projeto.");
        }
    }
}

async function duplicateProject(projectId) {
    const projectToDuplicate = allProjects.find(p => p.id === projectId);
    if (!projectToDuplicate) return;
    const newName = `${projectToDuplicate.name} - Cópia`;
    const { id, ...projectData } = projectToDuplicate;
    const newState = { ...projectData, name: newName, isFavorite: false, createdAt: new Date() };
    try {
        await setDoc(doc(collection(db, "charts")), newState);
        await fetchAndDisplayProjects();
        alert(`Projeto "${projectToDuplicate.name}" duplicado com sucesso!`);
    } catch (e) {
        console.error("Erro ao duplicar projeto:", e);
        alert("Não foi possível duplicar o projeto.");
    }
}

function showDetails(project) {
    const creationDate = project.createdAt ? project.createdAt.toDate().toLocaleString('pt-BR') : 'Não disponível';
    alert(`Detalhes do Projeto:\n\nNome: ${project.name}\nID: ${project.id}\nCriado em: ${creationDate}`);
}

/**
 * NOVA FUNÇÃO: Exclui um projeto após confirmação.
 * @param {string} projectId O ID do projeto.
 * @param {string} projectName O nome do projeto.
 */
async function deleteProject(projectId, projectName) {
    if (confirm(`Tem certeza que deseja excluir o projeto "${projectName}"?\n\nEsta ação não pode ser desfeita.`)) {
        try {
            await deleteDoc(doc(db, "charts", projectId));
            await fetchAndDisplayProjects(); // Recarrega a lista para remover o card
        } catch (e) {
            console.error("Erro ao excluir projeto:", e);
            alert("Não foi possível excluir o projeto.");
        }
    }
}

// --- FUNÇÕES PRINCIPAIS ---

function setView(viewName) {
    currentView = viewName;
    let projectsToRender = [];
    if (viewTitle) {
        if (viewName === 'inicio') {
            viewTitle.textContent = 'Início';
            projectsToRender = allProjects;
        } else if (viewName === 'favorito') {
            viewTitle.textContent = 'Favoritos';
            projectsToRender = allProjects.filter(p => p.isFavorite);
        }
    }
    inicioBtn.classList.toggle('active', viewName === 'inicio');
    favoritoBtn.classList.toggle('active', viewName === 'favorito');
    renderProjects(projectsToRender);
}

function renderProjects(projectsToRender) {
    if (!boardsListContainer) return;
    boardsListContainer.innerHTML = '';

    if (projectsToRender.length === 0) {
        // ... (lógica para container vazio) ...
        return;
    }

    boardsListContainer.style.display = 'grid';
    // ... (estilos do grid) ...

    projectsToRender.forEach((project) => {
        const cardContainer = document.createElement('div');
        cardContainer.className = 'board-card-item';
        cardContainer.style.position = 'relative';

        const cardLink = document.createElement('a');
        cardLink.href = `index.html?id=${project.id}`;
        
        const previewDiv = document.createElement('div');
        previewDiv.className = 'board-preview';

        const titleDiv = document.createElement('div');
        titleDiv.className = 'board-title';
        titleDiv.textContent = project.name || "Projeto Sem Nome";

        cardLink.appendChild(previewDiv);
        cardLink.appendChild(titleDiv);
        
        const menuButton = document.createElement('div');
        menuButton.className = 'card-menu-button';
        menuButton.innerHTML = '...';
        
        const menuDropdown = document.createElement('div');
        menuDropdown.className = 'card-menu-dropdown';
        // --- ALTERAÇÃO AQUI: Adicionada a opção "Excluir" ---
        menuDropdown.innerHTML = `
            <div class="menu-item" data-action="open-tab">Abrir em nova aba</div>
            <div class="menu-item" data-action="favorite">${project.isFavorite ? 'Desmarcar favorito' : 'Marcar como favorito'}</div>
            <div class="menu-item" data-action="rename">Renomear</div>
            <div class="menu-item" data-action="duplicate">Duplicar</div>
            <div class="menu-item" data-action="details">Detalhes</div>
            <div class="menu-item" data-action="delete" style="color: red;">Excluir</div>
        `;

        menuButton.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            document.querySelectorAll('.card-menu-dropdown').forEach(m => {
                if (m !== menuDropdown) m.classList.remove('visible');
            });
            menuDropdown.classList.toggle('visible');
        };

        menuDropdown.addEventListener('click', (e) => {
            e.stopPropagation();
            const action = e.target.dataset.action;
            if(!action) return;

            // --- ALTERAÇÃO AQUI: Adicionado o case para "delete" ---
            switch(action) {
                case 'open-tab': openInNewTab(project.id); break;
                case 'favorite': toggleFavorite(project.id, !project.isFavorite); break;
                case 'rename': renameProject(project.id, project.name); break;
                case 'duplicate': duplicateProject(project.id); break;
                case 'details': showDetails(project); break;
                case 'delete': deleteProject(project.id, project.name); break;
            }
            menuDropdown.classList.remove('visible');
        });

        const favoriteStar = document.createElement('div');
        // ... (lógica da estrela) ...
        
        previewDiv.appendChild(favoriteStar);
        cardContainer.appendChild(cardLink);
        cardContainer.appendChild(menuButton);
        cardContainer.appendChild(menuDropdown);
        boardsListContainer.appendChild(cardContainer);
    });
}

window.addEventListener('click', () => {
    document.querySelectorAll('.card-menu-dropdown').forEach(m => m.classList.remove('visible'));
});

async function fetchAndDisplayProjects() {
    try {
        const querySnapshot = await getDocs(collection(db, "charts"));
        allProjects = [];
        querySnapshot.forEach(doc => allProjects.push({ id: doc.id, ...doc.data() }));
        allProjects.sort((a, b) => (b.createdAt?.toDate() || 0) - (a.createdAt?.toDate() || 0));
        setView(currentView);
    } catch (e) { console.error("Erro ao buscar projetos:", e); }
}

async function toggleFavorite(projectId, isFavorite) {
    const projectRef = doc(db, "charts", projectId);
    try {
        await updateDoc(projectRef, { isFavorite: isFavorite });
        const projectIndex = allProjects.findIndex(p => p.id === projectId);
        if (projectIndex > -1) {
            allProjects[projectIndex].isFavorite = isFavorite;
            setView(currentView);
        }
    } catch (e) { console.error("Erro ao favoritar projeto:", e); }
}

async function createNewProject(template = 'blank') {
    const defaultName = template === 'blank' ? "Projeto em Branco" : `Novo ${template.charAt(0).toUpperCase() + template.slice(1)}`;
    const newName = prompt("Digite o nome para o novo projeto:", defaultName);
    if (!newName) return;
    try {
        const newChartRef = doc(collection(db, "charts"));
        const newState = {
            name: newName, ownerId: auth.currentUser.uid, createdAt: new Date(), isFavorite: false,
            cards: [], connections: [], images: [], pan: { x: 0, y: 0, scale: 1 }
        };
        if (template === 'organograma') {
            newState.cards.push({ id: Date.now(), name: 'CEO / Presidente', title: 'Sua Empresa', type: 'department', x: 400, y: 100, imageUrl: '' });
        }
        await setDoc(newChartRef, newState);
        window.location.href = `index.html?id=${newChartId.id}`;
    } catch (e) { console.error("Erro ao criar novo projeto:", e); }
}

// --- Inicialização e Event Listeners (Sem alterações) ---
if(inicioBtn) {
    inicioBtn.addEventListener('click', (e) => {
        e.preventDefault();
        setView('inicio');
    });
}

// Botão "Favorito"
if(favoritoBtn) {
    favoritoBtn.addEventListener('click', (e) => {
        e.preventDefault();
        setView('favorito');
    });
}

// O restante dos listeners (Busca, Criar Novo, Templates) não precisa de alterações.

// Autenticação e carregamento inicial
onAuthStateChanged(auth, (user) => {
    if (user) {
        fetchAndDisplayProjects();
    } else {
        signInAnonymously(auth).catch(error => console.error("Erro no login anônimo:", error));
    }
});

async function createNewProject(template = 'blank') {
    const defaultName = template === 'blank' ? "Projeto em Branco" : `Novo ${template.charAt(0).toUpperCase() + template.slice(1)}`;
    const newName = prompt("Digite o nome para o novo projeto:", defaultName);
    if (!newName) return;
    try {
        const newChartRef = doc(collection(db, "charts"));
        const newState = {
            name: newName, ownerId: auth.currentUser.uid, createdAt: new Date(), isFavorite: false,
            cards: [], connections: [], images: [], pan: { x: 0, y: 0, scale: 1 }
        };
        if (template === 'organograma') {
            newState.cards.push({ id: Date.now(), name: 'CEO / Presidente', title: 'Sua Empresa', type: 'department', x: 400, y: 100, imageUrl: '' });
        }
        await setDoc(newChartRef, newState);
        window.location.href = `index.html?id=${newChartId.id}`;
    } catch (e) { console.error("Erro ao criar novo projeto:", e); }
}

// --- Inicialização e Event Listeners (Sem alterações) ---
if(inicioBtn) {
    inicioBtn.addEventListener('click', (e) => {
        e.preventDefault();
        setView('inicio');
    });
}

// Botão "Favorito"
if(favoritoBtn) {
    favoritoBtn.addEventListener('click', (e) => {
        e.preventDefault();
        setView('favorito');
    });
}

// O restante dos listeners (Busca, Criar Novo, Templates) não precisa de alterações.

// Autenticação e carregamento inicial
onAuthStateChanged(auth, (user) => {
    if (user) {
        fetchAndDisplayProjects();
    } else {
        signInAnonymously(auth).catch(error => console.error("Erro no login anônimo:", error));
    }
});