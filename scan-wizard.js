(function () {
  const scannerState = {
    mode: "auto", // 'id', 'cert', 'admit', 'auto'
    filter: "clean", // 'original', 'clean', 'bw'
    pages: [], // { rawCanvas, rotation, filter, processedUrl }
    currentCanvas: null,
    currentRotation: 0
  };

  function injectScannerModal() {
    if (document.getElementById("smartScannerOverlay")) return;
    const div = document.createElement("div");
    div.className = "scanner-overlay";
    div.id = "smartScannerOverlay";
    div.innerHTML = `
      <div class="scanner-topbar">
        <div>
          <strong style="font-size:16px;">Smart Document Scanner</strong>
          <span id="scanSubLabel" style="display:block;font-size:12px;color:#64748b;">Select document mode & scan</span>
        </div>
        <button type="button" class="hdr-btn" id="closeSmartScannerBtn">✕</button>
      </div>

      <div class="scanner-body">
        <!-- Mode Selector + Upload -->
        <div id="scanStepSelect">
          <div class="pill-grid" id="scanModePills" style="margin-bottom:14px;">
            <button type="button" class="pill-btn" data-mode="id">ID Card</button>
            <button type="button" class="pill-btn" data-mode="cert">Certificate</button>
            <button type="button" class="pill-btn" data-mode="admit">Admit / Marksheet</button>
            <button type="button" class="pill-btn active" data-mode="auto">Auto Detect</button>
          </div>
          <div class="dropzone" id="scanDropzone">
            <div style="font-size:34px;margin-bottom:8px;">📷</div>
            <strong style="display:block;font-size:15px;margin-bottom:4px;">Capture or Upload Document</strong>
            <span style="font-size:12.5px;color:#64748b;">JPG, PNG (Camera or Gallery)</span>
            <input type="file" id="scanFileInput" accept="image/*" hidden />
          </div>
        </div>

        <!-- Step 2: Filter & Rotate Review -->
        <div id="scanStepFilter" style="display:none;">
          <div class="sheet-preview-box">
            <canvas id="scanFilterCanvas" style="max-height:340px;"></canvas>
          </div>

          <div class="filter-grid-3" id="scanFilterPills">
            <button type="button" class="pill-btn" data-filter="original">Original</button>
            <button type="button" class="pill-btn active" data-filter="clean">Clean Scan</button>
            <button type="button" class="pill-btn" data-filter="bw">B&W Contrast</button>
          </div>

          <div class="btn-row-2" style="margin-bottom:12px;">
            <button type="button" class="btn-secondary" id="scanRotateBtn">🔄 Rotate 90°</button>
            <button type="button" class="btn-secondary" id="scanAddAnotherDirectBtn">+ Add More Page</button>
          </div>

          <button type="button" class="btn-primary" id="scanFinishPageBtn">Done — Preview Pages →</button>
        </div>

        <!-- Step 3: Multi-Page Preview & Direct Download (Separate Pages) -->
        <div id="scanStepFinal" style="display:none;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
            <strong id="scanPagesCountTitle">Scanned Pages (1)</strong>
            <span class="step-badge" style="margin:0;">Separate A4 Pages</span>
          </div>

          <div id="scannedPagesList" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px;margin-bottom:16px;"></div>

          <div class="btn-row-2" style="margin-bottom:10px;">
            <button type="button" class="btn-secondary" id="scanAddMoreFinalBtn">+ Add More Page</button>
            <button type="button" class="btn-secondary" id="scanBackEditBtn">← Edit Last</button>
          </div>

          <div class="btn-row-2">
            <button type="button" class="btn-primary" id="scanSavePdfBtn">⬇ Save as PDF</button>
            <button type="button" class="btn-primary" id="scanSaveJpgBtn">⬇ Save as JPG</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(div);

    const overlay = document.getElementById("smartScannerOverlay");
    const fileInput = document.getElementById("scanFileInput");

    document.getElementById("closeSmartScannerBtn").addEventListener("click", () => overlay.classList.remove("open"));
    document.getElementById("scanDropzone").addEventListener("click", () => fileInput.click());

    document.getElementById("scanModePills").addEventListener("click", (e) => {
      const btn = e.target.closest(".pill-btn");
      if (!btn) return;
      document.querySelectorAll("#scanModePills .pill-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      scannerState.mode = btn.dataset.mode;
    });

    fileInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const c = document.createElement("canvas");
        c.width = img.width;
        c.height = img.height;
        c.getContext("2d").drawImage(img, 0, 0);
        URL.revokeObjectURL(url);

        scannerState.currentCanvas = c;
        scannerState.currentRotation = 0;
        document.getElementById("scanStepSelect").style.display = "none";
        document.getElementById("scanStepFinal").style.display = "none";
        document.getElementById("scanStepFilter").style.display = "block";
        renderFilteredPreview();
      };
      img.src = url;
      fileInput.value = "";
    });

    document.getElementById("scanFilterPills").addEventListener("click", (e) => {
      const btn = e.target.closest(".pill-btn");
      if (!btn) return;
      document.querySelectorAll("#scanFilterPills .pill-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      scannerState.filter = btn.dataset.filter;
      renderFilteredPreview();
    });

    document.getElementById("scanRotateBtn").addEventListener("click", () => {
      scannerState.currentRotation = (scannerState.currentRotation + 90) % 360;
      renderFilteredPreview();
    });

    function commitCurrentPage() {
      const preview = document.getElementById("scanFilterCanvas");
      scannerState.pages.push({
        dataUrl: preview.toDataURL("image/jpeg", 0.94),
        width: preview.width,
        height: preview.height
      });
    }

    document.getElementById("scanAddAnotherDirectBtn").addEventListener("click", () => {
      commitCurrentPage();
      fileInput.click();
    });

    document.getElementById("scanFinishPageBtn").addEventListener("click", () => {
      commitCurrentPage();
      showFinalPages();
    });

    document.getElementById("scanAddMoreFinalBtn").addEventListener("click", () => fileInput.click());
    document.getElementById("scanBackEditBtn").addEventListener("click", () => {
      if (scannerState.pages.length) scannerState.pages.pop();
      document.getElementById("scanStepFinal").style.display = "none";
      document.getElementById("scanStepFilter").style.display = "block";
    });

    // Save Multi-Page PDF (Each scanned item on its own separate A4 page)
    document.getElementById("scanSavePdfBtn").addEventListener("click", async () => {
      const { PDFDocument } = window.PDFLib;
      const pdfDoc = await PDFDocument.create();
      for (const p of scannerState.pages) {
        const page = pdfDoc.addPage([595.28, 841.89]); // A4
        const jpg = await pdfDoc.embedJpg(p.dataUrl);
        const scale = Math.min(555 / p.width, 800 / p.height);
        const w = p.width * scale;
        const h = p.height * scale;
        page.drawImage(jpg, { x: (595.28 - w) / 2, y: (841.89 - h) / 2, width: w, height: h });
      }
      const bytes = await pdfDoc.save();
      window.ShopUI.downloadBlob(new Blob([bytes], { type: "application/pdf" }), "therajesh-scanned-pages.pdf");
      window.ShopUI.toast("Scanned PDF downloaded!");
    });

    // Save JPGs
    document.getElementById("scanSaveJpgBtn").addEventListener("click", async () => {
      for (let i = 0; i < scannerState.pages.length; i++) {
        const blob = await (await fetch(scannerState.pages[i].dataUrl)).blob();
        window.ShopUI.downloadBlob(blob, `therajesh-scan-page-${i + 1}.jpg`);
      }
      window.ShopUI.toast("Scanned JPG(s) downloaded!");
    });
  }

  function renderFilteredPreview() {
    const src = scannerState.currentCanvas;
    if (!src) return;
    const out = document.getElementById("scanFilterCanvas");
    const rot = scannerState.currentRotation;
    out.width = rot % 180 === 0 ? src.width : src.height;
    out.height = rot % 180 === 0 ? src.height : src.width;

    const ctx = out.getContext("2d");
    ctx.save();
    ctx.translate(out.width / 2, out.height / 2);
    ctx.rotate((rot * Math.PI) / 180);
    if (scannerState.filter === "clean") {
      ctx.filter = "contrast(1.22) brightness(1.06)";
    } else if (scannerState.filter === "bw") {
      ctx.filter = "grayscale(1) contrast(1.65) brightness(1.08)";
    } else {
      ctx.filter = "none";
    }
    ctx.drawImage(src, -src.width / 2, -src.height / 2);
    ctx.restore();
  }

  function showFinalPages() {
    document.getElementById("scanStepFilter").style.display = "none";
    document.getElementById("scanStepFinal").style.display = "block";
    document.getElementById("scanPagesCountTitle").textContent = `Scanned Pages (${scannerState.pages.length})`;

    const list = document.getElementById("scannedPagesList");
    list.innerHTML = "";
    scannerState.pages.forEach((p, idx) => {
      const card = document.createElement("div");
      card.className = "side-box";
      card.innerHTML = `
        <div style="display:flex;justify-content:space-between;font-size:12px;font-weight:700;">
          <span>Page ${idx + 1}</span>
          <button type="button" style="border:none;background:none;color:#dc2626;cursor:pointer;" data-rm="${idx}">✕</button>
        </div>
        <img src="${p.dataUrl}" style="width:100%;border-radius:8px;margin-top:6px;" />
      `;
      list.appendChild(card);
    });

    list.querySelectorAll("[data-rm]").forEach((btn) => {
      btn.addEventListener("click", () => {
        scannerState.pages.splice(Number(btn.dataset.rm), 1);
        if (!scannerState.pages.length) {
          document.getElementById("scanStepFinal").style.display = "none";
          document.getElementById("scanStepSelect").style.display = "block";
        } else {
          showFinalPages();
        }
      });
    });
  }

  window.SmartScanner = {
    open() {
      injectScannerModal();
      scannerState.pages = [];
      document.getElementById("scanStepSelect").style.display = "block";
      document.getElementById("scanStepFilter").style.display = "none";
      document.getElementById("scanStepFinal").style.display = "none";
      document.getElementById("smartScannerOverlay").classList.add("open");
    }
  };

  document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("openSmartScannerBtn")?.addEventListener("click", () => window.SmartScanner.open());
    document.getElementById("openScannerFromCards")?.addEventListener("click", () => window.SmartScanner.open());
  });
})();
