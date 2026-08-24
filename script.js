// ===== PARALLAX & NAVBAR SCROLL =====
window.addEventListener('scroll', () => {
  const navbar = document.getElementById('navbar');
  if (navbar) {
    navbar.classList.toggle('scrolled', window.scrollY > 50);
  }

  const heroBg = document.getElementById('heroBg');
  if (heroBg) {
    heroBg.style.transform = `translateY(${window.scrollY * 0.25}px)`;
  }
});

// ===== DOM INITIALIZATION =====
document.addEventListener('DOMContentLoaded', () => {

  // ===== MOBILE MENU TOGGLE =====
  const navToggle = document.getElementById('navToggle');
  const mobileMenu = document.getElementById('mobileMenu');
  const mobileScrim = document.getElementById('mobileScrim');

  function toggleMenu() {
    if (navToggle && mobileMenu && mobileScrim) {
      const isActive = navToggle.classList.toggle('active');
      mobileMenu.classList.toggle('active', isActive);
      mobileScrim.classList.toggle('active', isActive);
    }
  }

  if (navToggle) navToggle.addEventListener('click', toggleMenu);
  if (mobileScrim) mobileScrim.addEventListener('click', toggleMenu);

  if (mobileMenu) {
    mobileMenu.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        if (navToggle) navToggle.classList.remove('active');
        mobileMenu.classList.remove('active');
        if (mobileScrim) mobileScrim.classList.remove('active');
      });
    });
  }

  // ===== FAQ ACCORDION =====
  document.querySelectorAll('.faq-q').forEach(button => {
    button.addEventListener('click', () => {
      const parentItem = button.closest('.faq-item');
      if (parentItem) {
        const isActive = parentItem.classList.contains('active');
        document.querySelectorAll('.faq-item').forEach(item => item.classList.remove('active'));
        if (!isActive) {
          parentItem.classList.add('active');
        }
      }
    });
  });

  // ===== SCROLL REVEAL =====
  const revealElements = document.querySelectorAll('.reveal, .reveal-scale');
  if (revealElements.length > 0) {
    const revealObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1 });

    revealElements.forEach(el => revealObserver.observe(el));
  }

  // ===== HERO COUNTERS ANIMATION =====
  const statsElements = document.querySelectorAll('.hero-stat-value[data-count]');
  if (statsElements.length > 0) {
    const animateCounters = () => {
      statsElements.forEach(el => {
        const target = parseInt(el.dataset.count, 10);
        const suffix = el.dataset.suffix || '';
        const duration = 2000;
        const startTime = performance.now();

        const updateCounter = (now) => {
          const elapsed = now - startTime;
          const progress = Math.min(elapsed / duration, 1);
          const eased = 1 - Math.pow(1 - progress, 3);
          const current = Math.round(eased * target);
          el.textContent = current + suffix;

          if (progress < 1) {
            requestAnimationFrame(updateCounter);
          }
        };

        requestAnimationFrame(updateCounter);
      });
    };

    const statsContainer = document.querySelector('.hero-stats');
    if (statsContainer) {
      const statsObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            animateCounters();
            statsObserver.unobserve(entry.target);
          }
        });
      }, { threshold: 0.3 });

      statsObserver.observe(statsContainer);
    } else {
      animateCounters();
    }
  }

});
