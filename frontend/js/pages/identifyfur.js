/* ==========================================================
   identifyfur.js
   - upload / drag & drop / camera capture
   - Identify + Remove buttons
   - free identification counter (3 -> 0, then login/register popup)
   - result popup (demo data until the AI backend is connected)
   ========================================================== */
(() => {
  const $ = (id) => document.getElementById(id);

  const dropzone      = $("dropzone");
  if (!dropzone) return; // not on this page

  const dropzoneEmpty = $("dropzoneEmpty");
  const previewImg    = $("previewImg");
  const identifyBtn   = $("identifyBtn");
  const removeBtn     = $("removeBtn");
  const fileInput     = $("fileInput");
  const cameraInput   = $("cameraInput");
  const uploadBtn     = $("uploadBtn");
  const cameraBtn     = $("cameraBtn");

  const cameraModal   = $("cameraModal");
  const cameraVideo   = $("cameraVideo");
  const cameraCanvas  = $("cameraCanvas");
  const captureBtn    = $("captureBtn");
  const cancelBtn     = $("cancelCameraBtn");

  const uploadNote    = $("uploadNote");
  const freeLeftEl    = $("freeLeft");

  const resultModal   = $("resultModal");
  const resultClose   = $("resultClose");
  const resultPhoto   = $("resultPhoto");
  const resultChips   = $("resultChips");
  const resultTitle   = $("resultTitle");
  const resultWhy     = $("resultWhy");
  const shareBtn      = $("shareBtn");
  const tryAgainBtn   = $("tryAgainBtn");

  const limitModal    = $("limitModal");
  const limitClose    = $("limitClose");

  let selectedFile = null;
  let previewURL = null;
  let stream = null;
  let lastResult = null;
  let scanSource = "Upload"; // "Camera" or "Upload", sent to the backend

  /* ==========================================================
     FREE IDENTIFICATION COUNTER
     Stored in this browser (localStorage) so it survives refresh.
     ========================================================== */
  const FREE_LIMIT = 3;
  const STORAGE_KEY = "furify_free_left";


  const MESSAGES = {
  notDog: "❌ Image does not appear to contain a dog. Please try another photo.",
  uncertain: "isn't clear enough to be sure. Try a sharper, well-lit photo.",
};
  // TODO (auth.js / backend): when the user logs in, save something under
  // "furify_user" (e.g. localStorage.setItem("furify_user", "1")).
  // Logged-in users skip the free limit and the counter note is hidden.
  function isLoggedIn() {
    if (window.FurifyAuth) return window.FurifyAuth.isLoggedIn();
    try { return !!localStorage.getItem("furify_user"); }
    catch { return false; }
  }

  function getFreeLeft() {
    // logged in: the 50-use counter lives in auth.js
    if (isLoggedIn() && window.FurifyAuth) return window.FurifyAuth.getLeft();
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === null) return FREE_LIMIT;
      const n = parseInt(saved, 10);
      return Number.isNaN(n) ? FREE_LIMIT : Math.max(0, Math.min(FREE_LIMIT, n));
    } catch {
      return FREE_LIMIT;
    }
  }

  function setFreeLeft(n) {
    if (isLoggedIn() && window.FurifyAuth) {
      window.FurifyAuth.setLeft(n);
      renderFreeLeft();
      return;
    }
    try { localStorage.setItem(STORAGE_KEY, String(n)); } catch {}
    renderFreeLeft();
  }

  function renderFreeLeft() {
    freeLeftEl.textContent = getFreeLeft();
    uploadNote.hidden = isLoggedIn();
  }

  renderFreeLeft();

  // update the note + counter right after the user logs in from the popup
  document.addEventListener("furify:auth-change", renderFreeLeft);

  // To reset while testing, run this in the browser console:
  //   localStorage.removeItem("furify_free_left"); location.reload();

  /* ==========================================================
     PHOTO: choose, show, remove
     ========================================================== */
  function setPhoto(file, source = "Upload") {
    if (!file || !file.type.startsWith("image/")) {
      alert("Please choose an image file.");
      return;
    }

    selectedFile = file;
    scanSource = source;

    if (previewURL) URL.revokeObjectURL(previewURL);
    previewURL = URL.createObjectURL(file);

    previewImg.src = previewURL;
    previewImg.hidden = false;
    dropzoneEmpty.hidden = true;
    dropzone.classList.add("has-photo");
    identifyBtn.hidden = false;
    removeBtn.hidden = false;
  }

  // Back to the Camera / Upload view
  function resetPhoto() {
    selectedFile = null;

    if (previewURL) {
      URL.revokeObjectURL(previewURL);
      previewURL = null;
    }

    previewImg.removeAttribute("src");
    previewImg.hidden = true;
    dropzoneEmpty.hidden = false;
    dropzone.classList.remove("has-photo");
    identifyBtn.hidden = true;
    removeBtn.hidden = true;
  }

  removeBtn.addEventListener("click", resetPhoto);

  /* ---------- Upload from device ---------- */
  uploadBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    fileInput.click();
  });

  // Clicking the dropzone also opens the file picker
  // (clicking an existing photo lets the user swap it)
  dropzone.addEventListener("click", () => fileInput.click());

  fileInput.addEventListener("change", () => {
    if (fileInput.files[0]) setPhoto(fileInput.files[0]);
    fileInput.value = ""; // allows re-picking the same file
  });

  cameraInput.addEventListener("change", () => {
    if (cameraInput.files[0]) setPhoto(cameraInput.files[0], "Camera");
    cameraInput.value = "";
  });

  /* ---------- Drag and drop ---------- */
  ["dragenter", "dragover"].forEach((evt) =>
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.add("dragover");
    })
  );

  ["dragleave", "drop"].forEach((evt) =>
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.remove("dragover");
    })
  );

  dropzone.addEventListener("drop", (e) => {
    if (e.dataTransfer.files[0]) setPhoto(e.dataTransfer.files[0]);
  });

  /* ==========================================================
     CAMERA (live capture)
     ========================================================== */
  async function openCamera() {
    // No camera API (or not https/localhost): fall back to the native picker.
    // On phones this opens the camera app directly.
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      cameraInput.click();
      return;
    }

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      cameraVideo.srcObject = stream;
      cameraModal.hidden = false;
    } catch (err) {
      console.warn("Camera unavailable:", err);
      cameraInput.click();
    }
  }

  function closeCamera() {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      stream = null;
    }
    cameraVideo.srcObject = null;
    cameraModal.hidden = true;
  }

  function takePhoto() {
    if (!cameraVideo.videoWidth) return; // video not ready yet

    cameraCanvas.width = cameraVideo.videoWidth;
    cameraCanvas.height = cameraVideo.videoHeight;
    cameraCanvas.getContext("2d").drawImage(cameraVideo, 0, 0);

    cameraCanvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], `furify-${Date.now()}.jpg`, {
          type: "image/jpeg",
        });
        setPhoto(file, "Camera");
        closeCamera();
      },
      "image/jpeg",
      0.92
    );
  }

  cameraBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    openCamera();
  });
  captureBtn.addEventListener("click", takePhoto);
  cancelBtn.addEventListener("click", closeCamera);

  cameraModal.addEventListener("click", (e) => {
    if (e.target === cameraModal) closeCamera();
  });

  
 async function identifyPhoto(file) {
  const form = new FormData();
  form.append("file", file);

  const headers = { "X-Scan-Source": scanSource };

  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session && session.access_token) {
      headers["Authorization"] = `Bearer ${session.access_token}`;
    }
  } catch (e) {
    // supabase client not available: treated as a guest
  }

  if (!headers["Authorization"]) {
    let guestId = localStorage.getItem("furify_guest_id");
    if (!guestId) {
      guestId = "guest_" + crypto.randomUUID();
      localStorage.setItem("furify_guest_id", guestId);
    }
    headers["X-Guest-Device-ID"] = guestId;
  }

  const res = await fetch("/api/predict", { method: "POST", headers, body: form });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Identification failed");
  }
  const data = await res.json();

  if (data.status === "limit_reached") {
    const e = new Error(data.message);
    e.code = "limit";
    throw e;
  }
  if (data.status === "not_dog") throw new Error(MESSAGES.notDog);
  if (data.status === "error") throw new Error(data.message);

  const matches = data.top3.map((m) => ({
    breed: m.breed,
    percent: Math.round(m.confidence * 100),  
  }));

  const reason = data.status === "uncertain"
    ? `${data.breed} was the closest match, but the photo ${MESSAGES.uncertain}`
    : (data.info ||
       `${data.breed} was the strongest match based on the dog's coat, ear shape, facial features, and overall body shape.`);

  return { matches, reason };
}
  /* ==========================================================
     IDENTIFY BUTTON
     ========================================================== */
  // Popup shown when there are no identifications left
  function showLimit() {
    const title   = $("limitTitle");
    const sub     = $("limitSub");
    const actions = $("limitActions");

    if (isLoggedIn()) {
      const maxUses = window.FurifyAuth ? window.FurifyAuth.MAX_USES : 30;
      title.textContent = `You've used all ${maxUses} identifications`;
      sub.textContent = "Thanks for using Furify! More identifications are coming soon.";
      actions.hidden = true;
    } else {
      title.textContent = "You've used all your free identifications";
      sub.textContent = "Log in or register to unlock more identifications.";
      actions.hidden = false;
    }
    limitModal.hidden = false;
  }

  identifyBtn.addEventListener("click", async () => {
    if (!selectedFile) return;

    // Out of uses -> guests are asked to log in / register
    if (getFreeLeft() <= 0) {
      showLimit();
      return;
    }

    identifyBtn.disabled = true;
    removeBtn.disabled = true;
    identifyBtn.textContent = "Identifying...";

    try {
      const result = await identifyPhoto(selectedFile);

      // Only use up a free try when the identification actually succeeded
      setFreeLeft(getFreeLeft() - 1);

      showResult(result);
    } catch (err) {
      if (err.code === "limit") { setFreeLeft(0); showLimit(); return; }
      console.error(err);
      alert(err.message || "Sorry, we couldn't identify this photo. Please try again.");
    } finally {
      identifyBtn.disabled = false;
      removeBtn.disabled = false;
      identifyBtn.textContent = "Identify Fur";
    }
  });

  /* ==========================================================
     RESULT POPUP
     ========================================================== */
  function showResult(result) {
    lastResult = result;
    const matches = (result && result.matches) || [];
    const top = matches[0] || { breed: "Unknown", percent: 0 };

    resultPhoto.src = previewURL;
    resultTitle.textContent = `Top Match: ${top.breed}`;
    resultWhy.textContent = `\u201C${result.reason || ""}\u201D`;

    // Breed chips (green / yellow / red)
    resultChips.innerHTML = "";
    matches.slice(0, 3).forEach((m, i) => {
      const chip = document.createElement("span");
      chip.className = `chip rank-${i + 1}`;

      const name = document.createElement("span");
      name.className = "chip-name";
      name.textContent = m.breed;

      const pct = document.createElement("span");
      pct.className = "chip-percent";
      pct.textContent = `${m.percent}%`;

      chip.append(name, pct);
      resultChips.appendChild(chip);
    });

    resultModal.hidden = false;
  }

  function closeResult() {
    resultModal.hidden = true;
  }

  resultClose.addEventListener("click", closeResult);
  resultModal.addEventListener("click", (e) => {
    if (e.target === resultModal) closeResult();
  });

  // "Try Another Photo" -> close popup and go back to Camera / Upload
  tryAgainBtn.addEventListener("click", () => {
    closeResult();
    resetPhoto();
  });

  // Share (native share sheet on phones, copy to clipboard elsewhere)
  shareBtn.addEventListener("click", async () => {
    if (!lastResult) return;
    const top = lastResult.matches[0];
    const text = `Furify says my dog is a ${top.breed} (${top.percent}% match)!`;

    try {
      if (navigator.share) {
        await navigator.share({ title: "Furify", text, url: location.href });
      } else {
        await navigator.clipboard.writeText(`${text} ${location.href}`);
        alert("Result copied to clipboard!");
      }
    } catch (err) {
      // user cancelled the share sheet: nothing to  do
    }
  });

  /* ==========================================================
     LIMIT POPUP + ESC KEY
     ========================================================== */
  limitClose.addEventListener("click", () => (limitModal.hidden = true));
  limitModal.addEventListener("click", (e) => {
    if (e.target === limitModal) limitModal.hidden = true;
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!cameraModal.hidden) closeCamera();
    if (!resultModal.hidden) closeResult();
    if (!limitModal.hidden) limitModal.hidden = true;
  });
})();