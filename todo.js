    const THEME_KEY = 'todo-theme';

    function getTheme() {
      return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
    }

    function applyTheme(theme) {
      const isLight = theme === 'light';
      document.documentElement.setAttribute('data-theme', isLight ? 'light' : 'dark');
      localStorage.setItem(THEME_KEY, theme);
      const sw = document.getElementById('themeSwitch');
      const iconDark = document.getElementById('themeIconDark');
      const iconLight = document.getElementById('themeIconLight');
      if (!sw) return;
      sw.setAttribute('aria-checked', String(isLight));
      sw.setAttribute('aria-label', isLight ? '切换至深色模式' : '切换至浅色模式');
      iconDark.classList.toggle('active', !isLight);
      iconLight.classList.toggle('active', isLight);
    }

    document.getElementById('themeSwitch').addEventListener('click', () => {
      applyTheme(getTheme() === 'light' ? 'dark' : 'light');
    });

    applyTheme(getTheme());

    const STORAGE_KEY = 'todo-app-data';

    const STATUS_ORDER = ['pending', 'completed', 'on_hold'];
    const STATUS_LABELS = {
      pending: '○ 未完成',
      completed: '✓ 完成',
      on_hold: '⏸ 搁置'
    };

    const REPORT_STATUS_LABELS = {
      pending: '未完成',
      completed: '已完成',
      on_hold: '搁置'
    };

    let data = loadData();
    let selectedDate = data.selectedDate || todayStr();

    function getTodoStatus(todo) {
      return STATUS_ORDER.includes(todo.status) ? todo.status : 'pending';
    }

    function normalizeTodo(todo) {
      if (!STATUS_ORDER.includes(todo.status)) {
        todo.status = todo.done ? 'completed' : 'pending';
      }
      delete todo.done;
      todo.plan = todo.plan === 'unplanned' ? 'unplanned' : 'default';
      if (typeof todo.note !== 'string') todo.note = '';
      return todo;
    }

    function migrateData() {
      let changed = false;
      for (const date of Object.keys(data.dates)) {
        if (!Array.isArray(data.dates[date])) continue;
        const todos = data.dates[date];
        todos.forEach(t => {
          const before = JSON.stringify(t);
          normalizeTodo(t);
          if (JSON.stringify(t) !== before) changed = true;
        });

        const beforeOrders = todos.map(t => t.order).join(',');
        ['default', 'unplanned'].forEach(planType => {
          const items = todos
            .map((t, i) => ({ t, i }))
            .filter(({ t }) => getPlanType(t) === planType)
            .sort((a, b) => {
              const ao = Number.isFinite(a.t.order) && a.t.order > 0 ? a.t.order : a.i + 1e6;
              const bo = Number.isFinite(b.t.order) && b.t.order > 0 ? b.t.order : b.i + 1e6;
              return ao - bo;
            });
          items.forEach(({ t }, idx) => {
            if (t.order !== idx + 1) {
              t.order = idx + 1;
              changed = true;
            }
          });
        });
        if (todos.map(t => t.order).join(',') !== beforeOrders) changed = true;
      }
      if (changed) saveData();
    }

    function normalizeImportedTodo(item, existingIds) {
      let status = 'pending';
      if (STATUS_ORDER.includes(item.status)) {
        status = item.status;
      } else if (item.done) {
        status = 'completed';
      }
      const todo = {
        id: item.id && !existingIds.has(item.id) ? item.id : uid(),
        text: item.text,
        status,
        plan: item.plan === 'unplanned' ? 'unplanned' : 'default',
        note: typeof item.note === 'string' ? item.note : '',
        order: Number.isFinite(item.order) && item.order > 0 ? item.order : null
      };
      existingIds.add(todo.id);
      return todo;
    }

    function getPlanType(todo) {
      return todo.plan === 'unplanned' ? 'unplanned' : 'default';
    }

    function sortByOrder(todos) {
      return [...todos].sort((a, b) => (a.order || 0) - (b.order || 0));
    }

    function reindexPlanTodos(todos, planType) {
      sortByOrder(todos.filter(t => getPlanType(t) === planType))
        .forEach((t, i) => { t.order = i + 1; });
    }

    function getNextOrder(todos, planType) {
      const planTodos = todos.filter(t => getPlanType(t) === planType);
      if (planTodos.length === 0) return 1;
      return Math.max(...planTodos.map(t => t.order || 0)) + 1;
    }

    function reindexDateTodos(todos) {
      reindexPlanTodos(todos, 'default');
      reindexPlanTodos(todos, 'unplanned');
    }

    function countByStatus(todos) {
      return {
        pending: todos.filter(t => getTodoStatus(t) === 'pending').length,
        completed: todos.filter(t => getTodoStatus(t) === 'completed').length,
        on_hold: todos.filter(t => getTodoStatus(t) === 'on_hold').length
      };
    }

    function todayStr() {
      const d = new Date();
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    }

    function isPastDate(dateStr) {
      return dateStr < todayStr();
    }

    function pad(n) { return String(n).padStart(2, '0'); }

    function loadData() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) return JSON.parse(raw);
      } catch (_) {}
      return { dates: {}, selectedDate: null };
    }

    function saveData() {
      data.selectedDate = selectedDate;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    }

    function ensureDate(date) {
      if (data.dates[date]) return { created: false, carried: 0, fromDate: null };

      const prevDate = Object.keys(data.dates)
        .filter(d => d < date)
        .sort()
        .pop() || null;

      if (!prevDate) {
        data.dates[date] = [];
        return { created: true, carried: 0, fromDate: null };
      }

      const carried = sortByOrder(
        (data.dates[prevDate] || []).filter(t => getTodoStatus(t) !== 'completed')
      ).map(t => ({
        id: uid(),
        text: t.text,
        status: getTodoStatus(t),
        plan: getPlanType(t),
        note: typeof t.note === 'string' ? t.note : '',
        order: t.order
      }));

      data.dates[date] = carried;
      reindexDateTodos(data.dates[date]);
      return { created: true, carried: carried.length, fromDate: prevDate };
    }

    function uid() {
      return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    }

    function parseDate(dateStr) {
      const [y, m, d] = dateStr.split('-').map(Number);
      return { year: y, month: m, day: d };
    }

    function weekdayLabel(dateStr) {
      const days = ['日', '一', '二', '三', '四', '五', '六'];
      const d = new Date(dateStr + 'T00:00:00');
      return '周' + days[d.getDay()];
    }

    function formatDisplay(dateStr) {
      const { year, month, day } = parseDate(dateStr);
      return `${year}年${month}月${day}日 ${weekdayLabel(dateStr)}`;
    }

    function formatDateOnly(dateStr) {
      const { year, month, day } = parseDate(dateStr);
      return `${year}年${month}月${day}日`;
    }

    const MONTH_NAMES = ['', '一月', '二月', '三月', '四月', '五月', '六月',
      '七月', '八月', '九月', '十月', '十一月', '十二月'];

    /* ── Tree ── */
    function buildTreeStructure() {
      const tree = {};
      const dates = Object.keys(data.dates).sort();
      for (const ds of dates) {
        const { year, month, day } = parseDate(ds);
        if (!tree[year]) tree[year] = {};
        if (!tree[year][month]) tree[year][month] = [];
        tree[year][month].push({ dateStr: ds, day });
      }
      return tree;
    }

    function renderTree() {
      const container = document.getElementById('dateTree');
      const tree = buildTreeStructure();
      const years = Object.keys(tree).sort((a, b) => b - a);

      if (years.length === 0) {
        container.innerHTML = '<div class="tree-empty">暂无日期<br>请在上方添加</div>';
        return;
      }

      container.innerHTML = '';
      for (const year of years) {
        const yearLi = createTreeNode(String(year), 'year', year);
        const yearChildren = yearLi.querySelector('.tree-children');
        const months = Object.keys(tree[year]).sort((a, b) => b - a);

        for (const month of months) {
          const monthLi = createTreeNode(MONTH_NAMES[month], 'month', `${year}-${month}`);
          const monthChildren = monthLi.querySelector('.tree-children');
          const days = tree[year][month];

          for (const { dateStr, day } of days) {
            const todos = data.dates[dateStr];
            const pending = todos.filter(t => getTodoStatus(t) === 'pending').length;
            const badge = pending > 0 ? `<span class="tree-badge">${pending}</span>` : '';
            const dayLi = createTreeNode(`${day}日 ${weekdayLabel(dateStr)}`, 'day', dateStr, badge);
            dayLi.querySelector('.tree-label').dataset.date = dateStr;
            if (dateStr === selectedDate) dayLi.querySelector('.tree-label').classList.add('active');
            monthChildren.appendChild(dayLi);
          }

          yearChildren.appendChild(monthLi);
        }

        container.appendChild(yearLi);
      }

      openActivePath(container);
    }

    function createTreeNode(label, type, id, extraHtml = '') {
      const li = document.createElement('li');
      li.className = 'tree-node';
      const delBtn = type === 'day' && !isPastDate(id)
        ? `<button class="tree-del-btn" title="删除此日期" data-del-date="${id}">×</button>`
        : '';
      li.innerHTML = `
        <div class="tree-label" data-id="${id}" data-type="${type}">
          <span class="tree-toggle">▶</span>
          <span class="tree-label-text">${label}</span>
          ${extraHtml}
          ${delBtn}
        </div>
        <ul class="tree-children"></ul>
      `;

      const labelEl = li.querySelector('.tree-label');
      const toggle = li.querySelector('.tree-toggle');
      const children = li.querySelector('.tree-children');

      if (type === 'day') {
        toggle.classList.add('leaf');
        labelEl.addEventListener('click', (e) => {
          if (e.target.closest('.tree-del-btn')) return;
          selectDate(id);
        });
        const delBtnEl = labelEl.querySelector('.tree-del-btn');
        if (delBtnEl) {
          delBtnEl.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteDate(id);
          });
        }
      } else {
        labelEl.addEventListener('click', (e) => {
          e.stopPropagation();
          const isOpen = children.classList.toggle('open');
          toggle.classList.toggle('open', isOpen);
        });
      }

      return li;
    }

    function deleteDate(dateStr) {
      if (isPastDate(dateStr)) return;
      const todos = data.dates[dateStr] || [];
      const msg = todos.length > 0
        ? `确定删除 ${formatDisplay(dateStr)}？\n该日期下有 ${todos.length} 项待办，删除后不可恢复。`
        : `确定删除 ${formatDisplay(dateStr)}？`;
      showConfirm({ title: '确认删除', message: msg }).then(confirmed => {
        if (!confirmed) return;

        delete data.dates[dateStr];

        const remaining = Object.keys(data.dates).sort();
        if (selectedDate === dateStr) {
          selectedDate = remaining.length > 0 ? remaining[remaining.length - 1] : null;
        }

        saveData();
        renderTree();

        const panel = document.getElementById('mainPanel');
        if (selectedDate) {
          renderMain();
        } else {
          panel.innerHTML = '<div class="no-date-selected" id="placeholder"></div>';
          updateEmptyHint();
        }
        updateSidebarActions();
      });
    }

    function openActivePath(container) {
      container.querySelectorAll('.tree-children').forEach(el => {
        el.classList.add('open');
        const toggle = el.previousElementSibling?.querySelector('.tree-toggle');
        if (toggle) toggle.classList.add('open');
      });
    }

    function selectDate(dateStr) {
      selectedDate = dateStr;
      ensureDate(dateStr);
      saveData();
      renderTree();
      renderMain();
      updateSidebarActions();
      closeSidebar();
    }

    /* ── Main Panel ── */
    function renderMain() {
      const panel = document.getElementById('mainPanel');
      ensureDate(selectedDate);
      const todos = data.dates[selectedDate];
      const counts = countByStatus(todos);
      const readOnly = isPastDate(selectedDate);

      panel.innerHTML = `
        <div class="main-header">
          <div>
            <h2>${formatDisplay(selectedDate)}</h2>
            <div class="date-info">共 ${todos.length} 项待办</div>
          </div>
          <div class="stats">
            <div>未完成 <span>${counts.pending}</span></div>
            <div>完成 <span>${counts.completed}</span></div>
            <div>搁置 <span>${counts.on_hold}</span></div>
          </div>
        </div>
        ${readOnly ? '<div class="read-only-hint">往期日报，仅可查看</div>' : ''}
        <div class="todo-list">
          ${readOnly ? '' : `
          <div class="add-todo-bar">
            <input type="text" id="newTodoInput" placeholder="输入新的待办事项，回车添加…">
            <div class="plan-toggle">
              <label><input type="radio" name="newTodoPlan" value="default" checked>默认</label>
              <label><input type="radio" name="newTodoPlan" value="unplanned">计划外</label>
            </div>
            <button class="btn btn-primary" id="addTodoBtn">添加</button>
          </div>`}
          <div id="todoItems"></div>
        </div>
      `;

      renderTodos();

      if (!readOnly) {
        document.getElementById('addTodoBtn').addEventListener('click', addTodo);
        document.getElementById('newTodoInput').addEventListener('keydown', (e) => {
          if (e.key === 'Enter') addTodo();
        });
      }
    }

    let copyToastTimer = null;

    let confirmResolver = null;

    function showConfirm({ title = '请确认', message = '' } = {}) {
      return new Promise(resolve => {
        confirmResolver = resolve;
        document.getElementById('confirmTitle').textContent = title;
        document.getElementById('confirmMessage').textContent = message;
        document.getElementById('confirmOverlay').classList.add('show');
      });
    }

    function closeConfirm(result) {
      document.getElementById('confirmOverlay').classList.remove('show');
      if (confirmResolver) {
        confirmResolver(result);
        confirmResolver = null;
      }
    }

    document.getElementById('confirmOkBtn').addEventListener('click', () => closeConfirm(true));
    document.getElementById('confirmCancelBtn').addEventListener('click', () => closeConfirm(false));
    document.getElementById('confirmOverlay').addEventListener('click', (e) => {
      if (e.target.id === 'confirmOverlay') closeConfirm(false);
    });

    function showCopyToast(message) {
      const toast = document.getElementById('copyToast');
      toast.textContent = message;
      toast.classList.add('show');
      clearTimeout(copyToastTimer);
      copyToastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
    }

    async function copyTextToClipboard(text) {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return;
      }
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      if (!ok) throw new Error('copy_failed');
    }

    function getReportStatusLabel(todo) {
      return REPORT_STATUS_LABELS[getTodoStatus(todo)] || REPORT_STATUS_LABELS.pending;
    }

    function generateTodayPlan() {
      if (!selectedDate) return;
      const todos = data.dates[selectedDate] || [];
      const items = sortByOrder(todos.filter(t => getPlanType(t) === 'default'));
      const lines = items.map(t => `${t.order}.${t.text.trim()}`);
      const text = lines.join('\n');

      copyTextToClipboard(text).then(() => {
        const hint = items.length === 0
          ? '已复制（暂无默认计划项）'
          : `已复制今日计划（${items.length} 项）`;
        showCopyToast(hint);
      }).catch(() => {
        showCopyToast('复制失败，请检查浏览器权限');
      });
    }

    function formatDefaultDailyReportLine(todo) {
      const statusLabel = getReportStatusLabel(todo);
      const note = (todo.note || '').trim();
      let line = `${todo.order}.${statusLabel}`;
      if (note) line += `\n    ${note}`;
      return line;
    }

    function formatUnplannedDailyReportLine(todo) {
      const statusLabel = getReportStatusLabel(todo);
      const note = (todo.note || '').trim();
      const text = todo.text.trim();
      const suffix = note ? `${statusLabel}:${note}` : statusLabel;
      return `     ${todo.order}.${text}(${suffix})`;
    }

    function generateDailyReport() {
      if (!selectedDate) return;
      const todos = data.dates[selectedDate] || [];
      const lines = [];

      const defaultItems = sortByOrder(todos.filter(t => getPlanType(t) === 'default'));
      defaultItems.forEach(t => lines.push(formatDefaultDailyReportLine(t)));

      const unplannedItems = sortByOrder(todos.filter(t => getPlanType(t) === 'unplanned'));
      if (unplannedItems.length > 0) {
        if (lines.length > 0) lines.push('');
        lines.push('计划外：');
        unplannedItems.forEach(t => lines.push(formatUnplannedDailyReportLine(t)));
      }

      const text = lines.join('\n');

      copyTextToClipboard(text).then(() => {
        const hint = text
          ? '已复制日报'
          : '已复制（当日暂无待办）';
        showCopyToast(hint);
      }).catch(() => {
        showCopyToast('复制失败，请检查浏览器权限');
      });
    }

    function getStatusActions(status) {
      const actions = {
        pending: [
          { status: 'completed', label: '✓ 完成' },
          { status: 'on_hold', label: '⏸ 搁置' }
        ],
        completed: [
          { status: 'pending', label: '○ 未完成' },
          { status: 'on_hold', label: '⏸ 搁置' }
        ],
        on_hold: [
          { status: 'completed', label: '✓ 完成' },
          { status: 'pending', label: '○ 未完成' }
        ]
      };
      return actions[status] || actions.pending;
    }

    function createTodoCard(todo, readOnly) {
      const status = getTodoStatus(todo);
      const actions = getStatusActions(status);
      const actionBtns = actions.map(a =>
        `<button class="status-btn action-${a.status}" data-id="${todo.id}" data-status="${a.status}">${a.label}</button>`
      ).join('');
      const el = document.createElement('div');
      el.className = `todo-item status-${status}${readOnly ? ' read-only' : ''}`;
      el.innerHTML = `
        ${readOnly ? '' : `<button class="todo-del-btn" data-del="${todo.id}" title="删除" aria-label="删除">×</button>`}
        <div class="todo-top">
          <div class="todo-card-meta">
            <span class="todo-index">#${todo.order}</span>
            <span class="todo-status-badge ${status}">${STATUS_LABELS[status]}</span>
          </div>
          <input class="todo-text" value="${esc(todo.text)}" data-id="${todo.id}"${readOnly ? ' readonly' : ''}>
          ${readOnly ? '' : `<div class="todo-actions">${actionBtns}</div>`}
        </div>
        <div class="todo-note-wrap">
          <div class="todo-note-label">备注</div>
          <textarea class="todo-note" data-id="${todo.id}" placeholder="添加备注…"${readOnly ? ' readonly' : ''}>${esc(todo.note || '')}</textarea>
        </div>
      `;
      return el;
    }

    function bindTodoEvents(container) {
      container.querySelectorAll('.status-btn[data-status]').forEach(btn => {
        btn.addEventListener('click', () => setTodoStatus(btn.dataset.id, btn.dataset.status));
      });

      container.querySelectorAll('[data-del]').forEach(btn => {
        btn.addEventListener('click', () => deleteTodo(btn.dataset.del));
      });

      container.querySelectorAll('.todo-text').forEach(input => {
        input.addEventListener('change', () => updateTodoText(input.dataset.id, input.value));
        input.addEventListener('blur', () => updateTodoText(input.dataset.id, input.value));
      });

      container.querySelectorAll('.todo-note').forEach(ta => {
        ta.addEventListener('input', debounce(() => updateTodoNote(ta.dataset.id, ta.value), 300));
      });
    }

    function renderTodos() {
      const container = document.getElementById('todoItems');
      const todos = data.dates[selectedDate];
      const readOnly = isPastDate(selectedDate);

      if (todos.length === 0) {
        container.innerHTML = readOnly
          ? `<div class="empty-state"><div class="icon">📋</div><p>该日暂无待办记录</p></div>`
          : `<div class="empty-state">
            <div class="icon">✨</div>
            <p>还没有待办事项，添加一个吧</p>
          </div>`;
        return;
      }

      const sections = [
        { key: 'default', title: '默认计划' },
        { key: 'unplanned', title: '计划外' }
      ];

      container.innerHTML = '';
      for (const section of sections) {
        const sectionTodos = sortByOrder(
          todos.filter(t => getPlanType(t) === section.key)
        );
        const sectionEl = document.createElement('div');
        sectionEl.className = 'plan-section';
        sectionEl.innerHTML = `<h3 class="plan-section-title">${section.title}</h3>`;

        const grid = document.createElement('div');
        grid.className = 'todo-grid';

        if (sectionTodos.length === 0) {
          grid.innerHTML = '<div class="plan-section-empty">暂无事项</div>';
        } else {
          sectionTodos.forEach(todo => grid.appendChild(createTodoCard(todo, readOnly)));
        }

        sectionEl.appendChild(grid);
        container.appendChild(sectionEl);
      }

      if (!readOnly) bindTodoEvents(container);
    }

    function esc(s) {
      const d = document.createElement('div');
      d.textContent = s;
      return d.innerHTML;
    }

    function debounce(fn, ms) {
      let t;
      return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
    }

    function addTodo() {
      if (isPastDate(selectedDate)) return;
      const input = document.getElementById('newTodoInput');
      const text = input.value.trim();
      if (!text) return;
      const planInput = document.querySelector('input[name="newTodoPlan"]:checked');
      const plan = planInput && planInput.value === 'unplanned' ? 'unplanned' : 'default';
      const todos = data.dates[selectedDate];
      const order = getNextOrder(todos, plan);
      todos.push({ id: uid(), text, status: 'pending', plan, note: '', order });
      saveData();
      input.value = '';
      renderTree();
      renderTodos();
      updateHeaderStats();
    }

    function setTodoStatus(id, newStatus) {
      if (isPastDate(selectedDate)) return;
      if (!STATUS_ORDER.includes(newStatus)) return;
      const todo = data.dates[selectedDate].find(t => t.id === id);
      if (!todo || getTodoStatus(todo) === newStatus) return;
      todo.status = newStatus;
      saveData();
      renderTree();
      renderTodos();
      updateHeaderStats();
    }

    function deleteTodo(id) {
      if (isPastDate(selectedDate)) return;
      const todos = data.dates[selectedDate];
      const removed = todos.find(t => t.id === id);
      if (!removed) return;
      const preview = removed.text.trim() || '（无标题）';
      showConfirm({
        title: '确认删除',
        message: `确定删除待办「${preview}」？\n删除后不可恢复。`
      }).then(confirmed => {
        if (!confirmed) return;
        const planType = getPlanType(removed);
        data.dates[selectedDate] = todos.filter(t => t.id !== id);
        reindexPlanTodos(data.dates[selectedDate], planType);
        saveData();
        renderTree();
        renderTodos();
        updateHeaderStats();
      });
    }

    function updateTodoText(id, text) {
      if (isPastDate(selectedDate)) return;
      const todo = data.dates[selectedDate].find(t => t.id === id);
      if (!todo || todo.text === text) return;
      todo.text = text;
      saveData();
    }

    function updateTodoNote(id, note) {
      if (isPastDate(selectedDate)) return;
      const todo = data.dates[selectedDate].find(t => t.id === id);
      if (!todo || todo.note === note) return;
      todo.note = note;
      saveData();
    }

    function updateHeaderStats() {
      const todos = data.dates[selectedDate];
      const counts = countByStatus(todos);
      const statsEl = document.querySelector('.stats');
      if (statsEl) {
        statsEl.innerHTML = `
          <div>未完成 <span>${counts.pending}</span></div>
          <div>完成 <span>${counts.completed}</span></div>
          <div>搁置 <span>${counts.on_hold}</span></div>`;
      }
      const infoEl = document.querySelector('.date-info');
      if (infoEl) infoEl.textContent = `共 ${todos.length} 项待办`;
    }

    /* ── Add Date ── */
    const datePickerEl = document.getElementById('datePicker');
    const datePickerTrigger = document.getElementById('datePickerTrigger');
    const datePickerPanel = document.getElementById('datePickerPanel');
    const datePickerDisplay = document.getElementById('datePickerDisplay');
    const datePickerMonthYear = document.getElementById('datePickerMonthYear');
    const datePickerGrid = document.getElementById('datePickerGrid');
    let datePickerView = { year: 0, month: 0 };

    function setDatePickerValue(dateStr) {
      datePickerEl.value = dateStr;
      datePickerDisplay.textContent = dateStr ? formatDateOnly(dateStr) : '选择日期';
      const { year, month } = parseDate(dateStr || todayStr());
      datePickerView = { year, month };
      renderDatePickerGrid();
    }

    function renderDatePickerGrid() {
      const { year, month } = datePickerView;
      datePickerMonthYear.textContent = `${year}年 ${MONTH_NAMES[month]}`;

      const firstDay = new Date(year, month - 1, 1).getDay();
      const daysInMonth = new Date(year, month, 0).getDate();
      const daysInPrev = new Date(year, month - 1, 0).getDate();
      const selected = datePickerEl.value;
      const today = todayStr();

      datePickerGrid.innerHTML = '';
      for (let i = 0; i < firstDay; i++) {
        const day = daysInPrev - firstDay + i + 1;
        const prevMonth = month === 1 ? 12 : month - 1;
        const prevYear = month === 1 ? year - 1 : year;
        const dateStr = `${prevYear}-${pad(prevMonth)}-${pad(day)}`;
        datePickerGrid.appendChild(createDatePickerDay(day, dateStr, selected, today, true));
      }
      for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${pad(month)}-${pad(day)}`;
        datePickerGrid.appendChild(createDatePickerDay(day, dateStr, selected, today, false));
      }
      const totalCells = firstDay + daysInMonth;
      const remaining = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
      for (let day = 1; day <= remaining; day++) {
        const nextMonth = month === 12 ? 1 : month + 1;
        const nextYear = month === 12 ? year + 1 : year;
        const dateStr = `${nextYear}-${pad(nextMonth)}-${pad(day)}`;
        datePickerGrid.appendChild(createDatePickerDay(day, dateStr, selected, today, true));
      }
    }

    function createDatePickerDay(day, dateStr, selected, today, otherMonth) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'date-picker-day'
        + (otherMonth ? ' other-month' : '')
        + (dateStr === selected ? ' selected' : '')
        + (dateStr === today ? ' today' : '');
      btn.textContent = day;
      btn.dataset.date = dateStr;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        setDatePickerValue(dateStr);
        closeDatePicker();
      });
      return btn;
    }

    function openDatePicker() {
      if (datePickerEl.value) {
        const { year, month } = parseDate(datePickerEl.value);
        datePickerView = { year, month };
      } else {
        const t = todayStr();
        const { year, month } = parseDate(t);
        datePickerView = { year, month };
      }
      renderDatePickerGrid();
      datePickerPanel.classList.add('open');
      datePickerTrigger.classList.add('open');
      datePickerTrigger.setAttribute('aria-expanded', 'true');
    }

    function closeDatePicker() {
      datePickerPanel.classList.remove('open');
      datePickerTrigger.classList.remove('open');
      datePickerTrigger.setAttribute('aria-expanded', 'false');
    }

    function toggleDatePicker() {
      if (datePickerPanel.classList.contains('open')) closeDatePicker();
      else openDatePicker();
    }

    datePickerTrigger.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleDatePicker();
    });

    document.getElementById('datePickerPrev').addEventListener('click', (e) => {
      e.stopPropagation();
      if (datePickerView.month === 1) {
        datePickerView.month = 12;
        datePickerView.year--;
      } else {
        datePickerView.month--;
      }
      renderDatePickerGrid();
    });

    document.getElementById('datePickerNext').addEventListener('click', (e) => {
      e.stopPropagation();
      if (datePickerView.month === 12) {
        datePickerView.month = 1;
        datePickerView.year++;
      } else {
        datePickerView.month++;
      }
      renderDatePickerGrid();
    });

    document.getElementById('datePickerToday').addEventListener('click', (e) => {
      e.stopPropagation();
      setDatePickerValue(todayStr());
      closeDatePicker();
    });

    document.addEventListener('click', (e) => {
      if (!document.getElementById('datePickerWrap').contains(e.target)) {
        closeDatePicker();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeDatePicker();
    });

    setDatePickerValue(todayStr());

    document.getElementById('addDateBtn').addEventListener('click', () => {
      const date = datePickerEl.value;
      if (!date) { openDatePicker(); return; }
      const result = ensureDate(date);
      saveData();
      selectDate(date);
      if (result.carried > 0) {
        showCopyToast(`已从 ${formatDisplay(result.fromDate)} 带入 ${result.carried} 项未完成待办`);
      }
    });

    function updateSidebarActions(importBusy) {
      const busy = importBusy ?? document.getElementById('importOverlay').classList.contains('show');
      const hasDate = Boolean(selectedDate);
      document.getElementById('genPlanBtn').disabled = !hasDate || busy;
      document.getElementById('genReportBtn').disabled = !hasDate || busy;
    }

    /* ── Export / Import ── */
    document.getElementById('genPlanBtn').addEventListener('click', generateTodayPlan);
    document.getElementById('genReportBtn').addEventListener('click', generateDailyReport);
    document.getElementById('exportBtn').addEventListener('click', exportData);

    document.getElementById('importBtn').addEventListener('click', () => {
      document.getElementById('importFile').click();
    });

    document.getElementById('importFile').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) importData(file);
      e.target.value = '';
    });

    function exportData() {
      const payload = {
        version: 2,
        exportedAt: new Date().toISOString(),
        selectedDate: selectedDate,
        dates: data.dates
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `todo-backup-${todayStr()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    }

    let importWorker = null;
    let importWorkerFailed = false;

    function getImportWorker() {
      if (importWorkerFailed) return null;
      if (!importWorker) {
        try {
          importWorker = new Worker('import-worker.js');
        } catch (_) {
          importWorkerFailed = true;
          return null;
        }
      }
      return importWorker;
    }

    const IMPORT_ERRORS = {
      invalid_format: 'JSON 格式无效，需包含 dates 字段或直接以日期为键的对象。',
      empty: '未找到可合并的待办数据。',
      no_valid: '未找到可合并的有效待办。',
      parse_failed: '无法解析 JSON 文件，请检查文件格式。',
      worker_failed: 'Worker 解析失败，请重试。'
    };

    function normalizeImport(raw) {
      if (raw.dates && typeof raw.dates === 'object') return raw.dates;
      if (typeof raw === 'object' && !Array.isArray(raw)) {
        const looksLikeDates = Object.keys(raw).every(k => /^\d{4}-\d{2}-\d{2}$/.test(k));
        if (looksLikeDates) return raw;
      }
      return null;
    }

    function validateTodo(todo) {
      return todo && typeof todo.text === 'string';
    }

    async function parseImportOnMainThread(text, existingIds) {
      updateImportProgress(5, '正在解析 JSON…', '（主线程模式）');
      await yieldToUI();

      let raw;
      try {
        raw = JSON.parse(text);
      } catch (_) {
        throw new Error('parse_failed');
      }

      updateImportProgress(12, '正在校验格式…', '');
      await yieldToUI();

      const importedDates = normalizeImport(raw);
      if (!importedDates) throw new Error('invalid_format');

      const entries = [];
      for (const [dateStr, todos] of Object.entries(importedDates)) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr) || !Array.isArray(todos)) continue;
        for (const item of todos) entries.push({ dateStr, item });
      }
      if (entries.length === 0) throw new Error('empty');

      const tasks = [];
      let skippedTodos = 0;
      const total = entries.length;
      const CHUNK = 150;

      for (let i = 0; i < entries.length; i++) {
        const { dateStr, item } = entries[i];
        if (!validateTodo(item)) {
          skippedTodos++;
        } else {
          const todo = normalizeImportedTodo(item, existingIds);
          tasks.push({ dateStr, todo });
        }

        if ((i + 1) % CHUNK === 0 || i === entries.length - 1) {
          updateImportProgress(
            12 + ((i + 1) / total) * 38,
            '正在预处理待办…',
            `已校验 ${i + 1} / ${total} 项`
          );
          await yieldToUI();
        }
      }

      if (tasks.length === 0) throw new Error('no_valid');
      return { tasks, skippedTodos };
    }

    function parseImportInWorker(text, existingIds) {
      return new Promise((resolve, reject) => {
        const worker = getImportWorker();
        if (!worker) {
          reject(new Error('worker_unavailable'));
          return;
        }
        const onMessage = (e) => {
          const msg = e.data;
          if (msg.type === 'progress') {
            updateImportProgress(msg.pct, msg.status, msg.detail);
          } else if (msg.type === 'done') {
            cleanup();
            resolve(msg);
          } else if (msg.type === 'error') {
            cleanup();
            reject(new Error(msg.code || 'worker_failed'));
          }
        };
        const onError = () => {
          cleanup();
          importWorkerFailed = true;
          importWorker = null;
          reject(new Error('worker_unavailable'));
        };
        const cleanup = () => {
          worker.removeEventListener('message', onMessage);
          worker.removeEventListener('error', onError);
        };
        worker.addEventListener('message', onMessage);
        worker.addEventListener('error', onError);
        worker.postMessage({ text, existingIds: [...existingIds] });
      });
    }

    async function parseImport(text, existingIds) {
      try {
        return await parseImportInWorker(text, existingIds);
      } catch (err) {
        if (err.message !== 'worker_unavailable' && err.message !== 'worker_failed') throw err;
        return parseImportOnMainThread(text, existingIds);
      }
    }

    function yieldToUI() {
      return new Promise(resolve => {
        requestAnimationFrame(() => setTimeout(resolve, 0));
      });
    }

    function readFileAsText(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('read failed'));
        reader.readAsText(file);
      });
    }

    function setImportBusy(busy) {
      document.getElementById('importOverlay').classList.toggle('show', busy);
      document.getElementById('importBtn').disabled = busy;
      document.getElementById('exportBtn').disabled = busy;
      document.getElementById('addDateBtn').disabled = busy;
      updateSidebarActions(busy);
    }

    function resetImportDialog() {
      const dialog = document.getElementById('importDialog');
      dialog.classList.remove('success', 'error');
      document.getElementById('importTitle').textContent = '📥 正在导入';
      document.getElementById('importProgressSection').classList.remove('hide');
      document.getElementById('importResultSection').classList.remove('show');
      document.getElementById('importResultSummary').textContent = '';
      document.getElementById('importResultStats').innerHTML = '';
      updateImportProgress(0, '准备中…', '');
    }

    function closeImportOverlay() {
      setImportBusy(false);
      resetImportDialog();
    }

    function showImportResult(type, opts = {}) {
      const dialog = document.getElementById('importDialog');
      dialog.classList.remove('success', 'error');
      dialog.classList.add(type);
      document.getElementById('importProgressSection').classList.add('hide');
      document.getElementById('importResultSection').classList.add('show');

      if (type === 'success') {
        document.getElementById('importTitle').textContent = '✅ 导入完成';
        document.getElementById('importResultSummary').textContent = '数据已成功合并，点击确认进入系统';
        const stats = [
          `<li>新增日期：<strong>${opts.addedDates}</strong> 个</li>`,
          `<li>合并待办：<strong>${opts.addedTodos}</strong> 项</li>`
        ];
        if (opts.skippedTodos) {
          stats.push(`<li>跳过无效项：<strong>${opts.skippedTodos}</strong> 项</li>`);
        }
        document.getElementById('importResultStats').innerHTML = stats.join('');
      } else {
        document.getElementById('importTitle').textContent = '❌ 导入失败';
        document.getElementById('importResultSummary').textContent = opts.message || '导入过程中出现错误';
        document.getElementById('importResultStats').innerHTML = '';
      }
    }

    document.getElementById('importConfirmBtn').addEventListener('click', closeImportOverlay);

    function updateImportProgress(pct, status, detail) {
      const clamped = Math.min(100, Math.max(0, Math.round(pct)));
      document.getElementById('importProgressBar').style.width = clamped + '%';
      document.getElementById('importStatus').textContent = status;
      document.getElementById('importDetail').textContent = detail || '';
      document.getElementById('importPercent').textContent = clamped + '%';
    }

    async function importData(file) {
      resetImportDialog();
      setImportBusy(true);
      updateImportProgress(0, '正在读取文件…', file.name);

      let text;
      try {
        text = await readFileAsText(file);
      } catch (_) {
        showImportResult('error', { message: '读取文件失败，请重试。' });
        return;
      }

      updateImportProgress(5, '正在交给 Worker 解析…', `文件大小 ${(file.size / 1024).toFixed(1)} KB`);
      await yieldToUI();

      const existingIds = new Set();
      for (const todos of Object.values(data.dates)) {
        todos.forEach(t => existingIds.add(t.id));
      }

      let workerResult;
      try {
        workerResult = await parseImport(text, existingIds);
      } catch (err) {
        showImportResult('error', {
          message: IMPORT_ERRORS[err.message] || IMPORT_ERRORS.worker_failed
        });
        return;
      }

      const { tasks, skippedTodos: skippedFromWorker } = workerResult;
      let skippedTodos = skippedFromWorker;

      const addedDateSet = new Set();
      let addedTodos = 0;
      let processed = 0;
      const total = tasks.length;
      const CHUNK = 60;
      const affectedDates = new Set();

      updateImportProgress(52, '正在合并待办…', `0 / ${total} 项`);

      for (let i = 0; i < tasks.length; i += CHUNK) {
        const chunk = tasks.slice(i, i + CHUNK);
        for (const { dateStr, todo } of chunk) {
          if (!data.dates[dateStr]) {
            data.dates[dateStr] = [];
            addedDateSet.add(dateStr);
          }
          if (!Number.isFinite(todo.order) || todo.order < 1) {
            todo.order = getNextOrder(data.dates[dateStr], getPlanType(todo));
          }
          data.dates[dateStr].push(todo);
          affectedDates.add(dateStr);
          addedTodos++;
          processed++;
        }

        const pct = 52 + (processed / total) * 38;
        updateImportProgress(
          pct,
          '正在合并待办…',
          `已处理 ${processed} / ${total} 项 · 新增 ${addedTodos} 项${skippedTodos ? ` · 跳过 ${skippedTodos} 项` : ''}`
        );
        await yieldToUI();
      }

      for (const dateStr of affectedDates) {
        reindexDateTodos(data.dates[dateStr]);
      }

      if (addedTodos === 0 && addedDateSet.size === 0) {
        showImportResult('error', { message: '未找到可合并的有效待办。' });
        return;
      }

      updateImportProgress(93, '正在保存到本地…', '写入 localStorage');
      await yieldToUI();
      saveData();

      updateImportProgress(97, '正在刷新界面…', '');
      await yieldToUI();
      renderTree();
      if (selectedDate && data.dates[selectedDate]) {
        renderMain();
      } else {
        const dates = Object.keys(data.dates).sort();
        if (dates.length > 0) selectDate(dates[dates.length - 1]);
      }

      updateImportProgress(100, '导入完成', `共合并 ${addedTodos} 项待办，新增 ${addedDateSet.size} 个日期`);
      showImportResult('success', {
        addedDates: addedDateSet.size,
        addedTodos,
        skippedTodos: skippedTodos || 0
      });
    }

    /* ── Init ── */
    migrateData();

    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const sidebarBackdrop = document.getElementById('sidebarBackdrop');
    const sidebarEl = document.getElementById('sidebar');

    function isMobileLayout() {
      return window.matchMedia('(max-width: 768px)').matches;
    }

    function openSidebar() {
      sidebarEl.classList.add('open');
      sidebarBackdrop.classList.add('show');
      sidebarBackdrop.setAttribute('aria-hidden', 'false');
      mobileMenuBtn.setAttribute('aria-expanded', 'true');
    }

    function closeSidebar() {
      sidebarEl.classList.remove('open');
      sidebarBackdrop.classList.remove('show');
      sidebarBackdrop.setAttribute('aria-hidden', 'true');
      mobileMenuBtn.setAttribute('aria-expanded', 'false');
    }

    function toggleSidebar() {
      if (sidebarEl.classList.contains('open')) closeSidebar();
      else openSidebar();
    }

    mobileMenuBtn.addEventListener('click', toggleSidebar);
    sidebarBackdrop.addEventListener('click', closeSidebar);

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && document.getElementById('confirmOverlay').classList.contains('show')) {
        closeConfirm(false);
        return;
      }
      if (e.key === 'Escape' && sidebarEl.classList.contains('open')) closeSidebar();
    });

    window.addEventListener('resize', () => {
      if (!isMobileLayout()) closeSidebar();
      updateEmptyHint();
    });

    function updateEmptyHint() {
      const placeholder = document.getElementById('placeholder');
      if (placeholder) {
        placeholder.textContent = isMobileLayout()
          ? '☰ 点击左上角选择日期'
          : '← 请从左侧选择一个日期';
      }
    }

    if (!data.dates[selectedDate]) {
      ensureDate(selectedDate);
      saveData();
    }

    renderTree();
    updateEmptyHint();
    updateSidebarActions();
    if (selectedDate) {
      renderMain();
    }