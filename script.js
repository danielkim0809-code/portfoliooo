(() => {
  'use strict';

  // 이 키는 방문자에게 공개하는 Supabase 공개 키입니다. 비밀 키를 넣지 마세요.
  const SUPABASE_URL = 'https://pdsmuqhekfioqpqmxqgb.supabase.co';
  const SUPABASE_PUBLIC_KEY = 'sb_publishable_jMVtRMOfSSPYSJIC8ZbcoQ_e-px4zYW';
  const PAGE_SIZE = 1000;
  const REQUEST_TIMEOUT = 12000;
  const CLIENT_STORAGE_KEY = 'resume.client-id.v1';
  const $ = (selector) => document.querySelector(selector);

  const elements = {
    pageStatus: $('#page-status'),
    reload: $('#reload-button'),
    portfolio: $('#portfolio'),
    projectGrid: $('#projects-grid'),
    projectStatus: $('#project-status'),
    projectTemplate: $('#project-template'),
    guestbookForm: $('#guestbook-form'),
    nickname: $('#guestbook-nickname'),
    message: $('#guestbook-message'),
    guestbookSubmit: $('#guestbook-submit'),
    guestbookStatus: $('#guestbook-status'),
    guestbookList: $('#guestbook-list'),
  };

  const state = {
    profileSignature: null,
    projectsSignature: null,
    guestbookSignature: null,
    projects: [],
    counts: new Map(),
    liked: new Set(),
    pendingLikes: new Set(),
    projectElements: new Map(),
    errors: new Map(),
    likesLoaded: false,
    likesRevision: 0,
    guestbookRevision: 0,
    refreshPromise: null,
    guestbookPending: false,
  };

  function text(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  function setText(selector, value, fallback = '') {
    const element = $(selector);
    if (element) element.textContent = text(value) || fallback;
  }

  function setStatus(element, message, isError = false) {
    if (!element) return;
    element.textContent = message;
    element.classList.toggle('is-error', isError);
    element.hidden = !message;
  }

  function safeWebUrl(value) {
    try {
      const url = new URL(text(value));
      if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null;
      return url.href;
    } catch {
      return null;
    }
  }

  function createClientId() {
    if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  // localStorage를 사용할 수 없는 브라우저에서는 좋아요 저장 오류를 먼저 알립니다.
  // 새로고침마다 다른 식별자를 만들면 중복 좋아요가 생길 수 있기 때문입니다.
  function getClientId() {
    try {
      const saved = localStorage.getItem(CLIENT_STORAGE_KEY);
      if (saved && /^[A-Za-z0-9_-]{8,64}$/.test(saved)) return saved;
      const id = createClientId();
      localStorage.setItem(CLIENT_STORAGE_KEY, id);
      return localStorage.getItem(CLIENT_STORAGE_KEY) === id ? id : null;
    } catch {
      return null;
    }
  }

  const clientId = getClientId();

  class RequestError extends Error {
    constructor(status, uncertain = false) {
      super('Supabase 요청을 완료하지 못했습니다.');
      this.status = status;
      this.uncertain = uncertain;
    }
  }

  async function request(table, query = {}, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
    const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, String(value));

    try {
      const response = await fetch(url, {
        method: options.method || 'GET',
        headers: {
          apikey: SUPABASE_PUBLIC_KEY,
          ...(options.body ? { 'Content-Type': 'application/json', Prefer: 'return=representation' } : {}),
          ...options.headers,
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
        cache: 'no-store',
      });
      if (!response.ok) throw new RequestError(response.status);
      if (response.status === 204) return [];
      return await response.json();
    } catch (error) {
      if (error instanceof RequestError) throw error;
      throw new RequestError(0, options.method === 'POST');
    } finally {
      clearTimeout(timeout);
    }
  }

  // Supabase 기본 응답 한도(1,000줄)를 넘는 좋아요도 빠짐없이 셉니다.
  async function readAll(table, query) {
    const rows = [];
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const page = await request(table, { ...query, offset, limit: PAGE_SIZE });
      if (!Array.isArray(page)) throw new RequestError(0);
      rows.push(...page);
      if (page.length < PAGE_SIZE) return rows;
    }
  }

  function showImage(image, placeholder, value, alt) {
    if (!image || !placeholder) return;
    const url = safeWebUrl(value);
    image.hidden = true;
    placeholder.hidden = false;
    image.alt = alt;
    image.onload = () => {
      image.hidden = false;
      placeholder.hidden = true;
    };
    image.onerror = () => {
      image.hidden = true;
      placeholder.hidden = false;
    };
    if (url) image.src = url;
    else image.removeAttribute('src');
  }

  function renderLines(selector, value, splitCommas = false) {
    const element = $(selector);
    if (!element) return;
    const values = text(value).split(splitCommas ? /[,\n]+/ : /\n+/).map((line) => line.trim()).filter(Boolean);
    const fragment = document.createDocumentFragment();
    for (const line of values.length ? values : ['등록된 내용이 없습니다.']) {
      const item = document.createElement('span');
      item.className = splitCommas ? 'skill-item' : 'info-line';
      item.textContent = line;
      fragment.append(item);
    }
    element.replaceChildren(fragment);
  }

  function renderContactLink(selector, value, protocol) {
    const element = $(selector);
    if (!element) return;
    const content = text(value);
    element.textContent = content || '아직 등록되지 않았습니다';
    element.removeAttribute('href');
    if (protocol === 'mailto' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(content)) {
      element.href = `mailto:${encodeURIComponent(content)}`;
    } else if (protocol === 'tel') {
      const number = content.replace(/[^\d+]/g, '');
      if (/^\+?\d{3,}$/.test(number)) element.href = `tel:${number}`;
    }
  }

  function renderProfile(profile) {
    const signature = JSON.stringify(profile);
    if (signature === state.profileSignature) return;
    state.profileSignature = signature;
    const item = profile || {};
    const name = text(item.name);
    setText('#profile-name', name, '프로필 준비 중');
    setText('#profile-title', item.title, '직함을 준비하고 있습니다');
    setText('#profile-career-badge', item.career_badge);
    const badge = $('#profile-career-badge');
    if (badge) badge.hidden = !text(item.career_badge);
    setText('#profile-contact-name', name, '아직 등록되지 않았습니다');
    renderContactLink('#profile-email', item.email, 'mailto');
    renderContactLink('#profile-phone', item.phone, 'tel');
    setText('#profile-location', item.location, '아직 등록되지 않았습니다');
    setText('#profile-intro', item.intro, '소개 글을 준비하고 있습니다.');
    renderLines('#profile-education', item.education);
    renderLines('#profile-skills', item.skills, true);
    renderLines('#profile-experience', item.experience);
    setText('#profile-quote', item.quote);
    const quote = $('#profile-quote');
    if (quote) quote.hidden = !text(item.quote);
    const headline = $('#profile-headline');
    if (headline) {
      const content = text(item.headline) || '소개를 준비하고 있습니다.';
      const nameIndex = name ? content.indexOf(name) : -1;
      if (nameIndex < 0) headline.textContent = content;
      else {
        const highlight = document.createElement('span');
        highlight.className = 'headline-name';
        highlight.textContent = name;
        headline.replaceChildren(
          document.createTextNode(content.slice(0, nameIndex)),
          highlight,
          document.createTextNode(content.slice(nameIndex + name.length)),
        );
      }
    }
    showImage($('#profile-photo'), $('#profile-photo-placeholder'), item.photo_url, name ? `${name} 프로필 사진` : '프로필 사진');
    document.title = name ? `${name} | Portfolio` : 'Portfolio';
  }

  function updateLikeButton(projectId) {
    const record = state.projectElements.get(projectId);
    if (!record) return;
    const liked = state.liked.has(projectId);
    const pending = state.pendingLikes.has(projectId);
    const count = state.counts.get(projectId) || 0;
    const unavailable = !clientId || !state.likesLoaded;
    record.button.disabled = liked || pending || unavailable;
    record.button.classList.toggle('is-liked', liked);
    record.button.classList.toggle('is-busy', pending);
    record.button.classList.toggle('is-unavailable', unavailable);
    record.button.setAttribute('aria-pressed', String(liked));
    record.button.setAttribute('aria-busy', String(pending));
    record.button.setAttribute('aria-label', `${record.title} 좋아요 ${state.likesLoaded ? count + '개' : '불러오는 중'}${liked ? ', 이미 눌렀습니다' : ''}${!clientId ? ', 브라우저 저장 공간이 필요합니다' : ''}`);
    record.button.title = liked ? '이 브라우저에서 이미 좋아요를 눌렀습니다.' : unavailable ? '좋아요 정보를 확인하고 있습니다.' : '이 프로젝트에 좋아요 남기기';
    record.count.textContent = state.likesLoaded ? String(count) : '—';
  }

  function renderProjects(projects) {
    const signature = JSON.stringify(projects);
    if (signature === state.projectsSignature) return;
    state.projectsSignature = signature;
    state.projects = projects;
    state.projectElements.clear();
    const fragment = document.createDocumentFragment();
    for (const project of projects) {
      const id = String(project.id);
      const card = elements.projectTemplate.content.firstElementChild.cloneNode(true);
      const link = card.querySelector('.project-link');
      const title = text(project.title) || '제목 없는 프로젝트';
      const fileUrl = safeWebUrl(project.file_url);
      const thumbnailUrl = safeWebUrl(project.thumbnail_url);
      const destination = fileUrl || thumbnailUrl;
      if (destination) {
        link.href = destination;
        link.setAttribute('aria-label', `${title} ${fileUrl ? '첨부 파일' : '이미지'} 새 탭에서 보기`);
      } else {
        link.removeAttribute('href');
        link.setAttribute('aria-disabled', 'true');
        link.classList.add('is-unavailable');
        link.setAttribute('aria-label', `${title}, 첨부 파일을 준비하고 있습니다`);
      }
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      const category = card.querySelector('.project-category');
      const number = document.createElement('span');
      number.className = 'project-number';
      number.textContent = text(project.number);
      category.replaceChildren(number, document.createTextNode(`${number.textContent ? ' ' : ''}${text(project.category)}`));
      card.querySelector('.project-title').textContent = title;
      card.querySelector('.project-description').textContent = text(project.description);
      const tags = card.querySelector('.project-tags');
      const tagList = Array.isArray(project.tags) ? project.tags : [];
      for (const value of tagList) {
        if (!text(value)) continue;
        const tag = document.createElement('span');
        tag.className = 'project-tag';
        tag.textContent = text(value);
        tags.append(tag);
      }
      showImage(card.querySelector('.project-image'), card.querySelector('.thumbnail-placeholder'), thumbnailUrl, `${title} 미리보기`);
      const fileLabel = card.querySelector('.project-file-label');
      if (fileLabel) fileLabel.textContent = fileUrl ? '첨부 파일 보기 ↗' : thumbnailUrl ? '이미지 보기 ↗' : '파일 준비 중';
      const button = card.querySelector('.like-button');
      button.type = 'button';
      button.addEventListener('click', () => addLike(id));
      state.projectElements.set(id, { button, count: card.querySelector('.like-count'), title });
      fragment.append(card);
    }
    elements.projectGrid.replaceChildren(fragment);
    for (const id of state.projectElements.keys()) updateLikeButton(id);
    updateProjectStatus();
  }

  async function loadLikes() {
    const revision = state.likesRevision;
    const [allLikes, myLikes] = await Promise.all([
      readAll('likes', { select: 'id,project_id', order: 'id.asc' }),
      clientId ? readAll('likes', { select: 'id,project_id', client_id: `eq.${clientId}`, order: 'id.asc' }) : Promise.resolve([]),
    ]);
    // 저장을 시작하기 전에 읽던 응답이 나중에 도착해도 최신 표시를 덮지 않습니다.
    if (revision !== state.likesRevision) return;
    const counts = new Map();
    for (const row of allLikes) {
      const id = String(row.project_id);
      counts.set(id, (counts.get(id) || 0) + 1);
    }
    state.counts = counts;
    state.liked = new Set(myLikes.map((row) => String(row.project_id)));
    state.likesLoaded = true;
    for (const id of state.projectElements.keys()) updateLikeButton(id);
  }

  function updateProjectStatus() {
    if (state.errors.has('projects')) {
      setStatus(elements.projectStatus, '프로젝트를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.', true);
    } else if (state.errors.has('likes')) {
      setStatus(elements.projectStatus, '좋아요 정보를 불러오지 못했습니다. 잠시 후 다시 연결합니다.', true);
    } else if (!clientId) {
      setStatus(elements.projectStatus, '좋아요를 남기려면 브라우저의 사이트 저장 공간을 허용해 주세요.', true);
    } else if (state.projectsSignature !== null && !state.projects.length) {
      setStatus(elements.projectStatus, '아직 등록된 프로젝트가 없습니다.');
    } else {
      setStatus(elements.projectStatus, '');
    }
  }

  function updateGlobalStatus() {
    const messages = [];
    if (state.errors.has('profile')) messages.push('프로필을 불러오지 못했습니다.');
    if (state.errors.has('projects')) messages.push('프로젝트 연결을 확인해 주세요.');
    if (state.errors.has('likes')) messages.push('좋아요 연결을 확인해 주세요.');
    if (state.errors.has('guestbook')) messages.push('방명록을 불러오지 못했습니다.');
    const message = messages.length ? `${messages.join(' ')} 잠시 후 자동으로 다시 연결합니다.` : '';
    setStatus(elements.pageStatus, message, messages.length > 0);
    if (elements.reload) elements.reload.hidden = !messages.length;
    updateProjectStatus();
  }

  async function addLike(projectId) {
    if (!clientId || !state.likesLoaded || state.liked.has(projectId) || state.pendingLikes.has(projectId)) return;
    state.likesRevision += 1;
    state.pendingLikes.add(projectId);
    updateLikeButton(projectId);
    try {
      await request('likes', {}, {
        method: 'POST',
        body: { project_id: projectId, client_id: clientId },
      });
      // 다른 카드의 이전 재조회가 늦게 도착해 최신 성공 표시를 되돌리지 않게 합니다.
      state.likesRevision += 1;
      // 성공한 뒤에만 표시합니다. 서버의 고유 규칙이 여러 탭의 중복도 막습니다.
      state.liked.add(projectId);
      state.counts.set(projectId, (state.counts.get(projectId) || 0) + 1);
      updateLikeButton(projectId);
      try {
        await loadLikes();
        state.errors.delete('likes');
      } catch {
        // 저장은 이미 성공했으므로 다음 자동 갱신에서 전체 숫자를 확인합니다.
      }
      setStatus(elements.projectStatus, '좋아요를 남겼습니다. 감사합니다!');
    } catch (error) {
      state.likesRevision += 1;
      if (error.status === 409) state.liked.add(projectId);
      try {
        await loadLikes();
        state.errors.delete('likes');
      } catch {
        state.errors.set('likes', true);
      }
      if (state.liked.has(projectId)) {
        setStatus(elements.projectStatus, '이 브라우저에서 이미 좋아요를 남긴 프로젝트입니다.');
      } else {
        setStatus(elements.projectStatus, error.status === 409 ? '좋아요 내역을 다시 확인하고 있습니다. 잠시 후 다시 확인해 주세요.' : '좋아요를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.', true);
      }
    } finally {
      state.pendingLikes.delete(projectId);
      updateLikeButton(projectId);
    }
  }

  function renderGuestbook(rows) {
    const signature = JSON.stringify(rows);
    if (signature === state.guestbookSignature) return;
    state.guestbookSignature = signature;
    const fragment = document.createDocumentFragment();
    if (!rows.length) {
      const empty = document.createElement('li');
      empty.className = 'guestbook-empty';
      empty.textContent = '첫 번째 인사를 남겨 주세요.';
      fragment.append(empty);
    }
    for (const row of rows) {
      const item = document.createElement('li');
      item.className = 'guestbook-entry';
      const header = document.createElement('div');
      header.className = 'guestbook-entry-header';
      const nickname = document.createElement('strong');
      nickname.className = 'guestbook-entry-name';
      nickname.textContent = text(row.nickname);
      header.append(nickname);
      const date = new Date(row.created_at);
      if (!Number.isNaN(date.getTime())) {
        const time = document.createElement('time');
        time.className = 'guestbook-entry-date';
        time.dateTime = date.toISOString();
        time.textContent = new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Seoul' }).format(date);
        header.append(time);
      }
      const message = document.createElement('p');
      message.className = 'guestbook-entry-message';
      message.textContent = text(row.message);
      item.append(header, message);
      fragment.append(item);
    }
    elements.guestbookList.replaceChildren(fragment);
  }

  async function loadGuestbook() {
    const revision = state.guestbookRevision;
    const firstLoad = state.guestbookSignature === null;
    const rows = await readAll('resume_guestbook', { select: 'id,nickname,message,created_at', order: 'created_at.desc,id.desc' });
    if (revision !== state.guestbookRevision) return rows;
    renderGuestbook(rows);
    if (firstLoad && !state.guestbookPending) setStatus(elements.guestbookStatus, '');
    return rows;
  }

  async function submitGuestbook() {
    if (state.guestbookPending) return;
    const nickname = elements.nickname.value.trim();
    const messageDraft = elements.message.value;
    const message = messageDraft.trim();
    elements.nickname.setCustomValidity(nickname ? '' : '별명을 입력해 주세요.');
    elements.message.setCustomValidity(message ? '' : '한마디를 입력해 주세요.');
    if (Array.from(nickname).length > 20) elements.nickname.setCustomValidity('별명은 20자까지 입력해 주세요.');
    if (Array.from(message).length > 200) elements.message.setCustomValidity('한마디는 200자까지 입력해 주세요.');
    if (!elements.guestbookForm.reportValidity()) return;

    state.guestbookRevision += 1;
    state.guestbookPending = true;
    elements.guestbookSubmit.disabled = true;
    elements.guestbookSubmit.setAttribute('aria-busy', 'true');
    const submitLabel = Array.from(elements.guestbookSubmit.childNodes);
    elements.guestbookSubmit.textContent = '남기는 중…';
    setStatus(elements.guestbookStatus, '인사를 저장하고 있습니다.');
    try {
      const inserted = await request('resume_guestbook', { select: 'id,nickname,message,created_at' }, { method: 'POST', body: { nickname, message } });
      // 전송을 기다리는 동안 새로 쓰기 시작한 글은 지우거나 포커스를 옮기지 않습니다.
      if (elements.message.value === messageDraft) {
        elements.message.value = '';
        if (document.activeElement === elements.guestbookSubmit || document.activeElement === elements.message) elements.message.focus();
      }
      // 저장된 줄을 먼저 보여 주고 전체 목록도 최신순으로 다시 읽습니다.
      const existing = state.guestbookSignature ? JSON.parse(state.guestbookSignature) : [];
      const saved = Array.isArray(inserted) ? inserted[0] : null;
      if (saved) renderGuestbook([saved, ...existing.filter((row) => String(row.id) !== String(saved.id))]);
      setStatus(elements.guestbookStatus, '인사가 등록되었습니다. 감사합니다!');
      try {
        await loadGuestbook();
        state.errors.delete('guestbook');
      } catch {
        // 등록된 글은 유지하고 다음 자동 갱신에서 목록을 다시 읽습니다.
      }
    } catch (error) {
      setStatus(elements.guestbookStatus, error.uncertain ? '전송 결과를 확인하지 못했습니다. 아래 목록을 확인한 뒤 다시 시도해 주세요.' : '인사를 저장하지 못했습니다. 작성한 글은 그대로 두었습니다. 잠시 후 다시 시도해 주세요.', true);
      try {
        await loadGuestbook();
      } catch {
        state.errors.set('guestbook', true);
      }
    } finally {
      state.guestbookPending = false;
      elements.guestbookSubmit.disabled = false;
      elements.guestbookSubmit.setAttribute('aria-busy', 'false');
      elements.guestbookSubmit.replaceChildren(...submitLabel);
    }
  }

  async function refreshSection(name, action) {
    try {
      await action();
      if (name === 'guestbook' && state.errors.has(name) && !state.guestbookPending) setStatus(elements.guestbookStatus, '');
      state.errors.delete(name);
    } catch {
      state.errors.set(name, true);
      if (name === 'guestbook' && !state.guestbookPending) setStatus(elements.guestbookStatus, '방명록을 불러오지 못했습니다. 잠시 후 다시 연결합니다.', true);
    }
  }

  function refresh() {
    if (state.refreshPromise) return state.refreshPromise;
    state.refreshPromise = (async () => {
      if (elements.reload) elements.reload.disabled = true;
      await Promise.all([
        refreshSection('profile', async () => {
          const profile = await request('profile', { select: '*', id: 'eq.1', limit: 1 });
          renderProfile(profile[0] || null);
        }),
        refreshSection('projects', async () => {
          renderProjects(await readAll('projects', { select: '*', order: 'sort_order.asc,id.asc' }));
        }),
        refreshSection('likes', async () => {
          // 좋아요 저장 중에는 갱신이 성공 표시를 덮어쓰지 않도록 기다립니다.
          if (!state.pendingLikes.size) await loadLikes();
        }),
        refreshSection('guestbook', async () => {
          if (!state.guestbookPending) await loadGuestbook();
        }),
      ]);
      elements.portfolio.setAttribute('aria-busy', 'false');
      if (elements.reload) elements.reload.disabled = false;
      updateGlobalStatus();
      state.refreshPromise = null;
    })();
    return state.refreshPromise;
  }

  elements.guestbookSubmit.addEventListener('click', submitGuestbook);
  elements.guestbookForm.addEventListener('submit', (event) => {
    event.preventDefault();
    submitGuestbook();
  });
  elements.nickname.addEventListener('input', () => elements.nickname.setCustomValidity(''));
  elements.message.addEventListener('input', () => elements.message.setCustomValidity(''));
  if (elements.reload) elements.reload.addEventListener('click', refresh);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refresh();
  });
  window.addEventListener('focus', refresh);
  window.addEventListener('online', refresh);
  // 관리자가 바꾼 내용은 화면을 다시 열거나 최대 30초 뒤 자동으로 반영됩니다.
  setInterval(() => {
    if (document.visibilityState === 'visible') refresh();
  }, 30000);
  refresh();
})();
