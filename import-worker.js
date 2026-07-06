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

function normalizeImportedTodo(item, existingIds) {
  const STATUS_ORDER = ['pending', 'completed', 'on_hold'];
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

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

self.onmessage = function (e) {
  const { text, existingIds: idList } = e.data;
  const existingIds = new Set(idList || []);

  try {
    self.postMessage({ type: 'progress', pct: 5, status: 'Worker 正在解析 JSON…', detail: '' });
    const raw = JSON.parse(text);

    self.postMessage({ type: 'progress', pct: 12, status: 'Worker 正在校验格式…', detail: '' });
    const importedDates = normalizeImport(raw);
    if (!importedDates) {
      self.postMessage({ type: 'error', code: 'invalid_format' });
      return;
    }

    const entries = [];
    for (const [dateStr, todos] of Object.entries(importedDates)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr) || !Array.isArray(todos)) continue;
      for (const item of todos) entries.push({ dateStr, item });
    }

    if (entries.length === 0) {
      self.postMessage({ type: 'error', code: 'empty' });
      return;
    }

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
        self.postMessage({
          type: 'progress',
          pct: 12 + ((i + 1) / total) * 38,
          status: 'Worker 正在预处理待办…',
          detail: '已校验 ' + (i + 1) + ' / ' + total + ' 项'
        });
      }
    }

    if (tasks.length === 0) {
      self.postMessage({ type: 'error', code: 'no_valid' });
      return;
    }

    self.postMessage({ type: 'done', tasks, skippedTodos });
  } catch (_) {
    self.postMessage({ type: 'error', code: 'parse_failed' });
  }
};
