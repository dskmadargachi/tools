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

  // Step 2: Sheet Layout & Copy Options
  function updateCopiesDropdown() {
    const sel = document.getElementById("photoCopiesSelect");
    sel.innerHTML = "";

    const is3x35 = Math.abs(state.photoWmm - 30) < 0.5 && Math.abs(state.photoHmm - 35) < 0.5;
    if (is3x35 && state.paper === "A4") {
      // Exact 9, 18, 27, 36, 45 options requested for 3x3.5 cm on A4
      [9, 18, 27, 36, 45].forEach((n, idx) => {
        const opt = document.createElement("option");
        opt.value = String(n);
        opt.textContent = `${n} copies (${idx + 1} ${idx === 0 ? "row" : "rows"} on A4)`;
        sel.appendChild(opt);
      });
      state.copies = 18;
      sel.value = "18";
      return;
    }

    const paperW = state.paper === "A4" ? 210 : 101.6;
    const paperH = state.paper === "A4" ? 297 : 152.4;
    const gap = 2.5;
    const margin = 5;
    const cols = Math.max(1, Math.floor((paperW - margin * 2 + gap) / (state.photoWmm + gap)));
    const rows = Math.max(1, Math.floor((paperH - margin * 2 + gap) / (state.photoHmm + gap)));
    const maxFit = cols * rows;

    const presets = new Set([cols, cols * 2, maxFit]);
    [...presets]
      .filter((n) => n > 0 && n <= maxFit)
      .sort((a, b) => a - b)
      .forEach((n) => {
        const opt = document.createElement("option");
        opt.value = String(n);
        opt.textContent = n === maxFit ? `${n} copies (full ${state.paper} sheet)` : `${n} copies`;
        sel.appendChild(opt);
      });

    state.copies = maxFit;
    sel.value = String(maxFit);
  }

  function buildFullSheetCanvas(dpi = 300) {
    const mmToPx = (mm) => Math.round((mm / 25.4) * dpi);
    const paperW = state.paper === "A4" ? 210 : 101.6;
    const paperH = state.paper === "A4" ? 297 : 152.4;

    const sheet = document.createElement("canvas");
    sheet.width = mmToPx(paperW);
    sheet.height = mmToPx(paperH);
    const ctx = sheet.getContext("2d");

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, sheet.width, sheet.height);

    // Render single cropped tile at exact aspect ratio
    const tile = document.createElement("canvas");
    tile.width = mmToPx(state.photoWmm);
    tile.height = mmToPx(state.photoHmm);
    renderCropPreview(tile);

    const tileCtx = tile.getContext("2d");
    tileCtx.strokeStyle = "#cbd5e1";
    tileCtx.lineWidth = Math.max(1, Math.round(dpi / 150));
    tileCtx.strokeRect(0, 0, tile.width, tile.height);

    const gapPx = mmToPx(2.2);
    const marginPx = mmToPx(5);
    const cols = Math.max(1, Math.floor((sheet.width - marginPx * 2 + gapPx) / (tile.width + gapPx)));
    const totalGridW = cols * tile.width + (cols - 1) * gapPx;
    const startX = Math.round((sheet.width - totalGridW) / 2);
    const startY = marginPx;

    for (let i = 0; i < state.copies; i++) {
      const r = Math.floor(i / cols);
      const c = i % cols;
      const x = startX + c * (tile.width + gapPx);
      const y = startY + r * (tile.height + gapPx);
      if (y + tile.height > sheet.height - marginPx / 2) break;
      ctx.drawImage(tile, x, y);
    }

    return sheet;
  }

  function refreshSheetPreview() {
    const preview = document.getElementById("sheetPreviewCanvas");
    const hiRes = buildFullSheetCanvas(150);
    preview.width = hiRes.width;
    preview.height = hiRes.height;
    preview.getContext("2d").drawImage(hiRes, 0, 0);

    document.getElementById("sheetSummaryText").textContent =
      `Size: ${state.photoWmm}×${state.photoHmm} mm • Paper: ${state.paper} • ${state.copies} photos`;
  }

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
      customBox.style.display = "grid";
      state.photoWmm = parseFloat(document.getElementById("customWInput").value) || 30;
      state.photoHmm = parseFloat(document.getElementById("customHInput").value) || 35;
    } else {
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

    const ptW = state.paper === "A4" ? 595.28 : 288;
    const ptH = state.paper === "A4" ? 841.89 : 432;
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
    const win = window.open("", "_blank");
    win.document.write(`<img src="${url}" style="width:100%;max-width:100%;display:block;" onload="window.print();window.close();" />`);
  });
})();
              
