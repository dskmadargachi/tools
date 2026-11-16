(function () {
  const state = {
    origImg: null,
    cutoutCanvas: null, // Cached HD transparent foreground
    zoom: 1,
    panX: 0,
    panY: 0,
    bgColor: "#ffffff", // 'transparent' or hex
    photoWmm: 30,
    photoHmm: 35,
    paper: "4x6", // '4x6' or 'A4'
    isCustom: false,
    copies: 12
  };

  const cropCanvas = document.getElementById("photoCropCanvas");
  if (!cropCanvas) return;
  const cropCtx = cropCanvas.getContext("2d");
  const previewFrame = document.getElementById("photoPreviewFrame");

  // Upload Handlers
  const dropzone = document.getElementById("photoDropzone");
  const fileInput = document.getElementById("photoFileInput");

  dropzone.addEventListener("click", () => fileInput.click());
  dropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzone.classList.add("dragover");
  });
  dropzone.addEventListener("dragleave", () => dropzone.classList.remove("dragover"));
  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.classList.remove("dragover");
    if (e.dataTransfer.files[0]) loadPhotoFile(e.dataTransfer.files[0]);
  });
  fileInput.addEventListener("change", (e) => {
    if (e.target.files[0]) loadPhotoFile(e.target.files[0]);
  });

  function loadPhotoFile(file) {
    window.ShopUI.setProgress("photoProgressBox", "Reading photo...", 15);
    const reader = new FileReader();
    reader.onprogress = (e) => {
      if (e.lengthComputable) {
        window.ShopUI.setProgress("photoProgressBox", "Reading photo...", 15 + (e.loaded / e.total) * 65);
      }
    };
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        state.origImg = img;
        state.cutoutCanvas = null;
        state.zoom = 1;
        state.panX = 0;
        state.panY = 0;
        document.getElementById("photoZoomSlider").value = "1";
        document.getElementById("zoomPctLabel").textContent = "100%";

        window.ShopUI.setProgress("photoProgressBox", "Ready", 100);
        setTimeout(() => window.ShopUI.hideProgress("photoProgressBox"), 250);

        document.getElementById("ppUploadView").style.display = "none";
        document.getElementById("ppStep2View").style.display = "none";
        document.getElementById("ppStep1View").style.display = "block";
        document.getElementById("resetPhotoBtn").style.display = "inline-flex";
        renderCropPreview();
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  }

  // Pan & Zoom Interaction
  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  previewFrame.addEventListener("pointerdown", (e) => {
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    previewFrame.setPointerCapture(e.pointerId);
  });

  previewFrame.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    state.panX += (e.clientX - lastX) * 2;
    state.panY += (e.clientY - lastY) * 2;
    lastX = e.clientX;
    lastY = e.clientY;
    renderCropPreview();
  });

  previewFrame.addEventListener("pointerup", () => (dragging = false));

  document.getElementById("photoZoomSlider").addEventListener("input", (e) => {
    state.zoom = parseFloat(e.target.value);
    document.getElementById("zoomPctLabel").textContent = `${Math.round(state.zoom * 100)}%`;
    renderCropPreview();
  });

  // Render Crop Canvas
  function renderCropPreview(targetCanvas = cropCanvas) {
    const ctx = targetCanvas.getContext("2d");
    const cw = targetCanvas.width;
    const ch = targetCanvas.height;
    ctx.clearRect(0, 0, cw, ch);

    if (targetCanvas === cropCanvas) {
      previewFrame.classList.toggle("checkerboard", state.bgColor === "transparent");
    }

    if (state.bgColor !== "transparent") {
      ctx.fillStyle = state.bgColor;
      ctx.fillRect(0, 0, cw, ch);
    }

    const src = state.cutoutCanvas || state.origImg;
    if (!src) return;

    const iw = src.width;
    const ih = src.height;
    const baseScale = Math.max(cw / iw, ch / ih);
    const scale = baseScale * state.zoom;
    const drawW = iw * scale;
    const drawH = ih * scale;
    const dx = (cw - drawW) / 2 + state.panX * (cw / 480);
    const dy = (ch - drawH) / 2 + state.panY * (ch / 560);

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(src, dx, dy, drawW, drawH);
  }

  // 7 Single-Row Circular Swatches
  document.getElementById("bgSwatchRow").addEventListener("click", (e) => {
    const btn = e.target.closest(".swatch-circle");
    if (!btn) return;
    document.querySelectorAll(".swatch-circle").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");

    if (btn.dataset.bg) {
      state.bgColor = btn.dataset.bg;
      renderCropPreview();
    }
  });

  document.getElementById("customBgPicker").addEventListener("input", (e) => {
    document.querySelectorAll(".swatch-circle").forEach((b) => b.classList.remove("active"));
    e.target.parentElement.classList.add("active");
    state.bgColor = e.target.value;
    renderCropPreview();
  });

  // HD AI Background Removal (@imgly/background-removal with 0%-100% progress)
  document.getElementById("runBgRemoveBtn").addEventListener("click", async () => {
    if (!state.origImg) return;
    if (state.cutoutCanvas) {
      window.ShopUI.toast("Background already removed! Tap any colour.");
      return;
    }

    const btn = document.getElementById("runBgRemoveBtn");
    btn.disabled = true;

    try {
      window.ShopUI.setProgress("photoProgressBox", "Loading HD AI model...", 8);

      // Downscale max 1280px for crisp hair edges + reliable mobile speed
      const maxDim = 1280;
      const scale = Math.min(1, maxDim / Math.max(state.origImg.width, state.origImg.height));
      const tmp = document.createElement("canvas");
      tmp.width = Math.round(state.origImg.width * scale);
      tmp.height = Math.round(state.origImg.height * scale);
      tmp.getContext("2d").drawImage(state.origImg, 0, 0, tmp.width, tmp.height);

      const inputBlob = await new Promise((res) => tmp.toBlob(res, "image/png"));
      const { removeBackground } = await import("https://esm.sh/@imgly/background-removal@1.5.5");

      const resultBlob = await removeBackground(inputBlob, {
        model: "isnet_fp16",
        progress: (key, current, total) => {
          if (total > 0) {
            const pct = 15 + Math.round((current / total) * 80);
            window.ShopUI.setProgress("photoProgressBox", "Removing background (HD)...", pct);
          }
        }
      });

      const cutUrl = URL.createObjectURL(resultBlob);
      const cutImg = new Image();
      await new Promise((resolve) => {
        cutImg.onload = resolve;
        cutImg.src = cutUrl;
      });

      const cCanvas = document.createElement("canvas");
      cCanvas.width = cutImg.width;
      cCanvas.height = cutImg.height;
      cCanvas.getContext("2d").drawImage(cutImg, 0, 0);
      URL.revokeObjectURL(cutUrl);

      state.cutoutCanvas = cCanvas;
      window.ShopUI.setProgress("photoProgressBox", "Background removed!", 100);
      setTimeout(() => window.ShopUI.hideProgress("photoProgressBox"), 350);
      renderCropPreview();
    } catch (err) {
      console.error(err);
      window.ShopUI.hideProgress("photoProgressBox");
      window.ShopUI.toast("Could not load AI model. Check internet connection.");
    } finally {
      btn.disabled = false;
    }
  });

  // ---------------------------------------------------------------------------
  // Step 2: Sheet layout engine (exact millimetre geometry, shared by the live
  // preview, the dropdown, and the 300 DPI JPG / PDF / Print exports)
  // ---------------------------------------------------------------------------
  const PAPERS = {
    "4x6": { w: 101.6, h: 152.4, label: "4×6" }, // 1200 × 1800 px @ 300 DPI
    A4: { w: 210, h: 297, label: "A4" } // 2480 × 3508 px @ 300 DPI
  };

  const near = (a, b) => Math.abs(a - b) < 0.5;
  const fmt = (n) => String(Math.round(n * 10) / 10);

  // Evenly spread n items of `size` across `total` (outer margins == inner gaps).
  function spreadAxis(total, size, n) {
    const gap = (total - n * size) / (n + 1);
    return Array.from({ length: n }, (_, i) => gap + i * (size + gap));
  }

  // Fixed gap, whole block centred on the page.
  function centredAxis(total, size, n, gap) {
    const block = n * size + (n - 1) * gap;
    const start = (total - block) / 2;
    return Array.from({ length: n }, (_, i) => start + i * (size + gap));
  }

  // Max grid for a slot size using a safe margin + cut gap.
  function fitGrid(pageW, pageH, slotW, slotH, margin, gap) {
    const cols = Math.floor((pageW - margin * 2 + gap) / (slotW + gap));
    const rows = Math.floor((pageH - margin * 2 + gap) / (slotH + gap));
    return { cols: Math.max(0, cols), rows: Math.max(0, rows) };
  }

  /**
   * Returns the complete layout for the current photo size + paper:
   * { pageW, pageH (mm), slotW, slotH (mm, as placed), rotated, cols, rows,
   *   xs[], ys[] (mm), max, unit, fullLabel, help, options[] }
   */
  function computeLayout() {
    const paper = PAPERS[state.paper] || PAPERS["4x6"];
    const w = state.photoWmm;
    const h = state.photoHmm;
    const isA4 = state.paper === "A4";
    let pageW = paper.w;
    let pageH = paper.h;
    let rotated = false;
    let cols;
    let rows;
    let xs;
    let ys;
    let unit = "copies";
    let fullLabel = `full ${paper.label} sheet`;
    let help = null;
    let preferredCopies = null;
    let customOptions = null;

    const preset = state.isCustom ? null : `${fmt(w)}x${fmt(h)}`;

    if (preset === "30x35" && !isA4) {
      // 3 × 4 upright = 12 per 4×6
      cols = 3; rows = 4;
      xs = spreadAxis(pageW, 30, cols);
      ys = spreadAxis(pageH, 35, rows);
      help = "Photo size: 3×3.5 cm. 12 photos fit on one 4×6 sheet.";
    } else if (preset === "35x45" && !isA4) {
      // rotated 90°: slot 45 W × 35 H, 2 × 4 = 8 per 4×6
      rotated = true; cols = 2; rows = 4;
      xs = spreadAxis(pageW, 45, cols);
      ys = spreadAxis(pageH, 35, rows);
      unit = "photos";
      fullLabel = "full sheet";
      help = "8 photos fit on one 4×6 sheet. Photos are placed sideways so the page stays upright";
    } else if (preset === "25x35" && !isA4) {
      cols = 3; rows = 4;
      xs = spreadAxis(pageW, 25, cols);
      ys = spreadAxis(pageH, 35, rows);
      help = "Photo size: 25×35 mm. 12 photos fit on one 4×6 sheet.";
    } else if (preset === "50.8x50.8" && !isA4) {
      // 2 columns × 2 rows edge-to-edge (101.6 mm = 2 × 50.8 mm), trimmed after printing
      cols = 2; rows = 2;
      xs = [0, 50.8];
      ys = spreadAxis(pageH, 50.8, rows);
      unit = "photos";
      help = "Photo size: 2×2 inch. 4 photos fit edge-to-edge on one 4×6 sheet (trim after printing); 2 photos leave cut margins.";
      customOptions = [
        { n: 1, label: "1 photo" },
        { n: 2, label: "2 photos (cut margins, 1 column)", cols1: true },
        { n: 4, label: "4 photos (full sheet, trim 1 mm)" }
      ];
    } else if (preset === "30x35" && isA4) {
      // landscape A4 (297 × 210): 9 cols × 5 rows = 45
      pageW = paper.h; pageH = paper.w;
      cols = 9; rows = 5;
      xs = centredAxis(pageW, 30, cols, 2.5);
      ys = centredAxis(pageH, 35, rows, 2.5);
      help = "Photo size: 3×3.5 cm. Up to 45 photos on one landscape A4 sheet (9 per row).";
      preferredCopies = 18;
    } else if (preset === "35x45" && isA4) {
      // portrait A4: 5 cols × 6 rows = 30
      cols = 5; rows = 6;
      xs = centredAxis(pageW, 35, cols, 2.5);
      ys = centredAxis(pageH, 45, rows, 2.5);
      help = "Photo size: 35×45 mm. Up to 30 photos on one A4 sheet (5 columns × 6 rows).";
    } else {
      // Generic / custom: try 0° and 90°, keep the one that fits more photos.
      const margin = state.isCustom ? 3 : 5;
      const gap = state.isCustom ? 2 : 2.5;
      const g0 = fitGrid(pageW, pageH, w, h, margin, gap);
      const g90 = fitGrid(pageW, pageH, h, w, margin, gap);
      const n0 = g0.cols * g0.rows;
      const n90 = g90.cols * g90.rows;
      if (n90 > n0) {
        rotated = true;
        cols = g90.cols; rows = g90.rows;
      } else {
        cols = g0.cols; rows = g0.rows;
      }
      const sw = rotated ? h : w;
      const sh = rotated ? w : h;
      if (cols < 1 || rows < 1) {
        cols = 1; rows = 1;
        xs = [(pageW - sw) / 2];
        ys = [(pageH - sh) / 2];
      } else {
        xs = centredAxis(pageW, sw, cols, gap);
        ys = centredAxis(pageH, sh, rows, gap);
      }
      help = `Photo size: ${fmt(w)}×${fmt(h)} mm. ${cols * rows} photo${cols * rows === 1 ? "" : "s"} fit on one ${paper.label} sheet` +
        (rotated ? ". Photos are placed sideways so the page stays upright" : ".");
    }

    const slotW = rotated ? h : w;
    const slotH = rotated ? w : h;
    const max = cols * rows;

    let options;
    if (customOptions) {
      options = customOptions;
    } else if (isA4 && preset === "30x35") {
      options = [9, 18, 27, 36, 45].map((n, idx) => ({
        n,
        label: `${n} copies (${idx + 1} ${idx === 0 ? "row" : "rows"} on A4)`
      }));
    } else {
      // Row-multiples (thinned out if there are many rows) + the full sheet.
      const set = new Set();
      if (rows <= 6) {
        for (let r = 1; r <= rows; r++) set.add(cols * r);
      } else {
        [1, 2, Math.ceil(rows / 2), rows].forEach((r) => set.add(cols * r));
      }
      set.add(max);
      options = [...set]
        .sort((a, b) => a - b)
        .map((n) => ({ n, label: n === max ? `${n} ${unit} (${fullLabel})` : `${n} ${unit}` }));
    }

    return {
      pageW, pageH, slotW, slotH, rotated, cols, rows, xs, ys, max, options, help,
      defaultCopies: preferredCopies || options[options.length - 1].n
    };
  }

  // Slot positions in mm for the first `copies` photos (row-major, top-left first).
  function slotPositions(layout, copies) {
    const out = [];
    // 2×2 inch with only 1–2 photos: single centred column with cut margins
    if (!state.isCustom && near(state.photoWmm, 50.8) && near(state.photoHmm, 50.8) && state.paper === "4x6" && copies <= 2) {
      const ys = spreadAxis(layout.pageH, 50.8, 2);
      const x = (layout.pageW - 50.8) / 2;
      for (let i = 0; i < copies; i++) out.push({ x, y: ys[i] });
      return out;
    }
    for (let i = 0; i < copies && i < layout.max; i++) {
      out.push({ x: layout.xs[i % layout.cols], y: layout.ys[Math.floor(i / layout.cols)] });
    }
    return out;
  }

  function updateCopiesDropdown() {
    const layout = computeLayout();
    const sel = document.getElementById("photoCopiesSelect");
    sel.innerHTML = "";
    layout.options.forEach((o) => {
      const opt = document.createElement("option");
      opt.value = String(o.n);
      opt.textContent = o.label;
      sel.appendChild(opt);
    });
    state.copies = layout.defaultCopies;
    sel.value = String(state.copies);

    const help = document.getElementById("photoCopiesHelp");
    if (help) help.textContent = layout.help || "";
  }

  function buildFullSheetCanvas(dpi = 300) {
    const mmToPx = (mm) => Math.round((mm / 25.4) * dpi);
    const layout = computeLayout();

    const sheet = document.createElement("canvas");
    sheet.width = mmToPx(layout.pageW);
    sheet.height = mmToPx(layout.pageH);
    const ctx = sheet.getContext("2d");

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, sheet.width, sheet.height);

    // One upright tile at the exact photo size
    const tile = document.createElement("canvas");
    tile.width = mmToPx(state.photoWmm);
    tile.height = mmToPx(state.photoHmm);
    renderCropPreview(tile);

    const tileCtx = tile.getContext("2d");
    tileCtx.strokeStyle = "#cbd5e1";
    tileCtx.lineWidth = Math.max(1, Math.round(dpi / 150));
    tileCtx.strokeRect(0, 0, tile.width, tile.height);

    const slotWpx = layout.rotated ? tile.height : tile.width;
    const slotHpx = layout.rotated ? tile.width : tile.height;

    slotPositions(layout, state.copies).forEach((p) => {
      const x = mmToPx(p.x);
      const y = mmToPx(p.y);
      if (layout.rotated) {
        ctx.save();
        ctx.translate(x + slotWpx / 2, y + slotHpx / 2);
        ctx.rotate(Math.PI / 2);
        ctx.drawImage(tile, -tile.width / 2, -tile.height / 2);
        ctx.restore();
      } else {
        ctx.drawImage(tile, x, y);
      }
    });

    return sheet;
  }

  // Scale the preview canvas so the ENTIRE sheet is visible inside its box.
  function fitPreviewCanvas() {
    const preview = document.getElementById("sheetPreviewCanvas");
    if (!preview || !preview.width) return;
    const box = preview.parentElement;
    const maxW = Math.max(120, (box.clientWidth || 320) - 28);
    const maxH = 380;
    const s = Math.min(maxW / preview.width, maxH / preview.height);
    preview.style.width = `${Math.floor(preview.width * s)}px`;
    preview.style.height = `${Math.floor(preview.height * s)}px`;
  }

  function refreshSheetPreview() {
    const preview = document.getElementById("sheetPreviewCanvas");
    const layout = computeLayout();
    const hiRes = buildFullSheetCanvas(150);
    preview.width = hiRes.width;
    preview.height = hiRes.height;
    preview.getContext("2d").drawImage(hiRes, 0, 0);
    fitPreviewCanvas();

    const orient = layout.pageW > layout.pageH ? " (landscape)" : "";
    document.getElementById("sheetSummaryText").textContent =
      `Size: ${fmt(state.photoWmm)}×${fmt(state.photoHmm)} mm • Paper: ${PAPERS[state.paper].label}${orient} ` +
      `${fmt(layout.pageW)}×${fmt(layout.pageH)} mm • ${state.copies} photos`;
  }

  window.addEventListener("resize", fitPreviewCanvas);

  document.getElementById("toPhotoStep2Btn").addEventListener("click", () => {
    document.getElementById("ppStep1View").style.display = "none";
    document.getElementById("ppStep2View").style.display = "block";
    updateCopiesDropdown();
    refreshSheetPreview();
  });

  document.getElementById("backToStep1Btn").addEventListener("click", () => {
    document.getElementById("ppStep2View").style.display = "none";
    document.getElementById("ppStep1View").style.display = "block";
  });

  document.getElementById("resetPhotoBtn").addEventListener("click", () => {
    fileInput.value = "";
    document.getElementById("ppStep1View").style.display = "none";
    document.getElementById("ppStep2View").style.display = "none";
    document.getElementById("ppUploadView").style.display = "block";
    document.getElementById("resetPhotoBtn").style.display = "none";
  });

  document.getElementById("photoSizePills").addEventListener("click", (e) => {
    const btn = e.target.closest(".pill-btn");
    if (!btn) return;
    document.querySelectorAll("#photoSizePills .pill-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");

    const customBox = document.getElementById("customSizeInputs");
    if (btn.dataset.custom) {
      state.isCustom = true;
      customBox.style.display = "grid";
      state.photoWmm = parseFloat(document.getElementById("customWInput").value) || 30;
      state.photoHmm = parseFloat(document.getElementById("customHInput").value) || 35;
    } else {
      state.isCustom = false;
      customBox.style.display = "none";
      state.photoWmm = parseFloat(btn.dataset.w);
      state.photoHmm = parseFloat(btn.dataset.h);
    }
    updateCopiesDropdown();
    refreshSheetPreview();
  });

  ["customWInput", "customHInput"].forEach((id) => {
    document.getElementById(id).addEventListener("input", () => {
      state.photoWmm = Math.max(10, parseFloat(document.getElementById("customWInput").value) || 30);
      state.photoHmm = Math.max(10, parseFloat(document.getElementById("customHInput").value) || 35);
      updateCopiesDropdown();
      refreshSheetPreview();
    });
  });

  document.getElementById("paperSizePills").addEventListener("click", (e) => {
    const btn = e.target.closest(".pill-btn");
    if (!btn) return;
    document.querySelectorAll("#paperSizePills .pill-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    state.paper = btn.dataset.paper;
    updateCopiesDropdown();
    refreshSheetPreview();
  });

  document.getElementById("photoCopiesSelect").addEventListener("change", (e) => {
    state.copies = parseInt(e.target.value, 10) || 1;
    refreshSheetPreview();
  });

  // Save as JPG (300 DPI)
  document.getElementById("savePhotoJpgBtn").addEventListener("click", () => {
    const sheet = buildFullSheetCanvas(300);
    sheet.toBlob(
      (blob) => {
        window.ShopUI.downloadBlob(blob, `therajesh-photos-${state.paper}-${state.copies}pcs.jpg`);
        window.ShopUI.toast("JPG downloaded!");
      },
      "image/jpeg",
      0.96
    );
  });

  // Save as PDF (300 DPI)
  document.getElementById("savePhotoPdfBtn").addEventListener("click", async () => {
    const sheet = buildFullSheetCanvas(300);
    const jpgDataUrl = sheet.toDataURL("image/jpeg", 0.95);
    const { PDFDocument } = window.PDFLib;
    const pdfDoc = await PDFDocument.create();

    const lay = computeLayout();
    const ptW = (lay.pageW / 25.4) * 72;
    const ptH = (lay.pageH / 25.4) * 72;
    const page = pdfDoc.addPage([ptW, ptH]);
    const jpgEmbed = await pdfDoc.embedJpg(jpgDataUrl);
    page.drawImage(jpgEmbed, { x: 0, y: 0, width: ptW, height: ptH });

    const bytes = await pdfDoc.save();
    window.ShopUI.downloadBlob(
      new Blob([bytes], { type: "application/pdf" }),
      `therajesh-photos-${state.paper}-${state.copies}pcs.pdf`
    );
    window.ShopUI.toast("PDF downloaded!");
  });

  // Direct Browser Print
  document.getElementById("printPhotoSheetBtn").addEventListener("click", () => {
    const sheet = buildFullSheetCanvas(300);
    const url = sheet.toDataURL("image/jpeg", 0.95);
    const lay = computeLayout();
    const win = window.open("", "_blank");
    if (!win) {
      window.ShopUI.toast("Please allow pop-ups to print.");
      return;
    }
    win.document.write(
      `<!doctype html><html><head><title>Print photo sheet</title><style>` +
        `@page{size:${lay.pageW}mm ${lay.pageH}mm;margin:0}html,body{margin:0;padding:0}` +
        `img{width:${lay.pageW}mm;height:${lay.pageH}mm;display:block}</style></head><body>` +
        `<img src="${url}" onload="window.print();window.close();" /></body></html>`
    );
    win.document.close();
  });
})();
