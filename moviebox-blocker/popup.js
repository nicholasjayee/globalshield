chrome.storage.local.get('mb_stats', (r) => {
  const s = r.mb_stats || { overlays: 0, popups: 0, scripts: 0, ads: 0 };
  document.getElementById('overlays').textContent = s.overlays;
  document.getElementById('popups').textContent   = s.popups;
  document.getElementById('scripts').textContent  = s.scripts;
  document.getElementById('ads').textContent      = s.ads;
});

document.getElementById('reset').addEventListener('click', () => {
  const zero = { overlays: 0, popups: 0, scripts: 0, ads: 0 };
  chrome.storage.local.set({ mb_stats: zero }, () => {
    document.getElementById('overlays').textContent = 0;
    document.getElementById('popups').textContent   = 0;
    document.getElementById('scripts').textContent  = 0;
    document.getElementById('ads').textContent      = 0;
  });
});