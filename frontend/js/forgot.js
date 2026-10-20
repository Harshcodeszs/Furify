/* ==========================================================
   js/forgot.js: "Forgot password" for the Furify login popup

   Files that make up this feature:
     js/auth.js              the markup (RESET panel, inside the popup next to login + signup)
     css/pages/forgot.css    the design + the white slide-over
     js/forgot.js            this file: the flow + the BACKEND HOOKS

   js/auth.js loads this file and forgot.css by itself the first time the
   popup opens, then calls FurifyForgot.init(). Nothing to add to any page.

   >>> BACKEND: edit ONLY the RecoveryAPI object below. <<<
   ========================================================== */
(() => {
  const $ = (id) => document.getElementById(id);

  // filled in by FurifyForgot.init() (called from auth.js)
  let ctx = null;
  let card = null;
  let overlay = null;

  /* ==========================================================
     FORGOT PASSWORD: the UI is done (slide, screens, 6-digit boxes,
     validation, resend timer, loading states).

     >>> BACKEND MATE: fill in the 3 functions of RecoveryAPI below. <<<
     They are TODO stubs: right now they only wait half a second and
     succeed, so the screens can be clicked through. Nothing is sent
     and no code is checked.

     Contract for each one:
       - success  -> just return
       - failure  -> throw new Error("message")  (the message is shown to the user)
     ========================================================== */
  const RESEND_SECONDS = 30;
  const CODE_LENGTH = 6;
  const pause = (ms) => new Promise((r) => setTimeout(r, ms));

  const RecoveryAPI = {
    /* TODO 1: email a 6-digit code to `email`.
       Tip: don't reveal whether the email has an account (return either way).
       Supabase idea (the "Reset Password" email template must print {{ .Token }}):
         const { error } = await window.supabase.auth.resetPasswordForEmail(email);
         if (error) throw new Error(error.message);                                  */
    async sendCode(email) {
      await pause(500);   // TODO: replace this line
    },

    /* TODO 2: check the 6-digit `code` for `email`.
       Supabase idea (this also signs the user in):
         const { error } = await window.supabase.auth.verifyOtp({ email, token: code, type: "recovery" });
         if (error) throw new Error("Invalid or expired code.");                     */
    async verifyCode(email, code) {
      await pause(500);   // TODO: replace this line
    },

    /* TODO 3: save the new password (the code was checked in TODO 2).
       Supabase idea:
         const { error } = await window.supabase.auth.updateUser({ password });
         if (error) throw new Error(error.message);                                  */
    async resetPassword({ email, code, password }) {
      await pause(500);   // TODO: replace this line
    },
  };

  /* ---------- forgot-password UI ---------- */
  const STEP_ORDER = ["email", "code", "new", "done"];
  let panel = null;
  let resetSteps = [];
  let codeBoxes = [];
  let resendBtn = null;
  let cooldownTimer = 0;
  const reset = { email: "", done: false };

  const stepEl = (name) => resetSteps.find((s) => s.dataset.stepName === name);

  function say(form, text, ok = false) {
    const el = form.querySelector(".auth-msg");
    if (!el) return;
    el.textContent = text;
    el.classList.toggle("is-ok", !!(ok && text));
  }

  // show one step: earlier steps wait on the left, later ones on the right
  function setStep(name, focusDelay = 450) {
    const now = STEP_ORDER.indexOf(name);
    resetSteps.forEach((el) => {
      const i = STEP_ORDER.indexOf(el.dataset.stepName);
      el.classList.toggle("is-active", i === now);
      el.dataset.pos = i < now ? "before" : i > now ? "after" : "now";
      el.setAttribute("aria-hidden", i === now ? "false" : "true");
    });
    if (focusDelay === null) return;
    setTimeout(() => {
      if (card.dataset.view !== "forgot") return;
      const target = stepEl(name).querySelector("input, button.btn-yellow");
      if (target) target.focus({ preventScroll: true });
    }, focusDelay);
  }

  function stopCooldown() {
    clearInterval(cooldownTimer);
    cooldownTimer = 0;
  }

  function startCooldown() {
    stopCooldown();
    let left = RESEND_SECONDS;
    resendBtn.disabled = true;
    const tick = () => {
      if (left <= 0) {
        stopCooldown();
        resendBtn.disabled = false;
        resendBtn.textContent = "Resend Code";
        return;
      }
      resendBtn.textContent = `Resend in ${left}s`;
      left--;
    };
    tick();
    cooldownTimer = setInterval(tick, 1000);
  }

  function clearReset() {
    stopCooldown();
    panel.querySelectorAll("form").forEach((f) => { f.reset(); say(f, ""); });
    codeBoxes.forEach((b) => b.classList.remove("is-filled"));
    resendBtn.disabled = false;
    resendBtn.textContent = "Resend Code";
    reset.email = "";
    reset.done = false;
    setStep("email", null);
  }

  // used by openModal(): always start on the log in side, nothing animated
  function resetForgotState() {
    if (!panel) return;
    delete card.dataset.view;
    delete card.dataset.enter;
    delete card.dataset.back;
    clearReset();
  }

  // run one step's request with the same "Please wait..." feel as log in
  async function run(form, pendingText, task) {
    const btn = form.querySelector('button[type="submit"]');
    const label = btn.textContent;
    btn.disabled = true;
    btn.textContent = pendingText;
    say(form, "");
    try {
      await task();
    } catch (err) {
      say(form, err.message || "Something went wrong. Please try again.");
    } finally {
      btn.disabled = false;
      btn.textContent = label;
    }
  }

  /* the white layer grows from the log in half over the whole card */
  function openForgot() {
    if (ctx.getBusy() || !panel || card.dataset.view === "forgot") return;
    const typed = ctx.loginForm().elements.email.value.trim();
    ctx.clearMessages();
    clearReset();
    if (typed) stepEl("email").elements.email.value = typed;   // carry over what they already typed

    card.dataset.view = "forgot";
    card.dataset.phase = "forgot";
    panel.setAttribute("aria-hidden", "false");

    if (ctx.isMobile.matches) {            // no slide on phones
      setStep("email", 100);
      return;
    }
    ctx.setBusy(true);
    card.dataset.enter = "";           // CSS: wait for the white to land before the text shows
    setStep("email", 1050);
    setTimeout(() => { delete card.dataset.enter; ctx.setBusy(false); }, 1100);
  }

  /* ...and shrinks back, then the log in form fades in again */
  function closeForgot() {
    if (ctx.getBusy() || !panel || card.dataset.view !== "forgot") return;
    const login = ctx.loginForm();
    if (reset.done && reset.email) {   // password was changed: hand the email back to the log in form
      login.elements.email.value = reset.email;
      login.elements.password.value = "";
    }

    delete card.dataset.view;
    card.dataset.phase = "idle";
    panel.setAttribute("aria-hidden", "true");

    const finish = () => {
      delete card.dataset.back;
      clearReset();
      ctx.setBusy(false);
      if (overlay.classList.contains("is-open")) {
        (login.elements.email.value ? login.elements.password : login.elements.email).focus({ preventScroll: true });
      }
    };
    if (ctx.isMobile.matches) { finish(); return; }
    ctx.setBusy(true);
    card.dataset.back = "";
    setTimeout(finish, 1300);
  }

  function wireForgot() {
    panel = $("authReset");
    resetSteps = [...panel.querySelectorAll(".reset-step")];
    codeBoxes = [...panel.querySelectorAll(".code-box")];
    resendBtn = $("resendBtn");

    panel.querySelectorAll("[data-reset-back]").forEach((b) => b.addEventListener("click", closeForgot));

    /* ---- step 1: email -> send the code ---- */
    const emailForm = stepEl("email");
    emailForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const email = emailForm.elements.email.value.trim();
      if (!/^\S+@\S+\.\S+$/.test(email)) return say(emailForm, "Please enter a valid email address.");

      run(emailForm, "Sending...", async () => {
        await RecoveryAPI.sendCode(email);
        reset.email = email;
        $("resetEmailShown").textContent = email;
        codeBoxes.forEach((b) => { b.value = ""; b.classList.remove("is-filled"); });
        startCooldown();
        setStep("code");
      });
    });

    /* ---- step 2: the 6 digit boxes ---- */
    const codeForm = stepEl("code");
    const fillFrom = (start, digits) => {
      [...digits].slice(0, CODE_LENGTH - start).forEach((d, k) => { codeBoxes[start + k].value = d; });
      codeBoxes.forEach((b) => b.classList.toggle("is-filled", !!b.value));
      codeBoxes[Math.min(start + digits.length, CODE_LENGTH - 1)].focus();
    };
    codeBoxes.forEach((box, i) => {
      // typing, pasting and the phone's "autofill code" all arrive here
      box.addEventListener("input", () => {
        const digits = box.value.replace(/\D/g, "");
        box.value = "";
        if (digits) fillFrom(i, digits);
        else box.classList.remove("is-filled");
        say(codeForm, "");
      });
      box.addEventListener("keydown", (e) => {
        if (e.key === "Backspace" && !box.value && i > 0) {
          e.preventDefault();
          codeBoxes[i - 1].value = "";
          codeBoxes[i - 1].classList.remove("is-filled");
          codeBoxes[i - 1].focus();
        } else if (e.key === "ArrowLeft" && i > 0) {
          e.preventDefault();
          codeBoxes[i - 1].focus();
        } else if (e.key === "ArrowRight" && i < CODE_LENGTH - 1) {
          e.preventDefault();
          codeBoxes[i + 1].focus();
        }
      });
      box.addEventListener("focus", () => box.select());
    });

    codeForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const code = codeBoxes.map((b) => b.value).join("");
      if (code.length < CODE_LENGTH) return say(codeForm, "Enter all 6 digits of your code.");

      run(codeForm, "Checking...", async () => {
        await RecoveryAPI.verifyCode(reset.email, code);
        reset.code = code;
        setStep("new");
      });
    });

    resendBtn.addEventListener("click", async () => {
      if (resendBtn.disabled) return;
      resendBtn.disabled = true;
      resendBtn.textContent = "Sending...";
      say(codeForm, "");
      try {
        await RecoveryAPI.sendCode(reset.email);
        codeBoxes.forEach((b) => { b.value = ""; b.classList.remove("is-filled"); });
        codeBoxes[0].focus();
        say(codeForm, "A new code is on its way.", true);
        startCooldown();
      } catch (err) {
        say(codeForm, err.message || "Couldn't resend the code. Please try again.");
        resendBtn.disabled = false;
        resendBtn.textContent = "Resend Code";
      }
    });

    /* ---- step 3: new password ---- */
    const newForm = stepEl("new");
    newForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const { password, confirm } = Object.fromEntries(new FormData(newForm));
      if (password.length < 6) return say(newForm, "Password must be at least 6 characters.");
      if (password !== confirm) return say(newForm, "The two passwords don't match.");

      run(newForm, "Updating...", async () => {
        await RecoveryAPI.resetPassword({ email: reset.email, code: reset.code, password });
        reset.done = true;
        setStep("done");
      });
    });
  }


  /* ---------- public API (used by auth.js) ---------- */
  window.FurifyForgot = {
    init(context) {
      ctx = context;
      card = ctx.card;
      overlay = ctx.overlay;
      wireForgot();
    },
    open: openForgot,
    close: closeForgot,
    resetState: resetForgotState,
  };
})();