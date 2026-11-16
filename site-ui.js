(function () {
  const LANG_KEY = "therajesh_lang";
  let currentLang = localStorage.getItem(LANG_KEY) || "en";

  function applyLanguage(lang) {
    currentLang = lang === "bn" ? "bn" : "en";
    localStorage.setItem(LANG_KEY, currentLang);

    document.querySelectorAll("[data-en]").forEach((el) => {
      const text = currentLang === "bn" ? el.getAttribute("data-bn") : el.getAttribute("data-en");
      if (text) el.textContent = text;
    });

    const toggleBtn = document.getElementById("langToggleBtn");
    if (toggleBtn) {
      // ইংরেজি মোডে থাকলে 'বাং' দেখাবে, বাংলা মোডে থাকলে 'ENG' দেখাবে
      toggleBtn.textContent = currentLang === "en" ? "বাং" : "ENG";
    }
  }

  function injectHeaderAndFooter() {
    const headerMount = document.getElementById("siteHeader");
    if (headerMount) {
      headerMount.innerHTML = `
        <header class="site-header">
          <div class="header-inner">
            <a href="./index.html" class="brand">
              <img src="./favicon.png" alt="therajesh.shop" onerror="this.style.display='none'">
              <span>
                therajesh.shop
                <span class="brand-sub" data-en="Digital Seva Kendra • Document & Photo Studio" data-bn="ডিজিটাল সেবা কেন্দ্র • ডকুমেন্ট ও ফটো স্টুডিও">Digital Seva Kendra • Document & Photo Studio</span>
              </span>
            </a>
            <div class="header-actions">
              <button type="button" class="hdr-btn" id="openSuggestionBtn" data-en="💡 Suggestion" data-bn="💡 পরামর্শ">💡 Suggestion</button>
              <button type="button" class="hdr-btn lang-btn" id="langToggleBtn">বাং</button>
            </div>
          </div>
        </header>
      `;
    }

    const footerMount = document.getElementById("siteFooter");
    if (footerMount) {
      footerMount.innerHTML = `
        <footer class="site-footer">
          <div class="footer-links">
            <a href="./index.html" data-en="Photo Studio" data-bn="ফটো স্টুডিও">Photo Studio</a>
            <a href="./cards.html" data-en="ID Card Tool" data-bn="কার্ড টুল">ID Card Tool</a>
            <a href="./pdf-tools.html" data-en="PDF Tools" data-bn="পিডিএফ টুলস">PDF Tools</a>
            <button type="button" id="privacyInfoBtn" data-en="Privacy Info" data-bn="প্রাইভেসি তথ্য">Privacy Info</button>
          </div>
          <div>therajesh.shop • 100% Client-Side Browser Tools • Developed by Rajesh Das</div>
        </footer>
      `;
    }

    // Suggestion & Privacy Modals + Toast
    const modals = document.createElement("div");
    modals.innerHTML = `
      <div class="modal-backdrop" id="suggestionModal">
        <div class="modal-card">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
            <strong style="font-size:16px;" data-en="Send a Suggestion" data-bn="আপনার পরামর্শ দিন">Send a Suggestion</strong>
            <button type="button" class="hdr-btn" id="closeSuggestionBtn">✕</button>
          </div>
          <p style="margin:0 0 12px;font-size:13px;color:#64748b;" data-en="Have an idea for a new card format or tool? Write it below." data-bn="নতুন কোনো কার্ড সাইজ বা টুলের প্রয়োজন হলে নিচে লিখুন।">Have an idea for a new card format or tool? Write it below.</p>
          <textarea id="suggestionText" rows="4" style="width:100%;padding:12px;border:1px solid #e2e8f0;border-radius:12px;font-family:inherit;font-size:14px;margin-bottom:12px;" placeholder="Write your suggestion..."></textarea>
          <button type="button" class="btn-primary" id="saveSuggestionBtn" data-en="Submit Suggestion" data-bn="পরামর্শ সেভ করুন">Submit Suggestion</button>
        </div>
      </div>

      <div class="modal-backdrop" id="privacyModal">
        <div class="modal-card">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
            <strong style="font-size:16px;" data-en="100% Client-Side Privacy" data-bn="১০০% নিরাপদ ও প্রাইভেট">100% Client-Side Privacy</strong>
            <button type="button" class="hdr-btn" id="closePrivacyBtn">✕</button>
          </div>
          <p style="margin:0 0 14px;font-size:13.5px;color:#475569;" data-en="All photos, Aadhaar/Ration cards, and PDF files are processed locally inside your browser. Nothing is uploaded to any server." data-bn="আপনার সব ছবি, রেশন কার্ড ও পিডিএফ ফাইল শুধুমাত্র আপনার নিজের ব্রাউজারে প্রসেস হয়। কোনো সার্ভারে ফাইল আপলোড হয় না।">All photos, Aadhaar/Ration cards, and PDF files are processed locally inside your browser. Nothing is uploaded to any server.</p>
          <button type="button" class="btn-primary" id="okPrivacyBtn">OK</button>
        </div>
      </div>

      <div class="toast-msg" id="globalToast"></div>
    `;
    document.body.appendChild(modals);

    document.getElementById("langToggleBtn")?.addEventListener("click", () => {
      applyLanguage(currentLang === "en" ? "bn" : "en");
    });

    const sugModal = document.getElementById("suggestionModal");
    document.getElementById("openSuggestionBtn")?.addEventListener("click", () => sugModal.classList.add("open"));
    document.getElementById("closeSuggestionBtn")?.addEventListener("click", () => sugModal.classList.remove("open"));
    document.getElementById("saveSuggestionBtn")?.addEventListener("click", () => {
      const val = document.getElementById("suggestionText").value.trim();
      if (!val) return;
      const list = JSON.parse(localStorage.getItem("therajesh_suggestions") || "[]");
      list.push({ text: val, date: new Date().toISOString() });
      localStorage.setItem("therajesh_suggestions", JSON.stringify(list));
      document.getElementById("suggestionText").value = "";
      sugModal.classList.remove("open");
      window.ShopUI.toast(currentLang === "bn" ? "ধন্যবাদ! আপনার পরামর্শ সংরক্ষিত হয়েছে।" : "Thank you! Suggestion saved.");
    });

    const privModal = document.getElementById("privacyModal");
    document.getElementById("privacyInfoBtn")?.addEventListener("click", () => privModal.classList.add("open"));
    document.getElementById("closePrivacyBtn")?.addEventListener("click", () => privModal.classList.remove("open"));
    document.getElementById("okPrivacyBtn")?.addEventListener("click", () => privModal.classList.remove("open"));

    applyLanguage(currentLang);
  }

  window.ShopUI = {
    getLang: () => currentLang,
    applyLanguage,
    toast(msg) {
      const el = document.getElementById("globalToast");
      if (!el) return;
      el.textContent = msg;
      el.classList.add("show");
      clearTimeout(el._timer);
      el._timer = setTimeout(() => el.classList.remove("show"), 2600);
    },
    setProgress(boxId, label, percent) {
      const box = document.getElementById(boxId);
      if (!box) return;
      box.classList.add("active");
      const p = Math.max(0, Math.min(100, Math.round(percent)));
      const lbl = box.querySelector(".progress-label");
      const pct = box.querySelector(".progress-pct");
      const fill = box.querySelector(".progress-fill");
      if (lbl && label) lbl.textContent = label;
      if (pct) pct.textContent = `${p}%`;
      if (fill) fill.style.width = `${p}%`;
    },
    hideProgress(boxId) {
      const box = document.getElementById(boxId);
      if (box) box.classList.remove("active");
    },
    downloadBlob(blob, filename) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    }
  };

  document.addEventListener("DOMContentLoaded", injectHeaderAndFooter);
})();
