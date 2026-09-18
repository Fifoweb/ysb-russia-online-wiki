// Mobile menu toggle
document.addEventListener('DOMContentLoaded', () => {
    const menuBtn = document.querySelector('.mobile-menu-btn');
    const header = document.querySelector('.header');

    if (menuBtn && header) {
        menuBtn.addEventListener('click', () => {
            header.classList.toggle('header--mobile-open');
        });
    }

    // Close menu on nav link click
    document.querySelectorAll('.nav__link').forEach(link => {
        link.addEventListener('click', () => {
            header.classList.remove('header--mobile-open');
        });
    });

    // Form consent checkboxes enable submit button
    const consentCheckboxes = document.querySelectorAll('.consent-item input[type="checkbox"]');
    const submitBtn = document.querySelector('.contact__form button[type="submit"]');

    if (consentCheckboxes.length && submitBtn) {
        function updateSubmitBtn() {
            const allChecked = Array.from(consentCheckboxes).every(cb => cb.checked);
            submitBtn.disabled = !allChecked;
        }
        consentCheckboxes.forEach(cb => cb.addEventListener('change', updateSubmitBtn));
    }

    // Smooth scroll for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            const href = this.getAttribute('href');
            if (href === '#') return;
            const target = document.querySelector(href);
            if (target) {
                e.preventDefault();
                const headerHeight = 72;
                const targetPosition = target.getBoundingClientRect().top + window.pageYOffset - headerHeight;
                window.scrollTo({ top: targetPosition, behavior: 'smooth' });
            }
        });
    });

    // Intersection Observer for fade-in animations
    const observerOptions = { threshold: 0.1, rootMargin: '0px 0px -50px 0px' };
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    // Animate sections on scroll
    const animatableItems = [
        '.build-card', '.build-spec', '.step-item', '.team-card',
        '.review-card', '.social-card', '.gallery__item'
    ];

    animatableItems.forEach(selector => {
        document.querySelectorAll(selector).forEach((el, i) => {
            el.style.opacity = '0';
            el.style.transform = 'translateY(30px)';
            el.style.transition = `opacity 0.6s ease ${i * 0.05}s, transform 0.6s ease ${i * 0.05}s`;
            observer.observe(el);
        });
    });

    // Hero title animation
    const heroTitle = document.querySelector('.hero__title');
    if (heroTitle) {
        heroTitle.style.opacity = '0';
        heroTitle.style.transform = 'translateY(20px)';
        heroTitle.style.transition = 'opacity 0.8s ease, transform 0.8s ease';
        setTimeout(() => {
            heroTitle.style.opacity = '1';
            heroTitle.style.transform = 'translateY(0)';
        }, 200);
    }

    // Gallery hover pause animation
    document.querySelectorAll('.gallery__row').forEach(row => {
        row.addEventListener('mouseenter', () => { row.style.animationPlayState = 'paused'; });
        row.addEventListener('mouseleave', () => { row.style.animationPlayState = 'running'; });
    });

    // Build card FPS tooltip
    document.querySelectorAll('.build-card__fps').forEach(fps => {
        fps.addEventListener('click', () => {
            alert('Средний FPS в популярных играх (CS2, Valorant, PUBG, Cyberpunk 2077) на высоких настройках.');
        });
    });

    // Review filter buttons
    document.querySelectorAll('.reviews__filter').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.reviews__filter').forEach(b => b.classList.remove('reviews__filter--active'));
            btn.classList.add('reviews__filter--active');
        });
    });

    // Console greeting
    console.log('%c Люблю Компы %c Кастомные сборки ПК ',
        'background:#00ff88;color:#000;padding:8px 12px;font-weight:bold;border-radius:4px 0 0 4px;',
        'background:#111;color:#fff;padding:8px 12px;border-radius:0 4px 4px 0;');
    console.log('%cСобери свой идеальный ПК вместе с нами!', 'color:#8b5cf6;font-size:14px;');
});