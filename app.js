(function () {
  "use strict";

  // Replace this when you have a permanent Blish addon download / store link.
  const BLISH_ADDON_URL = "https://YOUR-BLISH-ADDON-LINK-HERE";

  const dropzone = document.getElementById("dropzone");
  const fileInput = document.getElementById("file-input");
  const statusEl = document.getElementById("status");
  const resultsEl = document.getElementById("results");
  const firstList = document.getElementById("first-list");
  const hitsList = document.getElementById("hits-list");
  const summaryMeta = document.getElementById("summary-meta");
  const blishLink = document.getElementById("blish-addon-link");

  if (blishLink) {
    blishLink.href = BLISH_ADDON_URL;
  }

  function setStatus(text, kind) {
    statusEl.textContent = text || "";
    statusEl.dataset.kind = kind || "";
  }

  function renderSummary(summary) {
    if (!summary.success) {
      resultsEl.hidden = true;
      setStatus(summary.errorMessage || "Parse failed.", "error");
      return;
    }

    const oilCount = summary.firstTouches.length;
    summaryMeta.textContent = `${summary.fileName}  ·  ${oilCount} oil(s)  ·  ${summary.totalHits} hit(s)`;

    firstList.innerHTML = "";
    if (summary.firstTouches.length === 0) {
      firstList.innerHTML = "<li class='empty'>(none detected)</li>";
    } else {
      for (const touch of summary.firstTouches) {
        const li = document.createElement("li");
        li.textContent = `Oil ${touch.oilNumber}: ${touch.displayName}`;
        firstList.appendChild(li);
      }
    }

    hitsList.innerHTML = "";
    if (summary.players.length === 0) {
      hitsList.innerHTML = "<li class='empty'>Nobody stepped in oils this pull.</li>";
    } else {
      summary.players.forEach((player, index) => {
        const li = document.createElement("li");
        const times = player.hitCount === 1 ? "1 time" : `${player.hitCount} times`;
        li.textContent = `${index + 1}. ${player.displayName} — ${times}`;
        hitsList.appendChild(li);
      });
    }

    resultsEl.hidden = false;
    setStatus("Parsed.", "ok");
  }

  async function handleFile(file) {
    if (!file) return;
    setStatus(`Parsing ${file.name}…`);
    resultsEl.hidden = true;
    const summary = await window.WhoTouchedOils.parseLogFile(file);
    renderSummary(summary);
  }

  dropzone.addEventListener("click", () => fileInput.click());
  dropzone.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      fileInput.click();
    }
  });

  fileInput.addEventListener("change", () => {
    const file = fileInput.files && fileInput.files[0];
    handleFile(file);
    fileInput.value = "";
  });

  ["dragenter", "dragover"].forEach((evt) => {
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.add("is-drag");
    });
  });

  ["dragleave", "drop"].forEach((evt) => {
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.remove("is-drag");
    });
  });

  dropzone.addEventListener("drop", (e) => {
    const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    handleFile(file);
  });
})();
