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
const amBtn = document.getElementById('amBtn');
const pmBtn = document.getElementById('pmBtn');
const examTimeInput = document.getElementById('examTimeInput');
const cancelBtn = document.getElementById('cancelBtn');
const okBtn = document.getElementById('okBtn');

let ampm = 'AM';

// Validate and fix input values
function sanitizeHour() {
  let h = parseInt(hourInput.value);
  if (isNaN(h) || h < 1) h = 1;
  else if (h > 12) h = 12;
  hourInput.value = h;
  return h;
}

function sanitizeMinute() {
  let m = parseInt(minuteInput.value);
  if (isNaN(m) || m < 0) m = 0;
  else if (m > 59) m = 59;
  minuteInput.value = m.toString().padStart(2, '0');
  return m;
}

function updateHidden() {
  const h = sanitizeHour();
  const m = sanitizeMinute();
  examTimeInput.value = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')} ${ampm}`;
}

hourInput.addEventListener('change', updateHidden);
minuteInput.addEventListener('change', updateHidden);

amBtn.addEventListener('click', () => {
  ampm = 'AM';
  amBtn.classList.add('active');
  pmBtn.classList.remove('active');
  updateHidden();
});

pmBtn.addEventListener('click', () => {
  ampm = 'PM';
  pmBtn.classList.add('active');
  amBtn.classList.remove('active');
  updateHidden();
});

cancelBtn.addEventListener('click', () => {
  hourInput.value = '12';
  minuteInput.value = '00';
  ampm = 'AM';
  amBtn.classList.add('active');
  pmBtn.classList.remove('active');
  updateHidden();
});

okBtn.addEventListener('click', () => {
  // Optional: you can validate or close popup here
  alert(`Selected time is: ${examTimeInput.value}`);
});

updateHidden();
});