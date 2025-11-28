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

// Event Listeners
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

// Close when clicking menu links
const sidebarLinks = document.querySelectorAll('.sidebar-menu a');
sidebarLinks.forEach(link => {
  link.addEventListener('click', () => {
    setTimeout(closeSidebar, 150);
  });

  const hourInput = document.getElementById('hourInput');
const minuteInput = document.getElementById('minuteInput');
const ampmSelect = document.getElementById('ampmSelect');
const examTimeInput = document.getElementById('examTimeInput');

function pad(num) {
  return num.toString().padStart(2, '0');
}

function updateHiddenInput() {
  let hour = parseInt(hourInput.value) || 12;
  let minute = parseInt(minuteInput.value) || 0;
  let ampm = ampmSelect.value;

  if (hour < 1) hour = 1;
  if (hour > 12) hour = 12;
  if (minute < 0) minute = 0;
  if (minute > 59) minute = 59;

  examTimeInput.value = `${pad(hour)}:${pad(minute)} ${ampm}`;
}

hourInput.addEventListener('input', updateHiddenInput);
hourInput.addEventListener('blur', () => {
  let val = parseInt(hourInput.value) || 12;
  if (val < 1) val = 1;
  if (val > 12) val = 12;
  hourInput.value = val;
  updateHiddenInput();
});

minuteInput.addEventListener('input', updateHiddenInput);
minuteInput.addEventListener('blur', () => {
  let val = parseInt(minuteInput.value) || 0;
  if (val < 0) val = 0;
  if (val > 59) val = 59;
  minuteInput.value = pad(val);
  updateHiddenInput();
});

ampmSelect.addEventListener('change', updateHiddenInput);

updateHiddenInput();
});