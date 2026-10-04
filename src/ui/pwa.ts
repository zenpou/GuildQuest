type InstallEvent = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: string }> };
let deferred: InstallEvent | null = null;
let waiting: ServiceWorker | null = null;
let offlineReady = false;
let failure = false;
let installing = false;
let updateRequested = false;
function updateButton(): HTMLButtonElement | null {
  if (!waiting) return null;
  const worker = waiting;
  const button = document.createElement('button');
  button.textContent = updateRequested ? '更新を適用中…' : '更新して再起動';
  button.disabled = updateRequested;
  button.onclick = () => {
    if (updateRequested) return;
    updateRequested = true;
    worker.postMessage('ACTIVATE_UPDATE');
    paint();
  };
  return button;
}
/** Keep the update action inside a modal's focus/inert boundary as well. */
export function syncPwaUpdateControls() {
  for (const target of document.querySelectorAll<HTMLElement>('[data-pwa-update]')) {
    const button = updateButton();
    target.replaceChildren(...(button ? [button] : []));
    target.hidden = !button;
  }
}
function paint() {
  const target = document.getElementById('pwa');
  if (!target) return;
  target.replaceChildren(); target.className = 'pwa-bar';
  const status = document.createElement('span'); status.className = 'pwa-status';
  status.textContent = failure ? 'オフライン準備に失敗しました。接続を確認して再読み込みしてください。' : offlineReady ? (navigator.onLine ? 'オフラインでも遊べます · 自動保存' : 'オフラインでプレイ中 · 自動保存') : import.meta.env.PROD ? 'オフラインで遊ぶ準備中…' : '開発プレビュー · 自動保存';
  target.append(status);
  const install = document.createElement('button');
  install.textContent = deferred ? 'アプリをインストール' : 'ホーム画面に追加するには';
  install.disabled = installing;
  install.onclick = async () => {
    if (deferred) {
      const event = deferred; deferred = null; installing = true; paint();
      try { await event.prompt(); await event.userChoice; } finally { installing = false; paint(); }
    } else {
      status.textContent = 'スマホはブラウザの共有・メニューから「ホーム画面に追加」。PCはアドレスバーのインストールアイコン。対応状況はブラウザにより異なります。';
    }
  };
  if (!matchMedia('(display-mode: standalone)').matches) target.append(install);
  const update = updateButton();
  if (update) target.append(update);
  syncPwaUpdateControls();
}
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e as InstallEvent; paint(); });
  window.addEventListener('appinstalled', () => { deferred = null; paint(); });
  window.addEventListener('online', paint); window.addEventListener('offline', paint);
}
export function initPwa() {
  paint();
  if (!import.meta.env.PROD) return;
  if (!('serviceWorker' in navigator) || !window.isSecureContext) { failure = true; paint(); return; }
  // An initial install claims an uncontrolled page, so it must not reload it.
  // An existing controller means this is an update; all controlled tabs reload
  // on controllerchange, including tabs that did not click the update button.
  let hadController = Boolean(navigator.serviceWorker.controller);
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController && !reloading) { reloading = true; location.reload(); }
    // The first claim is the initial install. It becomes the baseline for
    // the next release, even though that first controllerchange did not reload.
    hadController = true;
  });
  navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { updateViaCache: 'none' }).then(reg => {
    const update = () => { waiting = reg.waiting; paint(); };
    const watch = (worker: ServiceWorker | null) => worker?.addEventListener('statechange', update);
    update(); watch(reg.installing);
    reg.addEventListener('updatefound', () => watch(reg.installing));
    let lastUpdateCheck = 0;
    const checkForUpdate = () => {
      if (!navigator.onLine || document.visibilityState !== 'visible') return;
      const now = Date.now();
      if (now - lastUpdateCheck < 60_000) return;
      lastUpdateCheck = now;
      void reg.update().catch(() => { /* offline and transient network errors are harmless */ });
    };
    window.addEventListener('focus', checkForUpdate);
    document.addEventListener('visibilitychange', checkForUpdate);
    window.addEventListener('online', checkForUpdate);
    navigator.serviceWorker.ready.then(() => { offlineReady = true; update(); checkForUpdate(); });
  }).catch(() => { failure = true; paint(); });
}
