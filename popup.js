(function () {
  "use strict";

  const DEFAULT_DATA = {
    todos: [],
    notes: [],
    settings: {
      floatingWidgetEnabled: false,
      floatingWidgetCollapsed: false
    }
  };

  const tabButtons = document.querySelectorAll(".tab");
  const todoPanel = document.getElementById("todoPanel");
  const notePanel = document.getElementById("notePanel");
  const addBtn = document.getElementById("addBtn");
  const autoSortBtn = document.getElementById("autoSortBtn");
  const viewCompletedBtn = document.getElementById("viewCompletedBtn");
  const todoList = document.getElementById("todoList");
  const upcomingList = document.getElementById("upcomingList");
  const completedList = document.getElementById("completedList");
  const todoForm = document.getElementById("todoForm");
  const noteList = document.getElementById("noteList");
  const noteForm = document.getElementById("noteForm");
  const upcomingSection = document.getElementById("upcomingSection");
  const completedSection = document.getElementById("completedSection");
  const floatingToggle = document.getElementById("floatingToggle");
  const floatingCollapsedToggle = document.getElementById("floatingCollapsedToggle");

  let state = {
    todos: [],
    notes: [],
    settings: { floatingWidgetEnabled: false, floatingWidgetCollapsed: false },
    activeTab: "todo",
    showCompleted: false
  };

  function generateId() {
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function escapeHtml(value) {
    return value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function nowMs() {
    return Date.now();
  }

  function formatDateTime(ms) {
    if (!ms) return "N/A";
    const date = new Date(ms);
    return date.toLocaleString();
  }

  function toDateInputValue(ms) {
    if (!ms) return "";
    const date = new Date(ms);
    const pad = (n) => n.toString().padStart(2, "0");
    const yyyy = date.getFullYear();
    const mm = pad(date.getMonth() + 1);
    const dd = pad(date.getDate());
    return `${yyyy}-${mm}-${dd}`;
  }

  function toTimeInputValue(ms) {
    if (!ms) return "";
    const date = new Date(ms);
    const pad = (n) => n.toString().padStart(2, "0");
    const hh = pad(date.getHours());
    const min = pad(date.getMinutes());
    return `${hh}:${min}`;
  }

  function todayDateString() {
    return toDateInputValue(nowMs());
  }

  function nowTimeString() {
    const date = new Date();
    const pad = (n) => n.toString().padStart(2, "0");
    return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function combineDateTime(dateValue, timeValue, defaultTime) {
    if (!dateValue && !timeValue) return null;
    const datePart = dateValue || todayDateString();
    const timePart = timeValue || defaultTime;
    return new Date(`${datePart}T${timePart}`).getTime();
  }

  function updateTimeMin(dateInput, timeInput, assumeTodayIfEmpty) {
    const dateValue = dateInput.value || (assumeTodayIfEmpty ? todayDateString() : "");
    if (dateValue === todayDateString()) {
      timeInput.min = nowTimeString();
      if (timeInput.value && timeInput.value < timeInput.min) {
        timeInput.value = "";
      }
    } else {
      timeInput.min = "";
    }
  }

  function getStatus(todo, now) {
    if (todo.completed) return "completed";
    if (todo.startAt && now < todo.startAt) return "upcoming";
    if (now > todo.deadline) return "overdue";
    return "active";
  }

  function getUrgency(todo, now) {
    if (todo.completed) return 0;
    const start = todo.startAt || todo.createdAt;
    const total = Math.max(todo.deadline - start, 1);
    const elapsed = Math.max(now - start, 0);
    return Math.min(elapsed / total, 1);
  }

  function getColorClass(todo, now) {
    const status = getStatus(todo, now);
    if (status === "overdue") return "red";
    if (status === "upcoming") return "blue";
    const progress = getUrgency(todo, now);
    if (progress < 0.5) return "green";
    if (progress < 0.8) return "yellow";
    return "orange";
  }

  function cleanupCompleted(todos) {
    const cutoff = nowMs() - 7 * 24 * 60 * 60 * 1000;
    return todos.filter((todo) => !(todo.completed && todo.completedAt && todo.completedAt < cutoff));
  }

  function persist() {
    chrome.storage.local.set({
      todos: state.todos,
      notes: state.notes,
      settings: state.settings
    });
  }

  function ensureDefaults(data) {
    return {
      todos: Array.isArray(data.todos) ? data.todos : [],
      notes: Array.isArray(data.notes) ? data.notes : [],
      settings: {
        floatingWidgetEnabled:
          data.settings && typeof data.settings.floatingWidgetEnabled === "boolean"
            ? data.settings.floatingWidgetEnabled
            : false,
        floatingWidgetCollapsed:
          data.settings && typeof data.settings.floatingWidgetCollapsed === "boolean"
            ? data.settings.floatingWidgetCollapsed
            : false
      }
    };
  }

  function loadData() {
    chrome.storage.local.get(DEFAULT_DATA, (data) => {
      const normalized = ensureDefaults(data);
      normalized.todos = cleanupCompleted(normalized.todos);
      state.todos = normalized.todos;
      state.notes = normalized.notes;
      state.settings = normalized.settings;
      floatingToggle.checked = state.settings.floatingWidgetEnabled;
      floatingCollapsedToggle.checked = state.settings.floatingWidgetCollapsed;
      persist();
      render();
    });
  }

  function setActiveTab(tab) {
    state.activeTab = tab;
    tabButtons.forEach((btn) => {
      const isActive = btn.dataset.tab === tab;
      btn.classList.toggle("active", isActive);
      btn.setAttribute("aria-selected", isActive ? "true" : "false");
    });
    todoPanel.classList.toggle("active", tab === "todo");
    notePanel.classList.toggle("active", tab === "note");
    autoSortBtn.classList.toggle("hidden", tab !== "todo");
    viewCompletedBtn.classList.toggle("hidden", tab !== "todo");
    todoForm.classList.add("hidden");
    noteForm.classList.add("hidden");
  }

  function openTodoForm(todo) {
    const isEdit = Boolean(todo);
    const payload = todo || {
      id: "",
      text: "",
      startAt: null,
      deadline: null
    };
    todoForm.innerHTML = `
      <div class="form-row">
        <label for="todoText">Task</label>
        <input id="todoText" type="text" />
      </div>
      <div class="form-row split-row">
        <label>Start (optional)</label>
        <div class="row-inputs">
          <input id="todoStartDate" type="date" />
          <input id="todoStartTime" type="time" />
        </div>
      </div>
      <div class="form-row split-row">
        <label>Target (date or time required)</label>
        <div class="row-inputs">
          <input id="todoDeadlineDate" type="date" />
          <input id="todoDeadlineTime" type="time" />
        </div>
      </div>
      <div class="form-actions">
        ${isEdit ? '<button id="todoDeleteBtn" class="btn danger" type="button">Delete</button>' : ""}
        <button id="todoCancelBtn" class="btn" type="button">Cancel</button>
        <button id="todoSaveBtn" class="btn primary" type="button">
          ${isEdit ? "Update" : "Add"}
        </button>
      </div>
    `;
    todoForm.classList.remove("hidden");
    const todoTextInput = document.getElementById("todoText");
    const startDateInput = document.getElementById("todoStartDate");
    const startTimeInput = document.getElementById("todoStartTime");
    const deadlineDateInput = document.getElementById("todoDeadlineDate");
    const deadlineTimeInput = document.getElementById("todoDeadlineTime");
    todoTextInput.value = payload.text;
    todoTextInput.focus();

    startDateInput.value = toDateInputValue(payload.startAt);
    startTimeInput.value = toTimeInputValue(payload.startAt);
    deadlineDateInput.value = toDateInputValue(payload.deadline);
    deadlineTimeInput.value = toTimeInputValue(payload.deadline);

    startDateInput.min = todayDateString();
    deadlineDateInput.min = todayDateString();
    updateTimeMin(startDateInput, startTimeInput, true);
    updateTimeMin(deadlineDateInput, deadlineTimeInput, true);

    startDateInput.addEventListener("change", () => {
      updateTimeMin(startDateInput, startTimeInput, true);
    });

    deadlineDateInput.addEventListener("change", () => {
      updateTimeMin(deadlineDateInput, deadlineTimeInput, true);
    });

    document.getElementById("todoCancelBtn").addEventListener("click", () => {
      todoForm.classList.add("hidden");
    });

    if (isEdit) {
      document.getElementById("todoDeleteBtn").addEventListener("click", () => {
        state.todos = state.todos.filter((item) => item.id !== todo.id);
        persist();
        todoForm.classList.add("hidden");
        render();
      });
    }

    document.getElementById("todoSaveBtn").addEventListener("click", () => {
      const text = document.getElementById("todoText").value.trim();
      const startDateValue = startDateInput.value;
      const startTimeValue = startTimeInput.value;
      const deadlineDateValue = deadlineDateInput.value;
      const deadlineTimeValue = deadlineTimeInput.value;
      if (!text) return;
      if (!deadlineDateValue && !deadlineTimeValue) return;

      const startAt = combineDateTime(startDateValue, startTimeValue, "00:00");
      const deadline = combineDateTime(deadlineDateValue, deadlineTimeValue, "23:59");

      if (startAt && startAt < nowMs() && (startDateValue === todayDateString() || !startDateValue)) {
        return;
      }
      if (deadline && deadline < nowMs() && (deadlineDateValue === todayDateString() || !deadlineDateValue)) {
        return;
      }
      if (isEdit) {
        state.todos = state.todos.map((item) =>
          item.id === todo.id
            ? {
                ...item,
                text,
                startAt,
                deadline
              }
            : item
        );
      } else {
        state.todos.push({
          id: generateId(),
          text,
          createdAt: nowMs(),
          startAt,
          deadline,
          order: state.todos.length,
          completed: false,
          completedAt: null,
          manualOrder: false
        });
      }
      persist();
      todoForm.classList.add("hidden");
      render();
    });
  }

  function openNoteForm(note) {
    const isEdit = Boolean(note);
    const payload = note || { id: "", text: "" };
    noteForm.innerHTML = `
      <div class="form-row">
        <label for="noteText">Note</label>
        <textarea id="noteText" rows="4"></textarea>
      </div>
      <div class="form-actions">
        ${isEdit ? '<button id="noteDeleteBtn" class="btn danger" type="button">Delete</button>' : ""}
        <button id="noteCancelBtn" class="btn" type="button">Cancel</button>
        <button id="noteSaveBtn" class="btn primary" type="button">
          ${isEdit ? "Update" : "Add"}
        </button>
      </div>
    `;
    noteForm.classList.remove("hidden");
    const noteTextInput = document.getElementById("noteText");
    noteTextInput.value = payload.text;
    noteTextInput.focus();

    document.getElementById("noteCancelBtn").addEventListener("click", () => {
      noteForm.classList.add("hidden");
    });

    if (isEdit) {
      document.getElementById("noteDeleteBtn").addEventListener("click", () => {
        state.notes = state.notes.filter((item) => item.id !== note.id);
        persist();
        noteForm.classList.add("hidden");
        render();
      });
    }

    document.getElementById("noteSaveBtn").addEventListener("click", () => {
      const text = document.getElementById("noteText").value.trim();
      if (!text) return;
      if (isEdit) {
        state.notes = state.notes.map((item) =>
          item.id === note.id
            ? {
                ...item,
                text
              }
            : item
        );
      } else {
        state.notes.push({
          id: generateId(),
          text,
          createdAt: nowMs()
        });
      }
      persist();
      noteForm.classList.add("hidden");
      render();
    });
  }

  function sortTodos(todos) {
    const now = nowMs();
    const anyManual = todos.some((todo) => todo.manualOrder);
    if (anyManual) {
      return [...todos].sort((a, b) => a.order - b.order);
    }

    const active = [];
    const upcoming = [];
    const completed = [];
    todos.forEach((todo) => {
      const status = getStatus(todo, now);
      if (status === "completed") completed.push(todo);
      else if (status === "upcoming") upcoming.push(todo);
      else active.push(todo);
    });

    active.sort((a, b) => {
      const statusA = getStatus(a, now);
      const statusB = getStatus(b, now);
      if (statusA === "overdue" && statusB !== "overdue") return -1;
      if (statusB === "overdue" && statusA !== "overdue") return 1;
      return getUrgency(b, now) - getUrgency(a, now);
    });

    upcoming.sort((a, b) => (a.startAt || a.deadline) - (b.startAt || b.deadline));

    const ordered = [...active, ...upcoming, ...completed];
    ordered.forEach((todo, index) => {
      todo.order = index;
    });
    return ordered;
  }

  function renderTodos() {
    const now = nowMs();
    state.todos = sortTodos(cleanupCompleted(state.todos));

    const activeItems = [];
    const upcomingItems = [];
    const completedItems = [];

    state.todos.forEach((todo) => {
      const status = getStatus(todo, now);
      if (status === "completed") completedItems.push(todo);
      else if (status === "upcoming") upcomingItems.push(todo);
      else activeItems.push(todo);
    });

    todoList.innerHTML = "";
    upcomingList.innerHTML = "";
    completedList.innerHTML = "";

    activeItems.forEach((todo) => {
      const item = buildTodoItem(todo, now, true);
      todoList.appendChild(item);
    });

    upcomingItems.forEach((todo) => {
      const item = buildTodoItem(todo, now, false);
      upcomingList.appendChild(item);
    });

    completedItems.forEach((todo) => {
      const item = buildTodoItem(todo, now, false);
      completedList.appendChild(item);
    });

    upcomingSection.classList.toggle("hidden", upcomingItems.length === 0);
    completedSection.classList.toggle("hidden", !state.showCompleted || completedItems.length === 0);
  }

  function buildTodoItem(todo, now, draggable) {
    const item = document.createElement("li");
    item.className = "list-item";
    item.dataset.id = todo.id;

    if (draggable) {
      item.setAttribute("draggable", "true");
      item.addEventListener("dragstart", handleDragStart);
      item.addEventListener("dragend", handleDragEnd);
      item.addEventListener("dragover", handleDragOver);
      item.addEventListener("drop", handleDrop);
    }

    const status = getStatus(todo, now);
    const badgeClass = getColorClass(todo, now);
    const metaText = `Start: ${formatDateTime(todo.startAt)} | Target: ${formatDateTime(
      todo.deadline
    )}`;
    const pillText =
      status === "overdue"
        ? "Overdue"
        : status === "upcoming"
          ? "Upcoming"
          : status === "completed"
            ? "Completed"
            : "Active";

    item.innerHTML = `
      <div class="item-row">
        <div class="check-wrap">
          <input class="check-input complete-toggle" type="checkbox" ${
            todo.completed ? "checked" : ""
          } />
        </div>
        <div class="item-main">
          <div class="item-title">${escapeHtml(todo.text)}</div>
          <div class="item-meta">${metaText}</div>
          <div><span class="pill ${badgeClass}">${pillText}</span></div>
        </div>
      </div>
    `;

    item.addEventListener("click", (event) => {
      if (event.target.closest(".complete-toggle")) return;
      openTodoForm(todo);
    });

    const completeToggle = item.querySelector(".complete-toggle");
    completeToggle.addEventListener("change", (event) => {
      event.stopPropagation();
      const isCompleted = completeToggle.checked;
      state.todos = state.todos.map((item) =>
        item.id === todo.id
          ? {
              ...item,
              completed: isCompleted,
              completedAt: isCompleted ? nowMs() : null
            }
          : item
      );
      persist();
      render();
    });

    return item;
  }

  let dragState = { id: null };

  function handleDragStart(event) {
    const id = event.currentTarget.dataset.id;
    dragState.id = id;
    event.dataTransfer.effectAllowed = "move";
    event.currentTarget.classList.add("dragging");
  }

  function handleDragEnd(event) {
    event.currentTarget.classList.remove("dragging");
  }

  function handleDragOver(event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }

  function handleDrop(event) {
    event.preventDefault();
    const targetId = event.currentTarget.dataset.id;
    if (!dragState.id || dragState.id === targetId) return;

    const activeIds = Array.from(todoList.children).map((item) => item.dataset.id);
    const fromIndex = activeIds.indexOf(dragState.id);
    const toIndex = activeIds.indexOf(targetId);
    if (fromIndex === -1 || toIndex === -1) return;

    activeIds.splice(toIndex, 0, activeIds.splice(fromIndex, 1)[0]);
    const upcomingItems = state.todos.filter((todo) => getStatus(todo, nowMs()) === "upcoming");

    state.todos = state.todos.map((todo) => {
      if (activeIds.includes(todo.id)) {
        return { ...todo, manualOrder: true };
      }
      return todo;
    });

    const ordered = [];
    activeIds.forEach((id, index) => {
      const item = state.todos.find((todo) => todo.id === id);
      if (item) ordered.push({ ...item, order: index, manualOrder: true });
    });

    upcomingItems.forEach((item, index) => {
      ordered.push({ ...item, order: activeIds.length + index, manualOrder: true });
    });

    const completedItems = state.todos.filter((todo) => todo.completed);
    completedItems.forEach((item, index) => {
      ordered.push({ ...item, order: activeIds.length + upcomingItems.length + index });
    });

    state.todos = ordered;
    persist();
    render();
  }

  function renderNotes() {
    noteList.innerHTML = "";
    state.notes.forEach((note) => {
      const item = document.createElement("li");
      item.className = "list-item";
      item.innerHTML = `
        <div class="item-main">
          <div class="item-title">${escapeHtml(note.text)}</div>
          <div class="item-meta">${formatDateTime(note.createdAt)}</div>
        </div>
      `;
      item.addEventListener("click", () => openNoteForm(note));
      noteList.appendChild(item);
    });
  }

  function render() {
    renderTodos();
    renderNotes();
    persist();
  }

  tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => setActiveTab(btn.dataset.tab));
  });

  document.querySelectorAll(".tooltip-btn").forEach((btn) => {
    btn.addEventListener("click", (event) => {
      event.stopPropagation();
      const toggle = btn.closest(".toggle");
      if (!toggle) return;
      document.querySelectorAll(".toggle.show-tooltip").forEach((el) => {
        if (el !== toggle) el.classList.remove("show-tooltip");
      });
      toggle.classList.toggle("show-tooltip");
    });
  });

  document.addEventListener("click", () => {
    document.querySelectorAll(".toggle.show-tooltip").forEach((el) => {
      el.classList.remove("show-tooltip");
    });
  });

  addBtn.addEventListener("click", () => {
    if (state.activeTab === "todo") {
      openTodoForm(null);
    } else {
      openNoteForm(null);
    }
  });

  autoSortBtn.addEventListener("click", () => {
    state.todos = state.todos.map((todo) => ({ ...todo, manualOrder: false }));
    render();
  });

  viewCompletedBtn.addEventListener("click", () => {
    state.showCompleted = !state.showCompleted;
    viewCompletedBtn.textContent = state.showCompleted ? "Hide Completed" : "View Completed";
    renderTodos();
  });

  floatingToggle.addEventListener("change", () => {
    state.settings.floatingWidgetEnabled = floatingToggle.checked;
    persist();
  });

  floatingCollapsedToggle.addEventListener("change", () => {
    state.settings.floatingWidgetCollapsed = floatingCollapsedToggle.checked;
    persist();
  });

  setActiveTab("todo");
  loadData();
})();


