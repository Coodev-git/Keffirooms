/* KeffiRooms — terms navigation (read → back → agree) */

function termsHref(returnPath, focusId) {
  const returnUrl = focusId ? `${returnPath}#${focusId}` : returnPath;
  return `terms.html?return=${encodeURIComponent(returnUrl)}`;
}

function termsPageBack() {
  const params = new URLSearchParams(window.location.search);
  const returnUrl = params.get('return');
  if (returnUrl) {
    window.location.href = returnUrl;
    return;
  }
  if (history.length > 1) history.back();
  else window.location.href = 'index.html';
}

function focusTermsCheckbox(checkboxId) {
  const checkbox = document.getElementById(checkboxId);
  if (!checkbox) return;

  const row = checkbox.closest('.terms-agree-row') || checkbox.closest('label');
  if (row) {
    row.classList.add('terms-return-focus');
    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  setTimeout(() => checkbox.focus(), 300);
}

function initTermsReturnFocus(options = {}) {
  const hash = window.location.hash.replace('#', '');
  if (!hash) return;

  const focusIds = options.focusIds || ['rg-terms', 'sk-terms', 'terms-agree'];
  if (!focusIds.includes(hash)) return;

  if (typeof options.onReturn === 'function') options.onReturn(hash);

  focusTermsCheckbox(hash);
}
