(function () {
  "use strict";

  const WIDGET_ID = "simple-todo-widget";
  const STORAGE_DEFAULTS = {
    todos: [],
    notes: [],
    settings: { floatingWidgetEnabled: false, floatingWidgetCollapsed: false }
  };

  let widget = null;
  let isCollapsed = false;
  let viewMode = "todo";
  let dataCache = { todos: [], notes: [] };
  let drag = {
    active: false,
    offsetX: 0,
    offsetY: 0,
    startX: 0,
    startY: 0,
    moved: false,
    width: 0,
    height: 0,
    nextX: 0,
    nextY: 0,
    raf: 0,
    suppressClickUntil: 0
  };
  let anchor = { x: null, y: null };

  function nowMs() {
    return Date.now();
  }

  function getStatus(todo, now) {
    if (todo.completed) return "completed";
    if (todo.startAt && now < todo.startAt) return "upcoming";
    if (now > todo.deadline) return "overdue";
    return "active";
  }

  function getUrgency(todo, now) {
    const start = todo.startAt || todo.createdAt;
    const total = Math.max(todo.deadline - start, 1);
    const elapsed = Math.max(now - start, 0);
    return Math.min(elapsed / total, 1);
  }

  function lockPosition() {
    if (!widget) return;
    const rect = widget.getBoundingClientRect();
    widget.style.left = `${rect.left}px`;
    widget.style.top = `${rect.top}px`;
    widget.style.right = "auto";
    widget.style.bottom = "auto";
  }

  function saveAnchor() {
    if (!widget) return;
    const rect = widget.getBoundingClientRect();
    anchor = { x: rect.left, y: rect.top };
  }

  function restoreAnchor() {
    if (!widget || anchor.x === null || anchor.y === null) return;
    widget.style.left = `${anchor.x}px`;
    widget.style.top = `${anchor.y}px`;
    widget.style.right = "auto";
    widget.style.bottom = "auto";
  }

  function clampWidget() {
    if (!widget) return;
    const rect = widget.getBoundingClientRect();
    const maxLeft = Math.max(0, window.innerWidth - rect.width);
    const maxTop = Math.max(0, window.innerHeight - rect.height);
    const nextLeft = Math.min(Math.max(0, rect.left), maxLeft);
    const nextTop = Math.min(Math.max(0, rect.top), maxTop);
    widget.style.left = `${nextLeft}px`;
    widget.style.top = `${nextTop}px`;
    widget.style.right = "auto";
    widget.style.bottom = "auto";
  }

  function buildWidget() {
    if (widget) return widget;
    const iconUrl = chrome.runtime.getURL("icons/icon48.png");
    widget = document.createElement("div");
    widget.id = WIDGET_ID;
    widget.innerHTML = `
      <button class="stw-fab" type="button" aria-label="Open todos">
        <img src="${iconUrl}" alt="" draggable="false" />
      </button>
      <div class="stw-panel">
        <div class="stw-header">
          <span class="stw-title">Active Todos</span>
          <button class="stw-toggle" type="button">-</button>
        </div>
        <div class="stw-switch" role="tablist" aria-label="Widget view">
          <button class="stw-switch-btn active" type="button" data-view="todo">Todo</button>
          <button class="stw-switch-btn" type="button" data-view="note">Note</button>
        </div>
        <ul class="stw-list"></ul>
      </div>
    `;
    document.body.appendChild(widget);

    const style = document.createElement("style");
    style.textContent = `
      #${WIDGET_ID} {
        position: fixed;
        top: 80px;
        right: 16px;
        background: #ffffff;
        border: 1px solid #e5e7eb;
        border-radius: 12px;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.12);
        font-family: "Georgia", "Times New Roman", serif;
        z-index: 999999;
      }
      #${WIDGET_ID}.hidden { display: none; }
      #${WIDGET_ID}.collapsed {
        border: none;
        background: transparent;
        box-shadow: none;
      }
      #${WIDGET_ID}.collapsed .stw-panel { display: none; }
      #${WIDGET_ID}:not(.collapsed) .stw-fab { display: none; }
      #${WIDGET_ID} .stw-panel {
        width: 220px;
        overflow: hidden;
        border-radius: 12px;
        background: #ffffff;
      }
      #${WIDGET_ID} .stw-fab {
        width: 48px;
        height: 48px;
        border-radius: 50%;
        border: 1px solid #e5e7eb;
        background: #ffffff;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.12);
        padding: 0;
      }
      #${WIDGET_ID} .stw-fab img {
        width: 28px;
        height: 28px;
        display: block;
        pointer-events: none;
        -webkit-user-drag: none;
        user-select: none;
      }
      #${WIDGET_ID} .stw-header {
        cursor: move;
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 8px 10px;
        border-bottom: 1px solid #f1f5f9;
        background: #f8fafc;
        font-size: 12px;
        color: #374151;
      }
      #${WIDGET_ID} .stw-toggle {
        border: none;
        background: transparent;
        cursor: pointer;
        font-size: 14px;
      }
      #${WIDGET_ID} .stw-switch {
        display: flex;
        gap: 6px;
        padding: 6px 10px 0;
      }
      #${WIDGET_ID} .stw-switch-btn {
        border: 1px solid #e5e7eb;
        background: #ffffff;
        color: #4b5563;
        font-size: 11px;
        padding: 4px 8px;
        border-radius: 999px;
        cursor: pointer;
      }
      #${WIDGET_ID} .stw-switch-btn.active {
        border-color: #0f766e;
        color: #0f766e;
        background: #e7f7f5;
      }
      #${WIDGET_ID} .stw-list {
        list-style: none;
        margin: 0;
        padding: 8px 10px;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      #${WIDGET_ID} .stw-item {
        font-size: 12px;
        padding: 6px 8px;
        border-radius: 8px;
        background: #f3f4f6;
        color: #111827;
      }
      #${WIDGET_ID} .stw-item.green { border-left: 3px solid #16a34a; }
      #${WIDGET_ID} .stw-item.yellow { border-left: 3px solid #d97706; }
      #${WIDGET_ID} .stw-item.orange { border-left: 3px solid #c2410c; }
      #${WIDGET_ID} .stw-item.red { border-left: 3px solid #b91c1c; }
    `;
    document.head.appendChild(style);

    const header = widget.querySelector(".stw-header");
    const fab = widget.querySelector(".stw-fab");
    const toggle = widget.querySelector(".stw-toggle");
    const switchButtons = widget.querySelectorAll(".stw-switch-btn");

    switchButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        viewMode = btn.dataset.view;
        updateSwitchUI();
        render(dataCache.todos, dataCache.notes);
      });
    });
    toggle.addEventListener("mousedown", (event) => {
      event.stopPropagation();
    });

    toggle.addEventListener("click", () => {
      restoreAnchor();
      lockPosition();
      isCollapsed = true;
      widget.classList.add("collapsed");
      clampWidget();
    });

    fab.addEventListener("click", () => {
      if (Date.now() < drag.suppressClickUntil) return;
      saveAnchor();
      restoreAnchor();
      lockPosition();
      isCollapsed = false;
      widget.classList.remove("collapsed");
      window.requestAnimationFrame(() => {
        clampWidget();
      });
    });

    function startDrag(event) {
      drag.active = true;
      drag.moved = false;
      drag.startX = event.clientX;
      drag.startY = event.clientY;
      const rect = widget.getBoundingClientRect();
      drag.offsetX = event.clientX - rect.left;
      drag.offsetY = event.clientY - rect.top;
      drag.width = rect.width;
      drag.height = rect.height;
    }

    header.addEventListener("mousedown", startDrag);
    fab.addEventListener("mousedown", startDrag);

    document.addEventListener("mousemove", (event) => {
      if (!drag.active) return;
      if (!drag.moved) {
        const dx = Math.abs(event.clientX - drag.startX);
        const dy = Math.abs(event.clientY - drag.startY);
        if (dx > 4 || dy > 4) {
          drag.moved = true;
        } else {
          return;
        }
      }
      const maxLeft = Math.max(0, window.innerWidth - drag.width);
      const maxTop = Math.max(0, window.innerHeight - drag.height);
      drag.nextX = Math.min(Math.max(0, event.clientX - drag.offsetX), maxLeft);
      drag.nextY = Math.min(Math.max(0, event.clientY - drag.offsetY), maxTop);
      if (drag.raf) return;
      drag.raf = window.requestAnimationFrame(() => {
        widget.style.left = `${drag.nextX}px`;
        widget.style.top = `${drag.nextY}px`;
        widget.style.right = "auto";
        widget.style.bottom = "auto";
        drag.raf = 0;
      });
    });

    document.addEventListener("mouseup", () => {
      if (drag.moved) {
        drag.suppressClickUntil = Date.now() + 200;
        saveAnchor();
      }
      drag.active = false;
      if (drag.raf) {
        window.cancelAnimationFrame(drag.raf);
        drag.raf = 0;
      }
    });

    return widget;
  }

  function updateSwitchUI() {
    const title = widget ? widget.querySelector(".stw-title") : null;
    if (title) title.textContent = viewMode === "note" ? "Notes" : "Active Todos";
    if (!widget) return;
    widget.querySelectorAll(".stw-switch-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.view === viewMode);
    });
  }

  function render(todos, notes) {
    const now = nowMs();
    const list = widget.querySelector(".stw-list");
    list.innerHTML = "";

    if (viewMode === "note") {
      if (!notes.length) {
        const empty = document.createElement("li");
        empty.className = "stw-item";
        empty.textContent = "No notes";
        list.appendChild(empty);
        return;
      }
      notes.forEach((note) => {
        const item = document.createElement("li");
        item.className = "stw-item";
        item.textContent = note.text;
        list.appendChild(item);
      });
      return;
    }

    const activeTodos = todos.filter(
      (todo) => getStatus(todo, now) === "active" || getStatus(todo, now) === "overdue"
    );
    if (activeTodos.length === 0) {
      const empty = document.createElement("li");
      empty.className = "stw-item";
      empty.textContent = "No active tasks";
      list.appendChild(empty);
      return;
    }

    activeTodos
      .sort((a, b) => getUrgency(b, now) - getUrgency(a, now))
      .forEach((todo) => {
        const item = document.createElement("li");
        const urgency = getUrgency(todo, now);
        let color = "green";
        if (now > todo.deadline) color = "red";
        else if (urgency >= 0.8) color = "orange";
        else if (urgency >= 0.5) color = "yellow";
        item.className = `stw-item ${color}`;
        item.textContent = todo.text;
        list.appendChild(item);
      });
  }

  function refresh() {
    chrome.storage.local.get(STORAGE_DEFAULTS, (data) => {
      const settings = data.settings || STORAGE_DEFAULTS.settings;
      if (!settings.floatingWidgetEnabled) {
        if (widget) widget.classList.add("hidden");
        return;
      }
      isCollapsed = Boolean(settings.floatingWidgetCollapsed);
      buildWidget().classList.remove("hidden");
      widget.classList.toggle("collapsed", isCollapsed);
      window.requestAnimationFrame(() => {
        clampWidget();
      });
      dataCache.todos = Array.isArray(data.todos) ? data.todos : [];
      dataCache.notes = Array.isArray(data.notes) ? data.notes : [];
      updateSwitchUI();
      render(dataCache.todos, dataCache.notes);
    });
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.todos || changes.settings) refresh();
  });

  refresh();
})();

