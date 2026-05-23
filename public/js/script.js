// Sidebar Elements
const hamburger = document.getElementById('hamburger');
const sidebar = document.getElementById('sidebar');
const sidebarOverlay = document.getElementById('sidebarOverlay');

// Toggle Sidebar
function toggleSidebar() {
  sidebar.classList.toggle('open');
  hamburger.classList.toggle('active');
  
  if (sidebarOverlay) {
    sidebarOverlay.classList.toggle('active');
  }
  
  // Toggle body scroll
  if (sidebar.classList.contains('open')) {
    document.body.style.overflow = 'hidden';
  } else {
    document.body.style.overflow = '';
  }
}

// Close Sidebar
function closeSidebar() {
  sidebar.classList.remove('open');
  hamburger.classList.remove('active');
  
  if (sidebarOverlay) {
    sidebarOverlay.classList.remove('active');
  }
  
  document.body.style.overflow = '';
}

// Sidebar Event Listeners
if (hamburger) {
  hamburger.addEventListener('click', toggleSidebar);
}

if (sidebarOverlay) {
  sidebarOverlay.addEventListener('click', closeSidebar);
}

// Close on Escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && sidebar.classList.contains('open')) {
    closeSidebar();
  }
});

// Close sidebar when clicking links
const sidebarLinks = document.querySelectorAll('.sidebar-menu a');
sidebarLinks.forEach(link => {
  link.addEventListener('click', () => {
    setTimeout(closeSidebar, 150);
  });
});

// Consistent submit loading state for admin forms
(function () {
  function applySubmitLoading(form, event) {
    setTimeout(() => {
      if (event.defaultPrevented || !form.checkValidity()) return;

      form.querySelectorAll('button[type="submit"], input[type="submit"]').forEach(button => {
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
  }

  function initSubmitLoading() {
    document.querySelectorAll('form').forEach(form => {
      if (form.dataset.submitLoadingReady === 'true') return;
      form.dataset.submitLoadingReady = 'true';
      form.addEventListener('submit', event => applySubmitLoading(form, event));
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSubmitLoading);
  } else {
    initSubmitLoading();
  }
})();

// Auto-dismiss success notifications with smooth fade-out
(function () {
  const AUTO_DISMISS_MS = 4200;
  const CLEANUP_MS = 420;
  const timers = new WeakMap();

  function clearExistingTimer(el) {
    const existingTimer = timers.get(el);
    if (existingTimer) {
      clearTimeout(existingTimer);
      timers.delete(el);
    }
  }

  function removeMessage(el) {
    if (!el || !el.parentNode) return;
    clearExistingTimer(el);
    el.classList.add('hide');
    const cleanupId = setTimeout(() => {
      if (el.parentNode) {
        el.parentNode.removeChild(el);
      }
      timers.delete(el);
    }, CLEANUP_MS);
    timers.set(el, cleanupId);
  }

  function scheduleDismiss(el, timeout = AUTO_DISMISS_MS) {
    clearExistingTimer(el);
    const timerId = setTimeout(() => removeMessage(el), timeout);
    timers.set(el, timerId);
  }

  function initAutoDismissMessages() {
    const successMessages = document.querySelectorAll('.message.success');
    successMessages.forEach(message => {
      if (message.dataset.autoDismiss === 'false') return;
      scheduleDismiss(message);
      message.addEventListener('mouseenter', () => clearExistingTimer(message));
      message.addEventListener('mouseleave', () => scheduleDismiss(message, 2200));
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAutoDismissMessages);
  } else {
    initAutoDismissMessages();
  }
})();

function updateHiddenInput() {
  if (!hourInput || !minuteInput || !ampmSelect || !examTimeInput) return;
  let hour = parseInt(hourInput.value) || 12;
  let minute = parseInt(minuteInput.value) || 0;
  let ampm = ampmSelect.value;

  if (hour < 1) hour = 1;
  if (hour > 12) hour = 12;
  if (minute < 0) minute = 0;
  if (minute > 59) minute = 59;

  examTimeInput.value = `${pad(hour)}:${pad(minute)} ${ampm}`;
}

// Listen to time input changes and update hidden input
if (hourInput) {
  hourInput.addEventListener('input', updateHiddenInput);
  hourInput.addEventListener('blur', () => {
  let val = parseInt(hourInput.value) || 12;
  if (val < 1) val = 1;
  if (val > 12) val = 12;
  hourInput.value = val;
  updateHiddenInput();
  });
}

if (minuteInput) {
  minuteInput.addEventListener('input', updateHiddenInput);
  minuteInput.addEventListener('blur', () => {
  let val = parseInt(minuteInput.value) || 0;
  if (val < 0) val = 0;
  if (val > 59) val = 59;
  minuteInput.value = pad(val);
  updateHiddenInput();
  });
}

if (ampmSelect) ampmSelect.addEventListener('change', updateHiddenInput);

if (hourInput || minuteInput || ampmSelect || examTimeInput) updateHiddenInput(); // initialize hidden input on load

// Day Cards Click Event
document.querySelectorAll('.day-card').forEach(card => {
  card.addEventListener('click', () => {
    const day = card.getAttribute('data-day');
    window.location.href = `/admin/schedules/day/${day}`;
  });
});
