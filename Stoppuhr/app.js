(function () {
  "use strict";

  const STORAGE_SEQUENCES = "intervalTimer.sequences.v1";
  const STORAGE_DRAFT = "intervalTimer.draft.v1";

  /** @typedef {{ id: string, label: string, durationSeconds: number }} Step */
  /** @typedef {{ id: string, name: string, steps: Step[] }} Sequence */

  /** @type {Sequence[]} */
  let sequences = [];
  /** @type {string | null} */
  let selectedSavedId = null;

  /**
   * @typedef {"idle"|"running"|"paused"} TimerMode
   * @type {{
   *   mode: TimerMode;
   *   steps: Step[];
   *   stepIndex: number;
   *   endTime: number | null;
   *   pausedRemainingMs: number | null;
   *   intervalId: ReturnType<typeof setInterval> | null;
   * }}
   */
  const timer = {
    mode: "idle",
    steps: [],
    stepIndex: 0,
    endTime: null,
    pausedRemainingMs: null,
    intervalId: null,
  };

  const els = {
    flowName: document.getElementById("flow-name"),
    savedFlows: document.getElementById("saved-flows"),
    btnLoad: document.getElementById("btn-load"),
    btnDeleteSaved: document.getElementById("btn-delete-saved"),
    btnAddStep: document.getElementById("btn-add-step"),
    btnSaveFlow: document.getElementById("btn-save-flow"),
    editorStatus: document.getElementById("editor-status"),
    stepsList: document.getElementById("steps-list"),
    timerRemaining: document.getElementById("timer-remaining"),
    timerStepLabel: document.getElementById("timer-step-label"),
    timerStepProgress: document.getElementById("timer-step-progress"),
    timerNextLabel: document.getElementById("timer-next-label"),
    runStatus: document.getElementById("run-status"),
    btnStart: document.getElementById("btn-start"),
    btnPause: document.getElementById("btn-pause"),
    btnResume: document.getElementById("btn-resume"),
    btnStop: document.getElementById("btn-stop"),
    btnSkip: document.getElementById("btn-skip"),
  };

  function uid() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
  }

  function loadSequences() {
    try {
      const raw = localStorage.getItem(STORAGE_SEQUENCES);
      if (!raw) return [];
      const data = JSON.parse(raw);
      if (!Array.isArray(data)) return [];
      return data.filter(
        (s) =>
          s &&
          typeof s.id === "string" &&
          typeof s.name === "string" &&
          Array.isArray(s.steps)
      );
    } catch {
      return [];
    }
  }

  function saveSequencesToStorage() {
    localStorage.setItem(STORAGE_SEQUENCES, JSON.stringify(sequences));
  }

  function loadDraft() {
    try {
      const raw = localStorage.getItem(STORAGE_DRAFT);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data || typeof data.name !== "string" || !Array.isArray(data.steps)) return null;
      return {
        name: data.name,
        steps: data.steps
          .filter((st) => st && typeof st.label === "string")
          .map((st) => ({
            id: typeof st.id === "string" ? st.id : uid(),
            label: st.label,
            durationSeconds: clampInt(st.durationSeconds, 0, 86400),
          })),
        selectedSavedId:
          typeof data.selectedSavedId === "string" || data.selectedSavedId === null
            ? data.selectedSavedId
            : null,
      };
    } catch {
      return null;
    }
  }

  function saveDraftToStorage() {
    const draft = {
      name: els.flowName.value.trim(),
      steps: readStepsFromDom(),
      selectedSavedId,
    };
    localStorage.setItem(STORAGE_DRAFT, JSON.stringify(draft));
  }

  let draftSaveTimer = null;
  function scheduleDraftSave() {
    clearTimeout(draftSaveTimer);
    draftSaveTimer = setTimeout(() => {
      draftSaveTimer = null;
      saveDraftToStorage();
    }, 400);
  }

  function clampInt(n, min, max) {
    const x = Math.floor(Number(n));
    if (!Number.isFinite(x)) return min;
    return Math.min(max, Math.max(min, x));
  }

  /** @param {number} totalSeconds */
  function formatClock(totalSeconds) {
    const s = Math.max(0, Math.floor(totalSeconds));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return String(m).padStart(2, "0") + ":" + String(r).padStart(2, "0");
  }

  function readStepsFromDom() {
    const rows = els.stepsList.querySelectorAll(".step-row");
    /** @type {Step[]} */
    const out = [];
    rows.forEach((row) => {
      const id = row.getAttribute("data-step-id") || uid();
      const labelInput = row.querySelector(".step-label");
      const minInput = row.querySelector(".step-min");
      const secInput = row.querySelector(".step-sec");
      const label = labelInput && "value" in labelInput ? String(labelInput.value) : "";
      const mins = clampInt(minInput && "value" in minInput ? minInput.value : 0, 0, 1440);
      let secs = clampInt(secInput && "value" in secInput ? secInput.value : 0, 0, 59);
      let durationSeconds = mins * 60 + secs;
      if (durationSeconds <= 0 && (mins > 0 || secs > 0)) {
        secs = clampInt(secs, 0, 59);
        durationSeconds = mins * 60 + secs;
      }
      out.push({ id, label, durationSeconds });
    });
    return out;
  }

  /** @param {Step[]} steps */
  function stepsWithDuration(steps) {
    return steps.filter((s) => s.durationSeconds > 0);
  }

  /** @param {Step[]} steps */
  function validateStepsForRun(steps) {
    if (!stepsWithDuration(steps).length) {
      return { ok: false, message: "Mindestens ein Intervall mit Dauer größer 0 nötig." };
    }
    return { ok: true, message: "" };
  }

  /** @param {Step} step */
  function createStepRow(step) {
    const li = document.createElement("li");
    li.className = "step-row";
    li.setAttribute("data-step-id", step.id);

    const label = document.createElement("input");
    label.type = "text";
    label.className = "step-label";
    label.value = step.label;
    label.setAttribute("aria-label", "Bezeichnung Intervall");

    const min = document.createElement("input");
    min.type = "number";
    min.className = "step-min";
    min.min = "0";
    min.max = "1440";
    min.value = String(Math.floor(step.durationSeconds / 60));

    const sec = document.createElement("input");
    sec.type = "number";
    sec.className = "step-sec";
    sec.min = "0";
    sec.max = "59";
    sec.value = String(step.durationSeconds % 60);

    const actions = document.createElement("div");
    actions.className = "step-actions";

    const btnUp = document.createElement("button");
    btnUp.type = "button";
    btnUp.className = "btn btn--secondary btn--icon";
    btnUp.textContent = "↑";
    btnUp.setAttribute("aria-label", "Nach oben");
    btnUp.addEventListener("click", () => moveStep(li, -1));

    const btnDown = document.createElement("button");
    btnDown.type = "button";
    btnDown.className = "btn btn--secondary btn--icon";
    btnDown.textContent = "↓";
    btnDown.setAttribute("aria-label", "Nach unten");
    btnDown.addEventListener("click", () => moveStep(li, 1));

    const btnDel = document.createElement("button");
    btnDel.type = "button";
    btnDel.className = "btn btn--danger btn--icon";
    btnDel.textContent = "×";
    btnDel.setAttribute("aria-label", "Intervall löschen");
    btnDel.addEventListener("click", () => {
      if (timer.mode !== "idle") {
        setEditorStatus("Timer stoppen, um Intervalle zu löschen.", "error");
        return;
      }
      li.remove();
      setEditorStatus("");
      scheduleDraftSave();
      syncStartButton();
    });

    [label, min, sec].forEach((el) => {
      el.addEventListener("input", () => {
        scheduleDraftSave();
        syncStartButton();
      });
    });

    actions.append(btnUp, btnDown, btnDel);
    li.append(label, min, sec, actions);
    return li;
  }

  /** @param {HTMLElement} row @param {number} dir */
  function moveStep(row, dir) {
    if (timer.mode !== "idle") return;
    const parent = els.stepsList;
    if (dir < 0 && row.previousElementSibling) {
      parent.insertBefore(row, row.previousElementSibling);
    } else if (dir > 0 && row.nextElementSibling) {
      parent.insertBefore(row.nextElementSibling, row);
    }
    scheduleDraftSave();
  }

  /** @param {Step[]} steps */
  function renderSteps(steps) {
    els.stepsList.replaceChildren();
    steps.forEach((s) => els.stepsList.appendChild(createStepRow(s)));
    syncStartButton();
  }

  function defaultSteps() {
    return [{ id: uid(), label: "Block", durationSeconds: 25 * 60 }];
  }

  function refreshSavedDropdown() {
    const sel = els.savedFlows;
    const prev = sel.value;
    sel.replaceChildren();
    const opt0 = document.createElement("option");
    opt0.value = "";
    opt0.textContent = "— Auswählen —";
    sel.appendChild(opt0);
    sequences.forEach((seq) => {
      const o = document.createElement("option");
      o.value = seq.id;
      o.textContent = seq.name || "(Ohne Titel)";
      sel.appendChild(o);
    });
    if (prev && sequences.some((s) => s.id === prev)) {
      sel.value = prev;
    } else if (selectedSavedId && sequences.some((s) => s.id === selectedSavedId)) {
      sel.value = selectedSavedId;
    } else {
      sel.value = "";
    }
  }

  function setEditorStatus(msg, kind) {
    els.editorStatus.textContent = msg || "";
    els.editorStatus.classList.remove("status--error", "status--ok");
    if (kind === "error") els.editorStatus.classList.add("status--error");
    if (kind === "ok") els.editorStatus.classList.add("status--ok");
  }

  function setRunStatus(msg, kind) {
    els.runStatus.textContent = msg || "";
    els.runStatus.classList.remove("status--error", "status--ok");
    if (kind === "error") els.runStatus.classList.add("status--error");
    if (kind === "ok") els.runStatus.classList.add("status--ok");
  }

  /** @returns {Sequence} */
  function sequenceFromEditor() {
    const name = els.flowName.value.trim();
    const steps = readStepsFromDom().map((st) => ({
      id: st.id || uid(),
      label: st.label,
      durationSeconds: st.durationSeconds,
    }));
    const id = selectedSavedId && sequences.some((s) => s.id === selectedSavedId)
      ? selectedSavedId
      : uid();
    return { id, name: name || "Ohne Titel", steps };
  }

  function saveFlow() {
    if (timer.mode !== "idle") {
      setEditorStatus("Timer stoppen, um einen Ablauf zu speichern.", "error");
      return;
    }
    const seq = sequenceFromEditor();
    if (!stepsWithDuration(seq.steps).length) {
      setEditorStatus("Speichern nicht möglich: kein Intervall mit Dauer > 0.", "error");
      return;
    }
    const idx = sequences.findIndex((s) => s.id === seq.id);
    if (idx >= 0) {
      sequences[idx] = seq;
      setEditorStatus("Ablauf gespeichert (überschrieben).", "ok");
    } else {
      sequences.push(seq);
      selectedSavedId = seq.id;
      setEditorStatus("Neuer Ablauf gespeichert.", "ok");
    }
    saveSequencesToStorage();
    refreshSavedDropdown();
    els.savedFlows.value = seq.id;
    scheduleDraftSave();
  }

  function loadSelectedFlow() {
    if (timer.mode !== "idle") {
      setEditorStatus("Timer stoppen vor dem Laden.", "error");
      return;
    }
    const id = els.savedFlows.value;
    if (!id) {
      setEditorStatus("Bitte einen gespeicherten Ablauf auswählen.", "error");
      return;
    }
    const seq = sequences.find((s) => s.id === id);
    if (!seq) {
      setEditorStatus("Eintrag nicht gefunden.", "error");
      refreshSavedDropdown();
      return;
    }
    selectedSavedId = seq.id;
    els.flowName.value = seq.name;
    renderSteps(
      seq.steps.map((st) => ({
        id: st.id || uid(),
        label: st.label,
        durationSeconds: clampInt(st.durationSeconds, 0, 86400),
      }))
    );
    setEditorStatus("Ablauf geladen.", "ok");
    scheduleDraftSave();
  }

  function deleteSelectedFlow() {
    if (timer.mode !== "idle") {
      setEditorStatus("Timer stoppen vor dem Löschen.", "error");
      return;
    }
    const id = els.savedFlows.value;
    if (!id) {
      setEditorStatus("Nichts ausgewählt.", "error");
      return;
    }
    const seq = sequences.find((s) => s.id === id);
    if (!seq) return;
    if (!window.confirm('Ablauf "' + (seq.name || "Ohne Titel") + '" wirklich löschen?')) {
      return;
    }
    sequences = sequences.filter((s) => s.id !== id);
    saveSequencesToStorage();
    if (selectedSavedId === id) selectedSavedId = null;
    refreshSavedDropdown();
    setEditorStatus("Ablauf gelöscht.", "ok");
    scheduleDraftSave();
  }

  function clearTimerInterval() {
    if (timer.intervalId !== null) {
      clearInterval(timer.intervalId);
      timer.intervalId = null;
    }
  }

  function playBeep() {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 880;
      gain.gain.value = 0.08;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.18);
      osc.onended = () => ctx.close().catch(() => {});
    } catch {
      /* ignore */
    }
  }

  function getRemainingMs() {
    if (timer.mode === "running" && timer.endTime != null) {
      return Math.max(0, timer.endTime - Date.now());
    }
    if (timer.mode === "paused" && timer.pausedRemainingMs != null) {
      return timer.pausedRemainingMs;
    }
    const step = timer.steps[timer.stepIndex];
    if (!step) return 0;
    return step.durationSeconds * 1000;
  }

  function updateRunUi() {
    const idle = timer.mode === "idle";
    const domSteps = idle ? readStepsFromDom() : timer.steps;
    const idx = timer.stepIndex;
    const remainingMs = getRemainingMs();
    const remainingSec = Math.ceil(remainingMs / 1000);

    if (idle) {
      const runnable = stepsWithDuration(domSteps);
      if (!domSteps.length) {
        els.timerRemaining.textContent = "00:00";
        els.timerStepLabel.textContent = "—";
        els.timerStepProgress.textContent = "";
        els.timerNextLabel.textContent = "—";
      } else if (!runnable.length) {
        els.timerRemaining.textContent = "00:00";
        els.timerStepLabel.textContent = "Kein Intervall mit Dauer > 0";
        els.timerStepProgress.textContent = "";
        els.timerNextLabel.textContent = "—";
      } else {
        els.timerRemaining.textContent = formatClock(runnable[0].durationSeconds);
        els.timerStepLabel.textContent = runnable[0].label || "Intervall";
        els.timerStepProgress.textContent = "Schritt 1 von " + runnable.length;
        els.timerNextLabel.textContent =
          runnable.length > 1 ? runnable[1].label || "Intervall" : "—";
      }
    } else {
      const steps = timer.steps;
      const current = steps[idx];
      const next = steps[idx + 1];
      els.timerRemaining.textContent = formatClock(remainingSec);
      els.timerStepLabel.textContent = current ? current.label || "Intervall" : "—";
      els.timerStepProgress.textContent =
        steps.length && current ? "Schritt " + (idx + 1) + " von " + steps.length : "";
      els.timerNextLabel.textContent = next ? next.label || "Intervall" : "—";
    }
  }

  function finishSequence() {
    clearTimerInterval();
    timer.mode = "idle";
    timer.endTime = null;
    timer.pausedRemainingMs = null;
    timer.stepIndex = 0;
    timer.steps = readStepsFromDom().map((st) => ({
      id: st.id,
      label: st.label,
      durationSeconds: st.durationSeconds,
    }));
    setRunStatus("Ablauf beendet.", "ok");
    updateRunButtons();
    updateRunUi();
  }

  function advanceOrFinish() {
    playBeep();
    if (timer.stepIndex >= timer.steps.length - 1) {
      finishSequence();
      return;
    }
    timer.stepIndex += 1;
    const step = timer.steps[timer.stepIndex];
    timer.endTime = Date.now() + step.durationSeconds * 1000;
    timer.pausedRemainingMs = null;
    setRunStatus("");
    updateRunUi();
  }

  function tick() {
    if (timer.mode !== "running" || timer.endTime == null) return;
    let guard = 0;
    while (timer.endTime != null && timer.endTime - Date.now() <= 0 && guard++ < 500) {
      advanceOrFinish();
      if (timer.mode !== "running") return;
    }
    updateRunUi();
  }

  function startTimer() {
    const steps = readStepsFromDom().map((st) => ({
      id: st.id,
      label: st.label,
      durationSeconds: st.durationSeconds,
    }));
    const check = validateStepsForRun(steps);
    if (!check.ok) {
      setRunStatus(check.message, "error");
      updateRunUi();
      return;
    }
    timer.steps = stepsWithDuration(steps);
    timer.stepIndex = 0;
    timer.mode = "running";
    timer.pausedRemainingMs = null;
    const first = timer.steps[0];
    timer.endTime = Date.now() + first.durationSeconds * 1000;
    setRunStatus("");
    clearTimerInterval();
    timer.intervalId = setInterval(tick, 250);
    updateRunButtons();
    updateRunUi();
  }

  function pauseTimer() {
    if (timer.mode !== "running" || timer.endTime == null) return;
    timer.pausedRemainingMs = Math.max(0, timer.endTime - Date.now());
    timer.endTime = null;
    timer.mode = "paused";
    clearTimerInterval();
    updateRunButtons();
    updateRunUi();
  }

  function resumeTimer() {
    if (timer.mode !== "paused" || timer.pausedRemainingMs == null) return;
    timer.endTime = Date.now() + timer.pausedRemainingMs;
    timer.pausedRemainingMs = null;
    timer.mode = "running";
    timer.intervalId = setInterval(tick, 250);
    updateRunButtons();
    updateRunUi();
  }

  function stopTimer() {
    clearTimerInterval();
    timer.mode = "idle";
    timer.endTime = null;
    timer.pausedRemainingMs = null;
    timer.stepIndex = 0;
    timer.steps = readStepsFromDom();
    setRunStatus("Gestoppt. Zurück zum ersten Schritt.");
    updateRunButtons();
    updateRunUi();
  }

  function skipStep() {
    if (timer.mode === "idle") return;
    if (timer.stepIndex >= timer.steps.length - 1) {
      playBeep();
      finishSequence();
      return;
    }
    playBeep();
    timer.stepIndex += 1;
    const step = timer.steps[timer.stepIndex];
    if (timer.mode === "running") {
      timer.endTime = Date.now() + step.durationSeconds * 1000;
    } else {
      timer.pausedRemainingMs = step.durationSeconds * 1000;
    }
    setRunStatus("Schritt übersprungen.");
    updateRunUi();
  }

  function syncEditorLockState() {
    const locked = timer.mode !== "idle";
    els.flowName.readOnly = locked;
    els.savedFlows.disabled = locked;
    els.btnLoad.disabled = locked;
    els.btnDeleteSaved.disabled = locked;
    els.btnAddStep.disabled = locked;
    els.btnSaveFlow.disabled = locked;
    els.stepsList.querySelectorAll(".step-label, .step-min, .step-sec").forEach((inp) => {
      if ("readOnly" in inp) inp.readOnly = locked;
    });
    els.stepsList.querySelectorAll(".step-actions button").forEach((btn) => {
      btn.disabled = locked;
    });
  }

  function updateRunButtons() {
    const running = timer.mode === "running";
    const paused = timer.mode === "paused";
    const idle = timer.mode === "idle";

    els.btnStart.hidden = !idle;
    els.btnPause.hidden = !running;
    els.btnResume.hidden = !paused;
    els.btnStop.hidden = idle;
    els.btnSkip.hidden = idle;

    const steps = readStepsFromDom();
    const canStart = validateStepsForRun(steps).ok;
    els.btnStart.disabled = !canStart;
    syncEditorLockState();
  }

  function syncStartButton() {
    if (timer.mode === "idle") {
      updateRunButtons();
    }
  }

  function onVisibilityChange() {
    if (document.visibilityState === "visible" && timer.mode === "running") {
      tick();
    }
  }

  function init() {
    sequences = loadSequences();
    refreshSavedDropdown();

    const draft = loadDraft();
    if (draft) {
      els.flowName.value = draft.name;
      selectedSavedId = draft.selectedSavedId;
      refreshSavedDropdown();
      if (draft.steps.length) {
        renderSteps(draft.steps);
      } else {
        renderSteps(defaultSteps());
      }
    } else {
      renderSteps(defaultSteps());
    }

    els.btnAddStep.addEventListener("click", () => {
      if (timer.mode !== "idle") {
        setEditorStatus("Timer stoppen, um Intervalle hinzuzufügen.", "error");
        return;
      }
      const li = createStepRow({ id: uid(), label: "Block", durationSeconds: 0 });
      els.stepsList.appendChild(li);
      const inp = li.querySelector(".step-label");
      if (inp && "focus" in inp) inp.focus();
      scheduleDraftSave();
      syncStartButton();
    });

    els.btnSaveFlow.addEventListener("click", saveFlow);
    els.btnLoad.addEventListener("click", loadSelectedFlow);
    els.btnDeleteSaved.addEventListener("click", deleteSelectedFlow);

    els.flowName.addEventListener("input", () => {
      scheduleDraftSave();
    });

    els.savedFlows.addEventListener("change", () => {
      selectedSavedId = els.savedFlows.value || null;
      scheduleDraftSave();
    });

    els.btnStart.addEventListener("click", startTimer);
    els.btnPause.addEventListener("click", pauseTimer);
    els.btnResume.addEventListener("click", resumeTimer);
    els.btnStop.addEventListener("click", stopTimer);
    els.btnSkip.addEventListener("click", skipStep);

    document.addEventListener("visibilitychange", onVisibilityChange);

    document.addEventListener("keydown", (e) => {
      const tag = (e.target && e.target.tagName) || "";
      const inField =
        tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || e.target?.isContentEditable;
      if (e.key === "Escape" && timer.mode !== "idle") {
        e.preventDefault();
        stopTimer();
        return;
      }
      if (e.key === "Enter" && !inField) {
        if (timer.mode === "idle" && validateStepsForRun(readStepsFromDom()).ok) {
          e.preventDefault();
          startTimer();
        } else if (timer.mode === "paused") {
          e.preventDefault();
          resumeTimer();
        }
      }
    });

    updateRunButtons();
    updateRunUi();
  }

  init();
})();
