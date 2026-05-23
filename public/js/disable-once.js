document.addEventListener('DOMContentLoaded', function () {
  document.querySelectorAll('form').forEach(function (form) {
    form.addEventListener('submit', function (event) {
      setTimeout(() => {
        if (event.defaultPrevented || !form.checkValidity()) return;

        form.querySelectorAll('button[type="submit"], input[type="submit"]').forEach(function (button) {
          if (button.dataset.loadingApplied === 'true') return;

          button.dataset.loadingApplied = 'true';
          button.disabled = true;
          button.classList.add('disabled', 'is-loading');
          button.setAttribute('aria-busy', 'true');

          if (button.tagName === 'BUTTON') {
            button.dataset.originalHtml = button.innerHTML;
            button.innerHTML = `<span class="btn-spinner" aria-hidden="true"></span>${button.dataset.loadingText || 'Processing...'}`;
          } else {
            button.dataset.originalValue = button.value;
            button.value = button.dataset.loadingText || 'Processing...';
          }
        });
      }, 0);
    });
  });
});
