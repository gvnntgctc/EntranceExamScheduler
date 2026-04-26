/**
 * Weekly Schedule Page JavaScript
 * Handles day card interactions and navigation
 */

document.addEventListener('DOMContentLoaded', () => {
  initializeDayCards();
});

/**
 * Initialize day card event listeners and interactions
 */
function initializeDayCards() {
  const dayCards = document.querySelectorAll('.day-card');
  
  dayCards.forEach(card => {
    // Get day name and count
    const dayName = card.getAttribute('data-day');
    const countElement = card.querySelector('.student-count');
    const count = countElement ? parseInt(countElement.textContent) : 0;
    
    // Add smooth transition on click
    card.addEventListener('click', (e) => {
      navigateToDaySchedule(dayName, e);
    });
    
    // Add keyboard support (Enter key)
    card.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' || e.code === 'Space') {
        e.preventDefault();
        navigateToDaySchedule(dayName, e);
      }
    });
    
    // Make cards focusable for accessibility
    if (!card.hasAttribute('tabindex')) {
      card.setAttribute('tabindex', '0');
      card.setAttribute('role', 'button');
      card.setAttribute('aria-label', `${dayName}: ${count} students scheduled`);
    }
    
    // Add visual feedback on hover/focus
    card.addEventListener('mouseenter', () => {
      addCardFeedback(card);
    });
    
    card.addEventListener('focus', () => {
      addCardFeedback(card);
    });
    
    card.addEventListener('mouseleave', () => {
      removeCardFeedback(card);
    });
    
    card.addEventListener('blur', () => {
      removeCardFeedback(card);
    });
  });
}

/**
 * Navigate to day schedule with smooth transition
 * @param {string} dayName - The name of the day
 * @param {Event} event - The click/keyboard event
 */
function navigateToDaySchedule(dayName, event) {
  const url = `/admin/schedules/day/${dayName}`;
  
  // Navigate immediately for better UX
  window.location.href = url;
}

/**
 * Add visual feedback to card on interaction
 * @param {HTMLElement} card - The day card element
 */
function addCardFeedback(card) {
  card.classList.add('card-active');
  card.style.cursor = 'pointer';
}

/**
 * Remove visual feedback from card
 * @param {HTMLElement} card - The day card element
 */
function removeCardFeedback(card) {
  card.classList.remove('card-active');
}

/**
 * Filter day cards by search term (if needed in future)
 * @param {string} searchTerm - The search term to filter by
 */
function filterDayCards(searchTerm) {
  const dayCards = document.querySelectorAll('.day-card');
  const term = searchTerm.toLowerCase();
  
  dayCards.forEach(card => {
    const dayName = card.getAttribute('data-day').toLowerCase();
    const isMatch = dayName.includes(term);
    
    card.style.display = isMatch ? 'flex' : 'none';
  });
}

/**
 * Get summary of all scheduled students across the week
 * @returns {Object} Summary with total count and breakdown by day
 */
function getWeekSummary() {
  const dayCards = document.querySelectorAll('.day-card');
  let totalStudents = 0;
  const summary = {};
  
  dayCards.forEach(card => {
    const dayName = card.getAttribute('data-day');
    const countElement = card.querySelector('.student-count');
    const count = countElement ? parseInt(countElement.textContent) : 0;
    
    summary[dayName] = count;
    totalStudents += count;
  });
  
  return {
    total: totalStudents,
    breakdown: summary
  };
}

/**
 * Export week summary for logging/analytics
 */
function exportWeekSummary() {
  const summary = getWeekSummary();
  console.log('Week Summary:', summary);
  return summary;
}
