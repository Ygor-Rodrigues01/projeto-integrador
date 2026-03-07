// ===== CONFIGURAÇÕES E ESTADO GLOBAL =====
const API_BASE = '/api';

const STATUS = {
  analise: { label: "Em Análise", color: "#f59e0b", icon: "🔍", class: "analise" },
  reparo: { label: "Em Reparo", color: "#3b82f6", icon: "🔧", class: "reparo" },
  finalizado: { label: "Finalizado", color: "#10b981", icon: "✅", class: "finalizado" },
  aguardando: { label: "Aguardando Técnico", color: "#8b5cf6", icon: "⏳", class: "aguardando" }
};

const state = {
  screen: 'loading',
  currentUser: null,
  selectedTicket: null,
  currentTab: 'overview',
  devices: [],
  tickets: [],
  supports: [],
  currentSupport: null
};

// ===== API HELPERS =====
const api = {
  setLoading(isLoading) {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
      if (isLoading) overlay.classList.remove('hidden');
      else overlay.classList.add('hidden');
    }
  },

  async request(endpoint, options = {}) {
    this.setLoading(true);
    try {
      const response = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers
        },
        credentials: 'same-origin'
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Erro na requisição');
      }

      return data;
    } catch (error) {
      console.error('API Error:', error);
      throw error;
    } finally {
      this.setLoading(false);
    }
  },

  async get(endpoint) {
    return this.request(endpoint, { method: 'GET' });
  },

  async post(endpoint, data) {
    return this.request(endpoint, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  async put(endpoint, data) {
    return this.request(endpoint, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }
};

// ===== UTILITÁRIOS =====
const showToast = (msg, type = "ok") => {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.className = `toast ${type}`;
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 3000);
};

const openModal = (contentHtml) => {
  const container = document.getElementById('modal-container');
  const body = document.getElementById('modal-body');
  body.innerHTML = contentHtml;
  container.classList.remove('hidden');
};

const closeModal = () => {
  document.getElementById('modal-container').classList.add('hidden');
};

// ===== FUNÇÕES DE AÇÃO =====
const handleRegister = async (form) => {
  try {
    const response = await api.post('/register', form);
    showToast(response.message);
    renderScreen('login');
  } catch (error) {
    showToast(error.message, "err");
  }
};

const handleLogin = async (email, password) => {
  try {
    const response = await api.post('/login', { email, password });
    state.currentUser = response.user;
    state.screen = response.user.role === "tech" ? "tech" : "dashboard";
    state.currentTab = 'overview';
    await loadData();
    render();
  } catch (error) {
    showToast(error.message, "err");
  }
};

const logout = async () => {
  try {
    await api.post('/logout');
  } catch (error) {
    console.error('Logout error:', error);
  }
  state.currentUser = null;
  state.screen = 'home';
  state.devices = [];
  state.tickets = [];
  state.supports = [];
  state.currentSupport = null;
  render();
};

const checkAuth = async () => {
  try {
    const response = await api.get('/me');
    state.currentUser = response.user;
    state.screen = response.user.role === "tech" ? "tech" : "dashboard";
    await loadData();
  } catch (error) {
    state.currentUser = null;
    state.screen = 'home';
  }
  render();
};

const loadData = async () => {
  if (!state.currentUser) return;
  try {
    const [devicesRes, ticketsRes, supportsRes] = await Promise.all([
      api.get('/devices'),
      api.get('/tickets'),
      api.get('/technical-support')
    ]);
    state.devices = devicesRes.devices || [];
    state.tickets = ticketsRes.tickets || [];
    state.supports = supportsRes.supports || [];
  } catch (error) {
    console.error('Error loading data:', error);
    showToast('Erro ao carregar dados', 'err');
  }
};

const addDevice = async (form) => {
  if (!form.brand || !form.model || !form.type) {
    showToast("Preencha os campos obrigatórios", "err");
    return;
  }
  try {
    const response = await api.post('/devices', form);
    showToast(response.message);
    await loadData();
    renderScreen('dashboard', 'devices');
  } catch (error) {
    showToast(error.message, "err");
  }
};

const addTicket = async (form) => {
  try {
    const response = await api.post('/tickets', form);
    showToast(response.message);
    await loadData();
    renderScreen('dashboard', 'tickets');
  } catch (error) {
    showToast(error.message, "err");
  }
};

const assignTicket = async (ticketId) => {
  try {
    const response = await api.post(`/tickets/${ticketId}/assign`);
    showToast(response.message);
    await loadData();
    render();
  } catch (error) {
    showToast(error.message, "err");
  }
};

const updateTicketStatus = async (ticketId, newStatus, note) => {
  try {
    const response = await api.put(`/tickets/${ticketId}/status`, {
      status: newStatus,
      note: note || 'Status atualizado.'
    });
    showToast(response.message);
    await loadData();
    render();
  } catch (error) {
    showToast(error.message, "err");
  }
};

// ===== NAVEGAÇÃO =====
const renderScreen = (screen, tab = null) => {
  state.screen = screen;
  if (tab) state.currentTab = tab;
  render();
};

const render = () => {
  const root = document.getElementById('root');
  if (state.screen === 'loading') { root.innerHTML = renderLoading(); return; }

  if (state.screen === 'home') root.innerHTML = renderHome();
  else if (state.screen === 'login') root.innerHTML = renderLogin();
  else if (state.screen === 'register') root.innerHTML = renderRegister();
  else if (state.screen === 'dashboard') root.innerHTML = renderClientDashboard();
  else if (state.screen === 'tech') root.innerHTML = renderTechDashboard();
};

// ===== TEMPLATES =====
const renderLoading = () => `
  <div class="loader">
    <div class="loader-spinner"></div>
    <p>Carregando sistema…</p>
  </div>
`;

const renderHome = () => `
  <div class="hero">
    <div class="hero-bg"></div>
    <div class="hero-content">
      <div class="logo">⚙️</div>
      <h1 class="hero-title">TechRepair</h1>
      <p class="hero-subtitle">Sistema Profissional de Manutenção de Computadores</p>
      <div class="hero-buttons">
        <button class="btn-primary" id="btn-login">Entrar</button>
        <button class="btn-secondary" id="btn-register">Criar Conta</button>
      </div>
    </div>
  </div>
`;

const renderLogin = () => `
  <div class="auth-wrap">
    <div class="auth-card">
      <button class="back-btn" id="btn-back">← Voltar</button>
      <h2 class="auth-title">Entrar</h2>
      <input type="email" id="login-email" class="input" placeholder="E-mail" />
      <input type="password" id="login-password" class="input" placeholder="Senha" />
      <button class="btn-primary" id="btn-login-submit">Acessar</button>
    </div>
  </div>
`;

const renderRegister = () => `
  <div class="auth-wrap">
    <div class="auth-card">
      <button class="back-btn" id="btn-back">← Voltar</button>
      <h2 class="auth-title">Criar Conta</h2>
      <input type="text" id="reg-name" class="input" placeholder="Nome completo" />
      <input type="email" id="reg-email" class="input" placeholder="E-mail" />
      <input type="password" id="reg-password" class="input" placeholder="Senha" />
      <label class="label">Perfil</label>
      <select id="reg-role">
        <option value="client">Cliente</option>
        <option value="tech">Técnico</option>
      </select>
      <button class="btn-primary" id="btn-register-submit">Cadastrar</button>
    </div>
  </div>
`;

const renderClientDashboard = () => {
  const user = state.currentUser;
  const myDevices = state.devices.filter(d => d.owner_id === user.id);
  const myTickets = state.tickets.filter(t => t.owner_id === user.id);
  const openTickets = myTickets.filter(t => t.status !== "finalizado");
  const closedTickets = myTickets.filter(t => t.status === "finalizado");

  return `
    <div class="dash-wrap">
      <aside class="sidebar">
        <div class="sidebar-logo">⚙️ <span>TechRepair</span></div>
        <nav class="nav">
          <button class="nav-btn ${state.currentTab === 'overview' ? 'active' : ''}" data-tab="overview">📊 Visão Geral</button>
          <button class="nav-btn ${state.currentTab === 'devices' ? 'active' : ''}" data-tab="devices">🖥️ Dispositivos</button>
          <button class="nav-btn ${state.currentTab === 'newticket' ? 'active' : ''}" data-tab="newticket">➕ Novo Chamado</button>
          <button class="nav-btn ${state.currentTab === 'tickets' ? 'active' : ''}" data-tab="tickets">📋 Chamados Ativos</button>
          <button class="nav-btn ${state.currentTab === 'history' ? 'active' : ''}" data-tab="history">📚 Histórico</button>
          <button class="nav-btn ${state.currentTab === 'support' ? 'active' : ''}" data-tab="support">🛠️ Assistências</button>
        </nav>
        <button class="logout-btn" id="btn-logout">← Sair</button>
      </aside>
      <main class="main">
        ${state.currentTab === 'overview' ? `
          <h2 class="page-title">Olá, ${user.name.split(" ")[0]}! 👋</h2>
          <div class="stats-row">
            <div class="stat-card"><div><div class="stat-value">${myDevices.length}</div><div class="stat-label">Dispositivos</div></div></div>
            <div class="stat-card"><div><div class="stat-value">${openTickets.length}</div><div class="stat-label">Ativos</div></div></div>
            <div class="stat-card"><div><div class="stat-value">${closedTickets.length}</div><div class="stat-label">Finalizados</div></div></div>
          </div>
          <h3 class="section-title">Ações Rápidas</h3>
          <div class="grid">
            ${openTickets.map(t => renderTicketCard(t, true)).join('')}
          </div>
        ` : ''}

        ${state.currentTab === 'devices' ? `
          <h2 class="page-title">Meus Dispositivos</h2>
          <div class="card">
            <h3>Novo Dispositivo</h3>
            <div class="form-grid">
              <input type="text" id="dev-brand" class="input" placeholder="Marca" />
              <input type="text" id="dev-model" class="input" placeholder="Modelo" />
              <select id="dev-type">
                <option value="notebook">Notebook</option>
                <option value="desktop">Desktop</option>
                <option value="desktop">Celular</option>
              </select>
            </div>
            <button class="btn-primary" id="btn-add-device">Registrar</button>
          </div>
          <div class="grid">${myDevices.map(d => renderDeviceCard(d)).join('')}</div>
        ` : ''}

        ${state.currentTab === 'newticket' ? `
          <h2 class="page-title">Abrir Chamado</h2>
          <div class="card">
            <select id="ticket-device">
              <option value="">Selecione o dispositivo</option>
              ${myDevices.map(d => `<option value="${d.id}">${d.brand} ${d.model}</option>`).join('')}
            </select>
            <select id="ticket-support">
              <option value="">Selecione a assistência</option>
              ${state.supports.map(s => `<option value="${s.id}">${s.name}</option>`).join('')}
            </select>
            <textarea id="ticket-desc" class="input" placeholder="Descreva o problema"></textarea>

            <label class="label">Foto ou vídeo do problema</label>
            <input type="file" id="ticket-media" class="input" accept="image/*,video/*">

            <button class="btn-primary" id="btn-submit-ticket">Enviar</button>
          </div>
        ` : ''}

        ${state.currentTab === 'tickets' ? `
          <h2 class="page-title">Chamados em Andamento</h2>
          <div class="grid">${openTickets.map(t => renderTicketCard(t, true)).join('')}</div>
        ` : ''}

        ${state.currentTab === 'history' ? `
          <h2 class="page-title">Histórico de Serviços</h2>
          <div class="grid">${closedTickets.map(t => renderTicketCard(t, true)).join('')}</div>
        ` : ''}

        ${state.currentTab === 'support' ? `
          <h2 class="page-title">Assistências Técnicas</h2>
          <div class="grid">${state.supports.map(s => renderSupportCard(s)).join('')}</div>
        ` : ''}

        ${state.currentTab === 'support-detail' ? renderSupportDetail(state.currentSupport) : ''}
      </main>
    </div>
  `;
};

const renderTechDashboard = () => {
  const user = state.currentUser;
  const unassigned = state.tickets.filter(t => t.status === "aguardando");
  const myTickets = state.tickets.filter(t => t.tech_id === user.id);

  return `
    <div class="dash-wrap">
      <aside class="sidebar">
        <div class="sidebar-logo">⚙️ <span>TechRepair</span></div>
        <nav class="nav">
          <button class="nav-btn ${state.currentTab === 'overview' ? 'active' : ''}" data-tab="overview">📊 Fila</button>
          <button class="nav-btn ${state.currentTab === 'mytickets' ? 'active' : ''}" data-tab="mytickets">🔧 Meus Trabalhos</button>
          <button class="nav-btn ${state.currentTab === 'reg-support' ? 'active' : ''}" data-tab="reg-support">🏠 Minha Assistência</button>
        </nav>
        <button class="logout-btn" id="btn-logout">← Sair</button>
      </aside>
      <main class="main">
        ${state.currentTab === 'overview' ? `
          <h2 class="page-title">Fila de Atendimento</h2>
          <div class="grid">${unassigned.map(t => renderTicketCard(t, false, false, true)).join('')}</div>
        ` : ''}
        ${state.currentTab === 'mytickets' ? `
          <h2 class="page-title">Meus Chamados</h2>
          <div class="grid">${myTickets.map(t => renderTicketCard(t, false, false, true)).join('')}</div>
        ` : ''}
        ${state.currentTab === 'reg-support' ? renderRegisterSupportContent() : ''}
      </main>
    </div>
  `;
};

const renderTicketCard = (ticket, isClient, showDate = false, isTech = false) => {
  const status = STATUS[ticket.status] || STATUS.aguardando;

  let action = '';
  if (isTech) {
    if (ticket.status === 'aguardando')
      action = `<button class="btn-small btn-primary" data-action="assign" data-id="${ticket.id}">Assumir</button>`;
    else if (ticket.status === 'analise')
      action = `<button class="btn-small btn-primary" data-action="start-repair" data-id="${ticket.id}">Reparar</button>`;
    else if (ticket.status === 'reparo')
      action = `<button class="btn-small btn-success" data-action="finalize" data-id="${ticket.id}">Finalizar</button>`;
  }

  return `
    <div class="ticket-card" data-ticket-id="${ticket.id}">
      <div class="ticket-header">
        <strong>#${ticket.id} - ${ticket.device_brand} ${ticket.device_model}</strong>
        <span class="status-badge ${status.class}">
          ${status.icon} ${status.label}
        </span>
      </div>
      <p class="ticket-desc">${ticket.description}</p>
      ${action}
    </div>
  `;
};

const renderDeviceCard = (device) => `
  <div class="device-card">
    <div class="device-icon">💻</div>
    <div class="device-name">${device.brand} ${device.model}</div>
    <div class="device-serial">${device.serial || 'S/N'}</div>
  </div>
`;

const renderSupportCard = (support) => `
  <div class="support-card" data-support-id="${support.id}">
    <img src="${support.photo_url || '/static/img/default.jpg'}" class="support-img" />
    <div class="support-content">
      <h3>${support.name}</h3>
      <p>${support.address}</p>
      <button class="btn-small btn-secondary">Ver Detalhes</button>
    </div>
  </div>
`;

const renderSupportDetail = (s) => `
  <div class="card">
    <h2>${s.name}</h2>
    <p>📍 ${s.address}</p>
    <p>📞 ${s.phone}</p>
    <p>✉️ ${s.email}</p>
    <hr>
    <p style="white-space: pre-line;">${s.description}</p>
    <button class="btn-secondary mt-4" onclick="renderScreen('dashboard', 'support')">Voltar</button>
  </div>
  <div class="address-line">
    <p>📍Ver no Mapa</p>
    <a 
      href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.address)}" 
      target="_blank"
      class="map-btn"
    >
      🗺
    </a>
  </div>
`;

const renderRegisterSupportContent = () => `
  <div class="card">
    <h3>Configurar Assistência</h3>
    <input type="text" id="sup-name" class="input" placeholder="Nome" />
    <input type="text" id="sup-addr" class="input" placeholder="Endereço" />
    <textarea id="sup-desc" class="input" placeholder="Descrição"></textarea>
    <input type="text" id="sup-phone" class="input" placeholder="Telefone" />
    <input type="text" id="sup-email" class="input" placeholder="Email" />
    <input type="file" id="sup-photo" class="input" />
    <button class="btn-primary" id="btn-save-support">Salvar</button>
  </div>
`;

// ===== DELEGAÇÃO DE EVENTOS (ÚNICA) =====
document.addEventListener('click', async (e) => {
  const target = e.target;

  // Botões de Navegação
  if (target.id === 'btn-login') renderScreen('login');
  if (target.id === 'btn-register') renderScreen('register');
  if (target.id === 'btn-back') renderScreen('home');
  if (target.id === 'btn-logout') logout();

  // Tabs
  const navBtn = target.closest('.nav-btn');
  if (navBtn) {
    const tab = navBtn.dataset.tab;
    const screen = state.currentUser.role === 'tech' ? 'tech' : 'dashboard';
    renderScreen(screen, tab);
  }

  // Auth Submit
  if (target.id === 'btn-login-submit') {
    handleLogin(document.getElementById('login-email').value, document.getElementById('login-password').value);
  }
  if (target.id === 'btn-register-submit') {
    handleRegister({
      name: document.getElementById('reg-name').value,
      email: document.getElementById('reg-email').value,
      password: document.getElementById('reg-password').value,
      role: document.getElementById('reg-role').value
    });
  }

  // Ações de Entidades
  if (target.id === 'btn-add-device') {
    addDevice({
      brand: document.getElementById('dev-brand').value,
      model: document.getElementById('dev-model').value,
      type: document.getElementById('dev-type').value
    });
  }
if (target.id === 'btn-submit-ticket') {

  const fileInput = document.getElementById('ticket-media');
  let mediaUrl = '';

  if (fileInput.files.length > 0) {
    const formData = new FormData();
    formData.append('file', fileInput.files[0]);

    const uploadRes = await fetch('/upload', {
      method: 'POST',
      body: formData,
      credentials: 'same-origin'
    });

    const uploadData = await uploadRes.json();
    mediaUrl = uploadData.url;
  }

  addTicket({
    device_id: parseInt(document.getElementById('ticket-device').value),
    support_id: parseInt(document.getElementById('ticket-support').value),
    description: document.getElementById('ticket-desc').value,
    media_url: mediaUrl
  });
}
  if (target.id === 'btn-save-support') {
    const fileInput = document.getElementById('sup-photo');
    let photoUrl = '';

  if (fileInput.files.length > 0) {
    const formData = new FormData();
    formData.append('file', fileInput.files[0]);

    const uploadRes = await fetch('/upload', {
      method: 'POST',
      body: formData,
      credentials: 'same-origin'
    });

    const uploadData = await uploadRes.json();
    photoUrl = uploadData.url;
  }

  const res = await api.post('/technical-support', {
    name: document.getElementById('sup-name').value,
    address: document.getElementById('sup-addr').value,
    description: document.getElementById('sup-desc').value,
    phone: document.getElementById('sup-phone').value,
    email: document.getElementById('sup-email').value,
    photo_url: photoUrl
  });

  showToast(res.message);
  await loadData();
  render();
}

  // Ações em Tickets
  const actionBtn = target.closest('[data-action]');
  if (actionBtn) {
    const id = actionBtn.dataset.id;
    const action = actionBtn.dataset.action;
    if (action === 'assign') assignTicket(id);
    if (action === 'start-repair') updateTicketStatus(id, 'reparo');
    if (action === 'finalize') updateTicketStatus(id, 'finalizado');
  }

  // Detalhes
  const ticketCard = target.closest('.ticket-card');

if (ticketCard && !target.dataset.action) {
  const ticket = state.tickets.find(t => t.id == ticketCard.dataset.ticketId);

  openModal(`
    <h2>Chamado #${ticket.id}</h2>

    <p><strong>Status:</strong> ${STATUS[ticket.status].label}</p>

    ${state.currentUser.role === 'tech' ? `
    <p><strong>Cliente:</strong> ${ticket.owner_name}</p>
    <p><strong>Email:</strong> ${ticket.owner_email}</p>
    ` : ''}

    <p><strong>Dispositivo:</strong> ${ticket.device_brand} ${ticket.device_model}</p>
    <p><strong>Descrição:</strong> ${ticket.description}</p>

    ${ticket.media_url ? `
    <h3>Mídia enviada</h3>
    <img src="${ticket.media_url}" style="max-width:100%;border-radius:10px;">
    ` : ''}

    <h3>Histórico</h3>
    <ul>
      ${ticket.history.map(h => `
      <li>${h.created_at}: ${h.status} - ${h.note}</li>
      `).join('')}
    </ul>

    <button class="btn-secondary mt-4" onclick="closeModal()">Fechar</button>
  `);
}

  const supportCard = target.closest('.support-card');
  if (supportCard) {
    state.currentSupport = state.supports.find(s => s.id == supportCard.dataset.supportId);
    renderScreen('dashboard', 'support-detail');
  }
});

// ===== INICIALIZAÇÃO =====
checkAuth();
