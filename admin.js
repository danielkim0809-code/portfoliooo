(() => {
  'use strict';

  // 브라우저에 공개해도 되는 키입니다. 관리자 권한은 서버의 RLS가 확인합니다.
  const SUPABASE_URL = 'https://pdsmuqhekfioqpqmxqgb.supabase.co';
  const SUPABASE_PUBLIC_KEY = 'sb_publishable_jMVtRMOfSSPYSJIC8ZbcoQ_e-px4zYW';
  const SESSION_KEY = 'resume.admin.session.v1';
  const PAGE_SIZE = 1000;
  const MAX_FILE_SIZE = 10 * 1024 * 1024;
  const REQUEST_TIMEOUT = 20000;
  const PROFILE_FIELDS = ['name', 'title', 'career_badge', 'email', 'phone', 'location', 'headline', 'intro', 'education', 'skills', 'experience', 'quote', 'photo_url'];
  const PROJECT_FIELDS = ['id', 'number', 'category', 'title', 'description', 'tags', 'thumbnail_url', 'file_url', 'sort_order'];
  const FILE_TYPES = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', pdf: 'application/pdf' };
  const $ = (selector) => document.querySelector(selector);
  const elements = {
    loginForm: $('#login-form'), loginEmail: $('#login-email'), loginPassword: $('#login-password'),
    loginButton: $('#login-button'), loginStatus: $('#login-status'), authPanel: $('#auth-panel'),
    adminPanel: $('#admin-panel'), logoutButton: $('#logout-button'), sessionLabel: $('#session-label'),
    adminStatus: $('#admin-status'), refreshButton: $('#refresh-admin-button'),
    profileForm: $('#profile-form'), profilePhoto: $('#profile-photo-file'), profilePreview: $('#profile-preview'),
    profilePlaceholder: $('#profile-photo-placeholder'), profileSave: $('#profile-save-button'),
    profileDelete: $('#profile-delete-button'), profileStatus: $('#profile-status'),
    projectsList: $('#projects-list'), projectAdd: $('#project-add-button'), projectForm: $('#project-form'),
    projectEditorTitle: $('#project-editor-title'), projectThumbnail: $('#project-thumbnail-file'),
    projectAttachment: $('#project-attachment-file'), projectPreview: $('#project-thumbnail-preview'),
    projectPlaceholder: $('#project-thumbnail-placeholder'), projectAttachmentLink: $('#project-attachment-link'),
    projectSave: $('#project-save-button'), projectCancel: $('#project-cancel-button'), projectStatus: $('#project-status'),
    likesList: $('#likes-list'), likesStatus: $('#likes-status'), guestbookList: $('#admin-guestbook-list'),
    guestbookStatus: $('#admin-guestbook-status'),
  };
  const state = {
    epoch: 0, session: null, user: null, verified: false, refreshTokenPromise: null,
    controllers: new Set(), loginPending: false, mutation: false, loadPromise: null,
    profile: null, projects: [], likes: new Map(), guestbook: [], profileDirty: false,
    projectDirty: false, projectOrderDirty: false, dataRevision: 0,
    objectUrls: new Map(), permissions: new WeakMap(),
  };

  class PageError extends Error {
    constructor(message, options = {}) {
      super(message);
      Object.assign(this, options);
    }
  }

  function status(element, message = '', isError = false) {
    element.textContent = message;
    element.classList.toggle('is-error', isError);
    element.hidden = !message;
  }

  function field(form, name) { return form.elements.namedItem(name); }
  function value(form, name) { return String(field(form, name).value || '').trim(); }
  function current(epoch) { return epoch === state.epoch; }
  function assertCurrent(epoch) {
    if (!current(epoch)) throw new PageError('', { stale: true });
  }

  function safeUrl(input) {
    const text = String(input || '').trim();
    if (!text) return null;
    try {
      const url = new URL(text);
      if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null;
      return url.href;
    } catch { return null; }
  }

  function validatedUrl(input, label) {
    if (!String(input || '').trim()) return null;
    const url = safeUrl(input);
    if (!url) throw new PageError(`${label}에는 http 또는 https로 시작하는 주소를 넣어 주세요.`);
    return url;
  }

  function createNode(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = String(text);
    return node;
  }

  function actionButton(label, action, danger = false) {
    const button = createNode('button', `admin-button admin-button-small ${danger ? 'admin-button-danger' : 'admin-button-secondary'}`, label);
    button.type = 'button';
    button.addEventListener('click', action);
    return button;
  }

  function emptyMessage(container, text, tag = 'p') {
    container.replaceChildren(createNode(tag, 'admin-empty', text));
  }

  function preview(image, placeholder, url, alt, objectUrl = false) {
    image.onload = null;
    image.onerror = null;
    image.hidden = true;
    placeholder.hidden = false;
    image.alt = alt;
    const destination = objectUrl ? url : safeUrl(url);
    if (!destination) { image.removeAttribute('src'); return; }
    image.onload = () => { image.hidden = false; placeholder.hidden = true; };
    image.onerror = () => { image.hidden = true; placeholder.hidden = false; };
    image.src = destination;
  }

  function revokePreview(name) {
    const previous = state.objectUrls.get(name);
    if (previous) URL.revokeObjectURL(previous);
    state.objectUrls.delete(name);
  }

  function updateProfilePreview() {
    revokePreview('profile');
    const file = elements.profilePhoto.files[0];
    const url = file ? URL.createObjectURL(file) : value(elements.profileForm, 'photo_url');
    if (file) state.objectUrls.set('profile', url);
    preview(elements.profilePreview, elements.profilePlaceholder, url, '프로필 사진 미리보기', Boolean(file));
  }

  function updateProjectPreview() {
    revokePreview('project');
    const file = elements.projectThumbnail.files[0];
    const url = file ? URL.createObjectURL(file) : value(elements.projectForm, 'thumbnail_url');
    if (file) state.objectUrls.set('project', url);
    preview(elements.projectPreview, elements.projectPlaceholder, url, '썸네일 미리보기', Boolean(file));
    const attachment = safeUrl(value(elements.projectForm, 'file_url'));
    elements.projectAttachmentLink.hidden = !attachment;
    if (attachment) {
      elements.projectAttachmentLink.href = attachment;
      elements.projectAttachmentLink.target = '_blank';
      elements.projectAttachmentLink.rel = 'noopener noreferrer';
    } else elements.projectAttachmentLink.removeAttribute('href');
  }

  function persistSession() {
    try {
      if (state.session && state.verified) sessionStorage.setItem(SESSION_KEY, JSON.stringify(state.session));
      else sessionStorage.removeItem(SESSION_KEY);
    } catch { /* 저장 공간이 막혀 있어도 현재 탭에서는 로그인할 수 있습니다. */ }
  }

  function tokenData(data) {
    if (!data || typeof data.access_token !== 'string' || !data.access_token || typeof data.refresh_token !== 'string' || !data.refresh_token) {
      throw new PageError('로그인 정보를 확인하지 못했습니다. 다시 로그인해 주세요.');
    }
    const expiresAt = Number(data.expires_at) || Math.floor(Date.now() / 1000) + Number(data.expires_in || 0);
    if (!Number.isFinite(expiresAt) || expiresAt <= 0) throw new PageError('로그인 유효 시간을 확인하지 못했습니다. 다시 로그인해 주세요.');
    return { access_token: data.access_token, refresh_token: data.refresh_token, expires_at: expiresAt };
  }

  function resetProjectForm(project = null) {
    elements.projectForm.reset();
    for (const name of PROJECT_FIELDS) {
      const content = project ? project[name] : name === 'sort_order' ? nextOrder() : '';
      field(elements.projectForm, name).value = Array.isArray(content) ? content.join(', ') : content ?? '';
    }
    for (const control of elements.projectForm.querySelectorAll('input, textarea')) control.setCustomValidity('');
    elements.projectThumbnail.value = '';
    elements.projectAttachment.value = '';
    state.projectDirty = false;
    state.projectOrderDirty = false;
    elements.projectEditorTitle.textContent = project ? '포트폴리오 카드 수정' : '새 포트폴리오 카드';
    status(elements.projectStatus);
    updateProjectPreview();
  }

  function resetSession(message = '', isError = false) {
    state.epoch += 1;
    for (const controller of state.controllers) controller.abort();
    state.controllers.clear();
    state.session = null;
    state.user = null;
    state.verified = false;
    state.refreshTokenPromise = null;
    state.loginPending = false;
    state.mutation = false;
    state.loadPromise = null;
    state.profile = null;
    state.projects = [];
    state.likes = new Map();
    state.guestbook = [];
    state.profileDirty = false;
    state.projectDirty = false;
    state.dataRevision += 1;
    persistSession();
    for (const name of state.objectUrls.keys()) revokePreview(name);
    elements.adminPanel.hidden = true;
    elements.adminPanel.setAttribute('aria-busy', 'false');
    elements.authPanel.hidden = false;
    elements.logoutButton.hidden = true;
    elements.sessionLabel.textContent = '';
    elements.loginForm.reset();
    elements.loginPassword.value = '';
    elements.loginButton.disabled = false;
    elements.loginButton.setAttribute('aria-busy', 'false');
    elements.loginButton.textContent = '로그인';
    for (const form of [elements.profileForm, elements.projectForm]) {
      form.reset();
      for (const control of form.querySelectorAll('input, textarea, button')) {
        control.disabled = false;
        if (typeof control.setCustomValidity === 'function') control.setCustomValidity('');
      }
    }
    field(elements.profileForm, 'id').value = '1';
    for (const name of [...PROFILE_FIELDS, 'updated_at']) field(elements.profileForm, name).value = '';
    elements.profilePhoto.value = '';
    elements.profileDelete.hidden = true;
    resetProjectForm();
    preview(elements.profilePreview, elements.profilePlaceholder, null, '프로필 사진 미리보기');
    elements.projectsList.replaceChildren();
    elements.likesList.replaceChildren();
    elements.guestbookList.replaceChildren();
    for (const element of [elements.adminStatus, elements.profileStatus, elements.projectStatus, elements.likesStatus, elements.guestbookStatus]) status(element);
    elements.refreshButton.disabled = false;
    elements.projectAdd.disabled = false;
    status(elements.loginStatus, message, isError);
    return state.epoch;
  }

  function userMessage(error, fallback) {
    if (error.stale) return '';
    if (error.status === 403 || error.code === '42501') return '권한이 없습니다. Supabase의 관리자 등록과 접근 규칙을 확인해 주세요.';
    if (error.uncertain) return '요청 결과를 확인하지 못했습니다. 새로고침으로 실제 결과를 확인한 뒤 다시 시도해 주세요.';
    return error.message || fallback;
  }

  async function fetchApi(path, options = {}, epoch = state.epoch) {
    assertCurrent(epoch);
    const controller = new AbortController();
    state.controllers.add(controller);
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
    try {
      const headers = { apikey: SUPABASE_PUBLIC_KEY, ...options.headers };
      const response = await fetch(`${SUPABASE_URL}${path}`, { ...options, headers, signal: controller.signal });
      const raw = await response.text();
      assertCurrent(epoch);
      let data = null;
      if (raw) {
        try { data = JSON.parse(raw); }
        catch { if (response.ok) throw new PageError('서버 응답을 읽지 못했습니다.', { uncertain: options.method && options.method !== 'GET' }); }
      }
      if (!response.ok) {
        // 서버의 원문 오류에는 계정 정보가 섞일 수 있어 화면이나 콘솔에 내보내지 않습니다.
        throw new PageError(response.status >= 500 ? '서버 연결이 원활하지 않습니다. 잠시 후 다시 시도해 주세요.' : '요청을 처리하지 못했습니다. 입력 내용과 연결 상태를 확인해 주세요.', {
          status: response.status, code: data?.code, uncertain: response.status >= 500 && options.method && options.method !== 'GET',
        });
      }
      const total = Number((response.headers.get('Content-Range') || '').split('/')[1]);
      return { data, total: Number.isFinite(total) ? total : null };
    } catch (error) {
      if (!current(epoch)) throw new PageError('', { stale: true });
      if (error instanceof PageError) throw error;
      throw new PageError('서버에 연결하지 못했습니다. 인터넷 연결을 확인하고 다시 시도해 주세요.', { uncertain: Boolean(options.method && options.method !== 'GET') });
    } finally {
      clearTimeout(timer);
      state.controllers.delete(controller);
    }
  }

  async function freshToken(epoch) {
    assertCurrent(epoch);
    if (!state.session) throw new PageError('먼저 로그인해 주세요.');
    if (state.session.expires_at * 1000 > Date.now() + 60000) return state.session.access_token;
    if (!state.refreshTokenPromise) {
      const refreshToken = state.session.refresh_token;
      const promise = (async () => {
        try {
          const { data } = await fetchApi('/auth/v1/token?grant_type=refresh_token', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: refreshToken }),
          }, epoch);
          assertCurrent(epoch);
          state.session = tokenData(data);
          persistSession();
          return state.session.access_token;
        } catch (error) {
          if (current(epoch) && [400, 401, 403].includes(error.status)) resetSession('로그인 시간이 지났습니다. 다시 로그인해 주세요.', true);
          throw error;
        } finally {
          if (current(epoch) && state.refreshTokenPromise === promise) state.refreshTokenPromise = null;
        }
      })();
      state.refreshTokenPromise = promise;
    }
    return state.refreshTokenPromise;
  }

  async function authenticated(path, options = {}, epoch = state.epoch, verification = false) {
    assertCurrent(epoch);
    if (!verification && !state.verified) throw new PageError('관리자만 쓸 수 있어요');
    const token = await freshToken(epoch);
    assertCurrent(epoch);
    try {
      return await fetchApi(path, { ...options, headers: { ...options.headers, Authorization: `Bearer ${token}` } }, epoch);
    } catch (error) {
      if (error.status === 401 && current(epoch)) resetSession('로그인 시간이 지났습니다. 다시 로그인해 주세요.', true);
      throw error;
    }
  }

  function db(table, params = {}, options = {}, epoch = state.epoch, verification = false) {
    const query = new URLSearchParams(params);
    const { body, ...rest } = options;
    const headers = { 'Content-Type': 'application/json', ...rest.headers };
    return authenticated(`/rest/v1/${table}?${query}`, { ...rest, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) }, epoch, verification);
  }

  async function readAll(table, params, epoch = state.epoch) {
    const rows = [];
    let offset = 0;
    while (true) {
      const { data, total } = await db(table, { ...params, limit: PAGE_SIZE, offset }, { headers: { Prefer: 'count=exact' } }, epoch);
      if (!Array.isArray(data)) throw new PageError('목록을 읽지 못했습니다. 다시 불러와 주세요.');
      rows.push(...data);
      offset += data.length;
      if (!data.length || (total !== null ? offset >= total : data.length < PAGE_SIZE)) break;
    }
    return rows;
  }

  async function verifyAdmin(epoch) {
    const { data: user } = await authenticated('/auth/v1/user', {}, epoch, true);
    if (!user || typeof user.id !== 'string') throw new PageError('로그인 계정을 확인하지 못했습니다. 다시 로그인해 주세요.');
    // 데이터베이스와 보관함의 접근 규칙이 사용하는 함수로 같은 권한을 확인합니다.
    const { data: isAdmin } = await authenticated('/rest/v1/rpc/resume_is_admin', {}, epoch, true);
    assertCurrent(epoch);
    if (isAdmin !== true) {
      const email = typeof user.email === 'string' ? user.email : elements.loginEmail.value.trim();
      resetSession(`관리자만 쓸 수 있어요. ${email ? email + ' 계정의 ' : ''}관리자 등록을 Supabase에서 확인해 주세요.`, true);
      elements.loginEmail.value = email;
      throw new PageError('', { stale: true });
    }
    state.user = user;
    state.verified = true;
    persistSession();
  }

  function showAdmin() {
    elements.authPanel.hidden = true;
    elements.adminPanel.hidden = false;
    elements.logoutButton.hidden = false;
    elements.sessionLabel.textContent = state.user?.email || '관리자';
    status(elements.loginStatus);
    elements.loginPassword.value = '';
  }

  async function login() {
    if (state.loginPending) return;
    const email = elements.loginEmail.value.trim();
    const password = elements.loginPassword.value;
    elements.loginEmail.setCustomValidity(email ? '' : '이메일을 입력해 주세요.');
    elements.loginPassword.setCustomValidity(password ? '' : '비밀번호를 입력해 주세요.');
    if (!elements.loginForm.reportValidity()) return;
    const epoch = resetSession();
    elements.loginEmail.value = email;
    state.loginPending = true;
    elements.loginButton.disabled = true;
    elements.loginButton.setAttribute('aria-busy', 'true');
    elements.loginButton.textContent = '확인 중…';
    status(elements.loginStatus, '로그인과 관리자 권한을 확인하고 있습니다.');
    try {
      const { data } = await fetchApi('/auth/v1/token?grant_type=password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }),
      }, epoch);
      state.session = tokenData(data);
      await verifyAdmin(epoch);
      assertCurrent(epoch);
      showAdmin();
      await loadAll(epoch);
    } catch (error) {
      if (!current(epoch) || error.stale) return;
      const message = error.status === 400 ? '이메일 또는 비밀번호를 확인해 주세요.' : userMessage(error, '로그인하지 못했습니다. 잠시 후 다시 시도해 주세요.');
      resetSession(message, true);
      elements.loginEmail.value = email;
    } finally {
      if (current(epoch)) {
        state.loginPending = false;
        elements.loginButton.disabled = false;
        elements.loginButton.setAttribute('aria-busy', 'false');
        elements.loginButton.textContent = '로그인';
      }
    }
  }

  async function logout() {
    const token = state.session?.access_token;
    const epoch = resetSession('로그아웃했습니다.');
    elements.loginEmail.focus();
    if (!token) return;
    try {
      // local은 현재 로그인 세션만 종료합니다. 다른 기기의 로그인은 유지합니다.
      await fetchApi('/auth/v1/logout?scope=local', { method: 'POST', headers: { Authorization: `Bearer ${token}` } }, epoch);
    } catch (error) {
      if (current(epoch) && !error.stale && error.status !== 401) status(elements.loginStatus, '이 탭에서는 로그아웃했습니다. 서버 세션 종료는 연결 상태 때문에 확인하지 못했습니다.', true);
    }
  }

  function renderProfile(profile) {
    state.profile = profile;
    elements.profileDelete.hidden = !profile;
    if (state.profileDirty) return;
    field(elements.profileForm, 'id').value = '1';
    for (const name of PROFILE_FIELDS) field(elements.profileForm, name).value = profile?.[name] ?? '';
    field(elements.profileForm, 'updated_at').value = profile?.updated_at ?? '';
    updateProfilePreview();
  }

  function nextOrder() {
    const last = state.projects.reduce((max, project) => Math.max(max, Number(project.sort_order) || 0), 0);
    return last < 2147483647 ? last + 1 : last;
  }

  function countFor(id) { return state.likes.get(String(id)) || 0; }

  function renderProjects() {
    const fragment = document.createDocumentFragment();
    state.projects.forEach((project, index) => {
      const card = createNode('article', 'admin-project-card');
      const imageContainer = createNode('div', 'admin-project-preview');
      const imageUrl = safeUrl(project.thumbnail_url);
      const placeholder = createNode('span', 'admin-project-image-placeholder', '이미지 없음');
      if (imageUrl) {
        const image = createNode('img');
        image.alt = `${project.title || '포트폴리오'} 썸네일`;
        image.loading = 'lazy';
        image.hidden = true;
        image.onload = () => { image.hidden = false; placeholder.hidden = true; };
        image.onerror = () => { image.hidden = true; placeholder.hidden = false; };
        image.src = imageUrl;
        imageContainer.append(image);
      }
      imageContainer.append(placeholder);
      const info = createNode('div', 'admin-project-info');
      info.append(createNode('p', 'admin-project-category', [project.number, project.category].filter(Boolean).join(' · ')));
      info.append(createNode('h3', 'admin-project-title', project.title || '제목 없음'));
      info.append(createNode('p', 'admin-project-meta', `순서 ${project.sort_order} · 좋아요 ${countFor(project.id)}개`));
      const tags = createNode('p', 'admin-project-tags', Array.isArray(project.tags) ? project.tags.join(' · ') : '');
      info.append(tags);
      const actions = createNode('div', 'admin-project-actions');
      const edit = actionButton('수정', () => editProject(project.id));
      const up = actionButton('위로', () => moveProject(project.id, -1));
      const down = actionButton('아래로', () => moveProject(project.id, 1));
      up.disabled = index === 0;
      down.disabled = index === state.projects.length - 1;
      actions.append(edit, up, down, actionButton('삭제', () => deleteProject(project.id), true));
      info.append(actions);
      card.append(imageContainer, info);
      fragment.append(card);
    });
    elements.projectsList.replaceChildren(fragment);
    if (!state.projects.length) emptyMessage(elements.projectsList, '등록된 카드가 없습니다. 새 카드를 추가해 주세요.');
    renderLikes();
  }

  function renderLikes() {
    const fragment = document.createDocumentFragment();
    for (const project of state.projects) {
      const row = createNode('div', 'admin-like-row');
      const title = createNode('strong', 'admin-like-title', project.title || '제목 없음');
      const count = createNode('span', 'admin-like-count', `${countFor(project.id)}개`);
      const reset = actionButton('좋아요 초기화', () => resetLikes(project.id), true);
      row.append(title, count, reset);
      fragment.append(row);
    }
    elements.likesList.replaceChildren(fragment);
    if (!state.projects.length) emptyMessage(elements.likesList, '포트폴리오 카드를 추가하면 좋아요 수가 여기에 보입니다.');
  }

  function renderGuestbook() {
    const fragment = document.createDocumentFragment();
    for (const entry of state.guestbook) {
      const item = createNode('li', 'admin-guestbook-entry');
      const header = createNode('div', 'admin-guestbook-header');
      header.append(createNode('strong', 'admin-guestbook-name', entry.nickname));
      const date = new Date(entry.created_at);
      if (!Number.isNaN(date.getTime())) {
        const time = createNode('time', 'admin-guestbook-time', new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Seoul' }).format(date));
        time.dateTime = date.toISOString();
        header.append(time);
      }
      header.append(actionButton('삭제', () => deleteGuestbook(entry.id), true));
      item.append(header, createNode('p', 'admin-guestbook-message', entry.message));
      fragment.append(item);
    }
    elements.guestbookList.replaceChildren(fragment);
    if (!state.guestbook.length) emptyMessage(elements.guestbookList, '아직 등록된 방명록 글이 없습니다.', 'li');
  }

  async function loadSnapshot(epoch) {
    const [profile, projects, likes, guestbook] = await Promise.all([
      db('profile', { select: '*', id: 'eq.1', limit: 1 }, {}, epoch),
      readAll('projects', { select: '*', order: 'sort_order.asc,id.asc' }, epoch),
      readAll('likes', { select: 'id,project_id', order: 'id.asc' }, epoch),
      readAll('resume_guestbook', { select: 'id,nickname,message,created_at', order: 'created_at.desc,id.desc' }, epoch),
    ]);
    const counts = new Map();
    for (const like of likes) {
      const id = String(like.project_id);
      counts.set(id, (counts.get(id) || 0) + 1);
    }
    return { profile: profile.data?.[0] || null, projects, counts, guestbook };
  }

  function applySnapshot(snapshot) {
    renderProfile(snapshot.profile);
    state.projects = snapshot.projects;
    state.likes = snapshot.counts;
    state.guestbook = snapshot.guestbook;
    renderProjects();
    renderGuestbook();
    if (!state.projectDirty && !value(elements.projectForm, 'id')) field(elements.projectForm, 'sort_order').value = nextOrder();
  }

  async function loadAll(epoch = state.epoch) {
    if (!state.verified || state.mutation) return;
    if (state.loadPromise) return state.loadPromise;
    const revision = state.dataRevision;
    elements.refreshButton.disabled = true;
    status(elements.adminStatus, '최신 내용을 불러오고 있습니다.');
    const promise = (async () => {
      try {
        await verifyAdmin(epoch);
        const snapshot = await loadSnapshot(epoch);
        assertCurrent(epoch);
        if (revision !== state.dataRevision) return;
        applySnapshot(snapshot);
        status(elements.adminStatus, '최신 내용을 불러왔습니다. 작성 중인 내용은 그대로 두었습니다.');
      } catch (error) {
        if (current(epoch) && !error.stale) status(elements.adminStatus, userMessage(error, '내용을 불러오지 못했습니다. 다시 불러오기를 눌러 주세요.'), true);
      } finally {
        if (current(epoch) && state.loadPromise === promise) {
          state.loadPromise = null;
          elements.refreshButton.disabled = false;
        }
      }
    })();
    state.loadPromise = promise;
    return promise;
  }

  function lockAdmin(locked) {
    for (const control of elements.adminPanel.querySelectorAll('input, textarea, select, button')) {
      if (locked) {
        state.permissions.set(control, control.disabled);
        control.disabled = true;
      } else if (state.permissions.has(control)) {
        control.disabled = state.permissions.get(control);
        state.permissions.delete(control);
      }
    }
    elements.adminPanel.setAttribute('aria-busy', String(locked));
  }

  async function mutate(target, working, operation) {
    if (!state.verified || state.mutation) return;
    const epoch = state.epoch;
    state.mutation = true;
    state.dataRevision += 1;
    lockAdmin(true);
    status(target, working);
    try {
      const message = await operation(epoch);
      assertCurrent(epoch);
      status(target, message || '저장했습니다.');
      try {
        const snapshot = await loadSnapshot(epoch);
        assertCurrent(epoch);
        applySnapshot(snapshot);
        status(elements.adminStatus, '최신 내용을 불러왔습니다.');
      } catch (error) {
        if (current(epoch) && !error.stale) status(elements.adminStatus, '변경 요청은 완료했습니다. 목록을 다시 읽지 못했으니 다시 불러오기를 눌러 확인해 주세요.', true);
      }
    } catch (error) {
      if (current(epoch) && !error.stale) status(target, userMessage(error, '변경하지 못했습니다. 잠시 후 다시 시도해 주세요.'), true);
    } finally {
      if (current(epoch)) {
        state.mutation = false;
        lockAdmin(false);
        // 방금 새로 그린 버튼은 잠금 이전 상태가 없으므로 끝 위치를 다시 계산합니다.
        elements.refreshButton.disabled = false;
      }
    }
  }

  function checkFile(file, imageOnly = false) {
    if (!file) return null;
    if (!file.size) throw new PageError('빈 파일은 올릴 수 없습니다. 다른 파일을 골라 주세요.');
    if (file.size > MAX_FILE_SIZE) throw new PageError('파일은 10MB까지 올릴 수 있습니다. 더 작은 파일을 골라 주세요.');
    const extension = (file.name.split('.').pop() || '').toLowerCase();
    const mime = FILE_TYPES[extension];
    if (!mime || (imageOnly && mime === 'application/pdf') || (file.type && file.type.toLowerCase() !== mime)) {
      throw new PageError(imageOnly ? '사진은 PNG, JPEG, WebP, GIF 이미지 파일을 골라 주세요.' : 'PNG, JPEG, WebP, GIF 이미지 또는 PDF 파일을 골라 주세요.');
    }
    return { extension: extension === 'jpeg' ? 'jpg' : extension, mime };
  }

  async function checkFileContents(file, info) {
    const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
    const text = String.fromCharCode(...bytes);
    const matches = info.mime === 'image/png' ? [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte)
      : info.mime === 'image/jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
        : info.mime === 'image/webp' ? text.startsWith('RIFF') && text.slice(8, 12) === 'WEBP'
          : info.mime === 'image/gif' ? text.startsWith('GIF87a') || text.startsWith('GIF89a')
            : text.startsWith('%PDF-');
    if (!matches) throw new PageError('파일 내용이 확장자와 맞지 않습니다. 정상적인 이미지 또는 PDF 파일을 골라 주세요.');
  }

  async function uploadFile(file, folder, info, epoch) {
    assertCurrent(epoch);
    if (!['profile', 'projects'].includes(folder)) throw new PageError('파일 보관 위치가 올바르지 않습니다.');
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    const filename = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    const path = `${folder}/${filename}.${info.extension}`;
    await authenticated(`/storage/v1/object/resume/${path}`, {
      method: 'POST', headers: { 'Content-Type': info.mime, 'x-upsert': 'false' }, body: file,
    }, epoch);
    return `${SUPABASE_URL}/storage/v1/object/public/resume/${path}`;
  }

  function requireRows(result, id, message) {
    const rows = result.data;
    if (!Array.isArray(rows) || !rows.some((row) => String(row.id) === String(id))) throw new PageError(message || '변경된 내용을 확인하지 못했습니다. 관리자 등록과 접근 규칙을 확인해 주세요.');
    return rows.find((row) => String(row.id) === String(id));
  }

  async function saveProfile() {
    if (state.mutation) return;
    let info;
    try {
      info = checkFile(elements.profilePhoto.files[0], true);
      validatedUrl(value(elements.profileForm, 'photo_url'), '프로필 사진 주소');
      if (!elements.profileForm.reportValidity()) return;
    } catch (error) { status(elements.profileStatus, userMessage(error, '파일을 확인해 주세요.'), true); return; }
    const file = elements.profilePhoto.files[0];
    await mutate(elements.profileStatus, '프로필을 저장하고 있습니다.', async (epoch) => {
      const payload = Object.fromEntries(PROFILE_FIELDS.map((name) => [name, value(elements.profileForm, name)]));
      payload.photo_url = validatedUrl(payload.photo_url, '프로필 사진 주소');
      let uploaded = false;
      if (file) {
        await checkFileContents(file, info);
        assertCurrent(epoch);
        payload.photo_url = await uploadFile(file, 'profile', info, epoch);
        assertCurrent(epoch);
        field(elements.profileForm, 'photo_url').value = payload.photo_url;
        elements.profilePhoto.value = '';
        updateProfilePreview();
        uploaded = true;
      }
      payload.updated_at = new Date().toISOString();
      try {
        // 없는 프로필만 새로 추가하고, 기존 프로필은 1번 행을 고칩니다.
        const { data: existing } = await db('profile', { select: 'id', id: 'eq.1', limit: 1 }, {}, epoch);
        const result = await db('profile', { select: '*', ...(existing?.length ? { id: 'eq.1' } : {}) }, {
          method: existing?.length ? 'PATCH' : 'POST', headers: { Prefer: 'return=representation' }, body: existing?.length ? payload : { id: 1, ...payload },
        }, epoch);
        const saved = requireRows(result, 1);
        state.profileDirty = false;
        renderProfile(saved);
        return '프로필을 저장했습니다. 방문자 화면에서 바로 확인할 수 있습니다.';
      } catch (error) {
        if (uploaded && !error.stale) throw new PageError(`${userMessage(error, '프로필을 저장하지 못했습니다.')} 사진은 올라갔고 주소를 폼에 남겼습니다. 결과를 확인한 뒤 저장을 다시 눌러 주세요.`);
        throw error;
      }
    });
  }

  async function deleteProfile() {
    if (!state.verified || state.mutation || !state.profile) return;
    if (!window.confirm('프로필 글과 사진을 방문자 화면에서 지울까요? 프로필 저장으로 다시 등록할 수 있습니다.')) return;
    await mutate(elements.profileStatus, '프로필을 삭제하고 있습니다.', async (epoch) => {
      const result = await db('profile', { id: 'eq.1', select: 'id' }, {
        method: 'DELETE', headers: { Prefer: 'return=representation' },
      }, epoch);
      requireRows(result, 1, '삭제된 프로필을 확인하지 못했습니다. 이미 지워졌거나 관리자 권한이 없을 수 있습니다.');
      elements.profilePhoto.value = '';
      state.profileDirty = false;
      renderProfile(null);
      return '프로필을 삭제했습니다. 프로필 저장을 누르면 다시 등록할 수 있습니다.';
    });
  }

  function editProject(id) {
    if (state.mutation) return;
    const project = state.projects.find((item) => String(item.id) === String(id));
    if (!project) return;
    if (state.projectDirty && !window.confirm('작성 중인 카드 내용을 버리고 다른 카드를 수정할까요?')) return;
    resetProjectForm(project);
    elements.projectForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
    field(elements.projectForm, 'title').focus({ preventScroll: true });
  }

  function newProject() {
    if (state.mutation) return;
    if (state.projectDirty && !window.confirm('작성 중인 카드 내용을 버리고 새 카드를 만들까요?')) return;
    resetProjectForm();
    elements.projectForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
    field(elements.projectForm, 'title').focus({ preventScroll: true });
  }

  async function saveProject() {
    if (state.mutation) return;
    let thumbnailInfo;
    let attachmentInfo;
    let payload;
    try {
      field(elements.projectForm, 'title').setCustomValidity(value(elements.projectForm, 'title') ? '' : '제목을 입력해 주세요.');
      if (!elements.projectForm.reportValidity()) return;
      const sortOrder = Number(value(elements.projectForm, 'sort_order'));
      if (!value(elements.projectForm, 'sort_order') || !Number.isInteger(sortOrder) || sortOrder < -2147483648 || sortOrder > 2147483647) throw new PageError('순서는 정수로 입력해 주세요.');
      thumbnailInfo = checkFile(elements.projectThumbnail.files[0], true);
      attachmentInfo = checkFile(elements.projectAttachment.files[0]);
      payload = {
        number: value(elements.projectForm, 'number'), category: value(elements.projectForm, 'category'), title: value(elements.projectForm, 'title'),
        description: value(elements.projectForm, 'description'), tags: value(elements.projectForm, 'tags').split(/[,\n]+/).map((tag) => tag.trim()).filter(Boolean),
        thumbnail_url: validatedUrl(value(elements.projectForm, 'thumbnail_url'), '썸네일 주소'),
        file_url: validatedUrl(value(elements.projectForm, 'file_url'), '첨부 파일 주소'), sort_order: sortOrder,
      };
    } catch (error) { status(elements.projectStatus, userMessage(error, '입력 내용과 파일을 확인해 주세요.'), true); return; }
    const id = value(elements.projectForm, 'id');
    const thumbnail = elements.projectThumbnail.files[0];
    const attachment = elements.projectAttachment.files[0];
    await mutate(elements.projectStatus, '카드를 저장하고 있습니다.', async (epoch) => {
      // 둘 다 먼저 검사하므로 두 번째 파일 오류 때문에 첫 번째만 올라가지 않습니다.
      if (thumbnail) await checkFileContents(thumbnail, thumbnailInfo);
      if (attachment) await checkFileContents(attachment, attachmentInfo);
      assertCurrent(epoch);
      let uploaded = false;
      try {
        if (thumbnail) {
          payload.thumbnail_url = await uploadFile(thumbnail, 'projects', thumbnailInfo, epoch);
          assertCurrent(epoch);
          field(elements.projectForm, 'thumbnail_url').value = payload.thumbnail_url;
          elements.projectThumbnail.value = '';
          updateProjectPreview();
          uploaded = true;
        }
        if (attachment) {
          payload.file_url = await uploadFile(attachment, 'projects', attachmentInfo, epoch);
          assertCurrent(epoch);
          field(elements.projectForm, 'file_url').value = payload.file_url;
          elements.projectAttachment.value = '';
          updateProjectPreview();
          uploaded = true;
        }
        const result = await db('projects', { select: '*', ...(id ? { id: `eq.${id}` } : {}) }, {
          method: id ? 'PATCH' : 'POST', headers: { Prefer: 'return=representation' }, body: payload,
        }, epoch);
        const saved = id ? requireRows(result, id) : result.data?.[0];
        if (!saved?.id) throw new PageError('저장된 카드를 확인하지 못했습니다. 다시 불러오기로 목록을 확인해 주세요.');
        resetProjectForm(saved);
        return id ? '카드를 수정했습니다. 방문자 화면에서 확인해 주세요.' : '카드를 추가했습니다. 방문자 화면에서 확인해 주세요.';
      } catch (error) {
        if (uploaded && !error.stale) throw new PageError(`${userMessage(error, '카드를 저장하지 못했습니다.')} 올라간 파일 주소는 폼에 남겼습니다. 목록을 확인한 뒤 저장을 다시 눌러 주세요.`);
        throw error;
      }
    });
  }

  async function deleteProject(id) {
    if (state.mutation) return;
    const project = state.projects.find((item) => String(item.id) === String(id));
    if (!project || !window.confirm(`“${project.title}” 카드를 삭제할까요? 이 카드의 좋아요도 함께 지워집니다.`)) return;
    await mutate(elements.projectStatus, '카드를 삭제하고 있습니다.', async (epoch) => {
      const result = await db('projects', { id: `eq.${id}`, select: 'id' }, { method: 'DELETE', headers: { Prefer: 'return=representation' } }, epoch);
      requireRows(result, id, '삭제된 카드를 확인하지 못했습니다. 이미 지워졌거나 관리자 권한이 없을 수 있습니다.');
      if (value(elements.projectForm, 'id') === String(id)) resetProjectForm();
      return '카드를 삭제했습니다.';
    });
  }

  async function moveProject(id, direction) {
    if (state.mutation) return;
    await mutate(elements.projectStatus, '카드 순서를 바꾸고 있습니다.', async (epoch) => {
      const ordered = await readAll('projects', { select: '*', order: 'sort_order.asc,id.asc' }, epoch);
      const from = ordered.findIndex((project) => String(project.id) === String(id));
      const to = from + direction;
      if (from < 0) throw new PageError('이 카드는 이미 삭제되었습니다. 다시 불러오기를 눌러 주세요.');
      if (to < 0 || to >= ordered.length) return '이미 맨 위 또는 맨 아래 카드입니다.';
      [ordered[from], ordered[to]] = [ordered[to], ordered[from]];
      let changed = 0;
      try {
        // 순서 숫자가 같은 카드도 확실히 이동하도록 현재 목록을 1, 2, 3…으로 정리합니다.
        for (let index = 0; index < ordered.length; index += 1) {
          const project = ordered[index];
          const sortOrder = index + 1;
          if (project.sort_order === sortOrder) continue;
          const result = await db('projects', { id: `eq.${project.id}`, select: 'id,sort_order' }, {
            method: 'PATCH', headers: { Prefer: 'return=representation' }, body: { sort_order: sortOrder },
          }, epoch);
          requireRows(result, project.id);
          changed += 1;
          if (value(elements.projectForm, 'id') === String(project.id) && !state.projectOrderDirty) field(elements.projectForm, 'sort_order').value = sortOrder;
        }
      } catch (error) {
        if (!current(epoch) || error.stale) throw error;
        try { applySnapshot(await loadSnapshot(epoch)); } catch { /* 다시 불러오기 안내를 유지합니다. */ }
        throw new PageError(changed || error.uncertain ? '순서 변경이 일부만 반영되었을 수 있습니다. 최신 목록을 확인하고 위로·아래로를 다시 눌러 주세요.' : userMessage(error, '순서를 바꾸지 못했습니다. 다시 시도해 주세요.'));
      }
      return '카드 순서를 바꿨습니다.';
    });
  }

  async function resetLikes(projectId) {
    if (state.mutation) return;
    const project = state.projects.find((item) => String(item.id) === String(projectId));
    if (!project || !window.confirm(`“${project.title}” 카드의 좋아요를 모두 지울까요?`)) return;
    await mutate(elements.likesStatus, '좋아요를 초기화하고 있습니다.', async (epoch) => {
      // 공개 읽기만 가능한 비관리자의 DELETE [] 응답을 성공으로 오해하지 않습니다.
      const before = await db('likes', { select: 'id', project_id: `eq.${projectId}`, limit: 1 }, { headers: { Prefer: 'count=exact' } }, epoch);
      if (before.total === 0 || !before.data?.length) return '이 카드에는 지울 좋아요가 없습니다.';
      const result = await db('likes', { project_id: `eq.${projectId}`, select: 'id' }, { method: 'DELETE', headers: { Prefer: 'return=representation,count=exact' } }, epoch);
      const removed = result.total !== null ? result.total : Array.isArray(result.data) ? result.data.length : 0;
      if (removed <= 0) throw new PageError('삭제된 좋아요를 확인하지 못했습니다. 관리자 등록과 접근 규칙을 확인해 주세요.');
      return `좋아요 ${removed}개를 지웠습니다. 이후 새로 누른 좋아요는 다시 표시됩니다.`;
    });
  }

  async function deleteGuestbook(id) {
    if (state.mutation || !window.confirm('이 방명록 글을 삭제할까요?')) return;
    await mutate(elements.guestbookStatus, '방명록 글을 삭제하고 있습니다.', async (epoch) => {
      const result = await db('resume_guestbook', { id: `eq.${id}`, select: 'id' }, { method: 'DELETE', headers: { Prefer: 'return=representation' } }, epoch);
      requireRows(result, id, '삭제된 글을 확인하지 못했습니다. 이미 지워졌거나 관리자 권한이 없을 수 있습니다.');
      return '방명록 글을 삭제했습니다.';
    });
  }

  function fileChanged(input, imageOnly, target, update) {
    try {
      checkFile(input.files[0], imageOnly);
      status(target);
      update();
    } catch (error) {
      input.value = '';
      update();
      status(target, userMessage(error, '파일을 확인해 주세요.'), true);
    }
  }

  elements.loginButton.addEventListener('click', login);
  elements.loginForm.addEventListener('submit', (event) => { event.preventDefault(); login(); });
  for (const input of [elements.loginEmail, elements.loginPassword]) input.addEventListener('input', () => input.setCustomValidity(''));
  elements.logoutButton.addEventListener('click', logout);
  elements.refreshButton.addEventListener('click', () => loadAll());
  elements.profileSave.addEventListener('click', saveProfile);
  elements.profileDelete.addEventListener('click', deleteProfile);
  elements.profileForm.addEventListener('submit', (event) => { event.preventDefault(); saveProfile(); });
  elements.profileForm.addEventListener('input', () => { state.profileDirty = true; });
  elements.profilePhoto.addEventListener('change', () => { state.profileDirty = true; fileChanged(elements.profilePhoto, true, elements.profileStatus, updateProfilePreview); });
  field(elements.profileForm, 'photo_url').addEventListener('input', updateProfilePreview);
  elements.projectAdd.addEventListener('click', newProject);
  elements.projectCancel.addEventListener('click', () => {
    if (state.mutation || (state.projectDirty && !window.confirm('작성 중인 카드 내용을 버릴까요?'))) return;
    resetProjectForm();
  });
  elements.projectSave.addEventListener('click', saveProject);
  elements.projectForm.addEventListener('submit', (event) => { event.preventDefault(); saveProject(); });
  elements.projectForm.addEventListener('input', (event) => {
    state.projectDirty = true;
    if (event.target.name === 'sort_order') state.projectOrderDirty = true;
    if (typeof event.target.setCustomValidity === 'function') event.target.setCustomValidity('');
  });
  elements.projectThumbnail.addEventListener('change', () => { state.projectDirty = true; fileChanged(elements.projectThumbnail, true, elements.projectStatus, updateProjectPreview); });
  elements.projectAttachment.addEventListener('change', () => { state.projectDirty = true; fileChanged(elements.projectAttachment, false, elements.projectStatus, updateProjectPreview); });
  for (const name of ['thumbnail_url', 'file_url']) field(elements.projectForm, name).addEventListener('input', updateProjectPreview);
  window.addEventListener('focus', () => loadAll());
  window.addEventListener('online', () => loadAll());
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') loadAll(); });

  async function start() {
    const epoch = resetSession();
    let saved;
    // 화면을 초기화하기 전에 읽어 둔 토큰으로 로그인 상태를 다시 확인합니다.
    try { saved = initialSession ? tokenData(initialSession) : null; } catch { saved = null; }
    if (!saved) return;
    state.session = saved;
    state.loginPending = true;
    elements.loginButton.disabled = true;
    status(elements.loginStatus, '이전 로그인 상태를 확인하고 있습니다.');
    try {
      await verifyAdmin(epoch);
      assertCurrent(epoch);
      showAdmin();
      await loadAll(epoch);
    } catch (error) {
      if (current(epoch) && !error.stale) resetSession(userMessage(error, '다시 로그인해 주세요.'), true);
    } finally {
      if (current(epoch)) { state.loginPending = false; elements.loginButton.disabled = false; }
    }
  }

  let initialSession = null;
  try { initialSession = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null'); } catch { /* 저장된 로그인이 없으면 로그인 폼을 사용합니다. */ }
  start();
})();
