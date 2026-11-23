(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const entry = $("jfRoomEntryPanel");
  if (!entry || $("jfEntryPaperHead")) return;

  const masthead = document.createElement("header");
  masthead.id = "jfEntryPaperHead";
  masthead.className = "jf-entry-paper-head";
  masthead.innerHTML = '<div class="jf-entry-paper-copy"><span class="jf-entry-paper-kicker">ESTAÇÃO DE ENCONTRO · JUNTO.FM</span><h2>Todo mundo no mesmo lugar.</h2><p>Crie uma sala, entre na de alguém ou monte seu cantinho com a galera.</p></div><div class="jf-entry-paper-stamp"><strong>TRANSMISSÃO</strong><span>♫</span><small>NO AR JUNTOS</small></div>';
  entry.insertBefore(masthead, entry.firstChild);

  const account = $("jfEntryAccount");
  const hint = $("jfEntryAccountHint");
  const actions = document.createElement("div");
  actions.className = "jf-entry-account-actions";
  const loginButton = document.createElement("button");
  loginButton.type = "button";
  loginButton.className = "btn";
  loginButton.textContent = "Entrar na conta";
  loginButton.addEventListener("click", () => openAccount("login"));
  const registerButton = document.createElement("button");
  registerButton.type = "button";
  registerButton.className = "btn secondary";
  registerButton.textContent = "Criar conta";
  registerButton.addEventListener("click", () => openAccount("register"));
  actions.append(loginButton, registerButton);
  const googleLink = $("jfGoogleLogin");
  if (googleLink) {
    googleLink.textContent = "Continuar com Google";
    actions.appendChild(googleLink);
  }
  if (account) account.insertBefore(actions, hint || account.firstChild);

  const backdrop = document.createElement("div");
  backdrop.className = "jf-modal-backdrop";
  backdrop.id = "jfEntryAccountModal";
  backdrop.hidden = true;
  backdrop.innerHTML = '<section class="jf-room-modal" role="dialog" aria-modal="true" aria-labelledby="jfAccountModalTitle"><button class="jf-room-modal-close" id="jfAccountModalClose" type="button" aria-label="Fechar">×</button><div class="jf-room-modal-head"><div class="jf-room-modal-icon" aria-hidden="true">♙</div><div><h2 id="jfAccountModalTitle">Sua conta Junto.fm</h2><p id="jfAccountModalIntro">Entre para manter seu perfil, trajes e amizades salvos.</p></div></div><div class="jf-account-tabs" role="tablist" aria-label="Acesso à conta"><button type="button" role="tab" data-account-mode="login" aria-selected="true">Entrar</button><button type="button" role="tab" data-account-mode="register" aria-selected="false">Criar conta</button></div><form id="jfAccountLoginForm"><div class="jf-room-field"><label for="jfAccountLoginEmail">E-mail</label><input id="jfAccountLoginEmail" name="email" type="email" autocomplete="email" maxlength="254" placeholder="voce@exemplo.com" required></div><div class="jf-room-field"><label for="jfAccountLoginPassword">Senha</label><input id="jfAccountLoginPassword" name="password" type="password" autocomplete="current-password" minlength="8" maxlength="256" placeholder="Sua senha" required></div><div class="jf-room-modal-actions"><button class="btn" type="submit">Entrar na conta</button></div></form><form id="jfAccountRegisterForm" hidden><div class="jf-room-field"><label for="jfAccountRegisterUsername">Nome de usuário</label><input id="jfAccountRegisterUsername" name="username" type="text" autocomplete="username" minlength="3" maxlength="20" pattern="[a-zA-Z0-9_]{3,20}" placeholder="seu_usuario" required></div><div class="jf-room-field"><label for="jfAccountRegisterEmail">E-mail</label><input id="jfAccountRegisterEmail" name="email" type="email" autocomplete="email" maxlength="254" placeholder="voce@exemplo.com" required></div><div class="jf-room-field"><label for="jfAccountRegisterPassword">Senha</label><input id="jfAccountRegisterPassword" name="password" type="password" autocomplete="new-password" minlength="8" maxlength="256" placeholder="Mínimo de 8 caracteres" required></div><div class="jf-room-modal-actions"><button class="btn" type="submit">Criar minha conta</button></div></form><p id="jfAccountModalStatus" class="jf-account-status" role="status" aria-live="polite"></p><p class="jf-account-footnote">A conta guarda seu perfil, seus trajes e suas amizades. Você continua podendo entrar em salas sem cadastro.</p></section>';
  document.body.appendChild(backdrop);

  const loginForm = $("jfAccountLoginForm");
  const registerForm = $("jfAccountRegisterForm");
  const status = $("jfAccountModalStatus");
  const intro = $("jfAccountModalIntro");
  function setMode(mode) {
    const register = mode === "register";
    loginForm.hidden = register;
    registerForm.hidden = !register;
    backdrop.querySelectorAll("[data-account-mode]").forEach(button => {
      button.setAttribute("aria-selected", String(button.dataset.accountMode === mode));
    });
    intro.textContent = register
      ? "Crie seu acesso para guardar seu perfil, trajes e amizades."
      : "Entre para manter seu perfil, trajes e amizades salvos.";
    status.textContent = register
      ? "Use um e-mail válido. Enviaremos um link para confirmar seu cadastro."
      : "";
  }
  function openAccount(mode) {
    setMode(mode);
    backdrop.hidden = false;
    const input = mode === "register" ? $("jfAccountRegisterUsername") : $("jfAccountLoginEmail");
    input?.focus();
  }
  function closeAccount() {
    backdrop.hidden = true;
  }
  backdrop.querySelectorAll("[data-account-mode]").forEach(button => {
    button.addEventListener("click", () => setMode(button.dataset.accountMode));
  });
  $("jfAccountModalClose").addEventListener("click", closeAccount);
  backdrop.addEventListener("click", event => {
    if (event.target === backdrop) closeAccount();
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !backdrop.hidden) closeAccount();
  });

  async function sendAccountForm(form, register) {
    const submit = form.querySelector('button[type="submit"]');
    const fields = Object.fromEntries(new FormData(form).entries());
    const payload = register
      ? {username:String(fields.username || "").trim().toLowerCase(),email:String(fields.email || "").trim().toLowerCase(),password:String(fields.password || "")}
      : {email:String(fields.email || "").trim().toLowerCase(),password:String(fields.password || "")};
    submit.disabled = true;
    status.textContent = register ? "Enviando seu cadastro…" : "Verificando seus dados…";
    try {
      const response = await fetch(register ? "/api/account/register" : "/api/account/login", {
        method: "POST", credentials: "same-origin",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify(payload)
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Não foi possível concluir o acesso.");
      if (register) {
        form.reset();
        status.textContent = data.message || "Cadastro recebido. Confira seu e-mail para ativar a conta.";
      } else {
        status.textContent = "Acesso confirmado. Abrindo sua conta…";
        location.reload();
      }
    } catch (error) {
      status.textContent = error.message || "Não foi possível concluir o acesso.";
    } finally {
      submit.disabled = false;
    }
  }
  loginForm.addEventListener("submit", event => {
    event.preventDefault();
    if (loginForm.reportValidity()) void sendAccountForm(loginForm, false);
  });
  registerForm.addEventListener("submit", event => {
    event.preventDefault();
    if (registerForm.reportValidity()) void sendAccountForm(registerForm, true);
  });

  fetch("/api/account/status", {credentials:"same-origin",cache:"no-store"})
    .then(response => response.json())
    .then(data => {
      const configured = Boolean(data.configured);
      const loggedIn = Boolean(data.loggedIn);
      loginButton.hidden = !configured || loggedIn;
      registerButton.hidden = !configured || loggedIn;
      if (hint && !configured) hint.textContent = "Contas temporariamente indisponíveis. Você ainda pode criar e entrar em salas sem cadastro.";
    })
    .catch(() => {
      loginButton.hidden = true;
      registerButton.hidden = true;
      if (hint) hint.textContent = "Não foi possível verificar as contas agora. Você ainda pode entrar em salas sem cadastro.";
    });
})();