document.addEventListener('DOMContentLoaded', function () {
  document.querySelectorAll('form').forEach(function (form) {
    form.addEventListener('submit', function () {
      setTimeout(() => {
        this.querySelectorAll('button[type="submit"], input[type="submit"]').forEach(function (button) {
          button.disabled = true;
          button.classList.add('disabled');
        });
      }, 0);
    });
  });
});
