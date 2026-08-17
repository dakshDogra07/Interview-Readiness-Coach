/**
 * result.js — Chart.js initialization, animated counters, and entrance animations
 * for the Interview Analysis dashboard.
 */

document.addEventListener('DOMContentLoaded', function () {
    const data = window.INTERVIEW_DATA;
    if (!data) return;

    // ============================================
    // CHART COLOR PALETTE
    // ============================================
    const CHART_COLORS = [
        '#7C5CFC', // purple
        '#00D4AA', // teal
        '#FFB224', // amber
        '#FF5C72', // coral
        '#3B82F6', // blue
        '#A855F7', // violet
        '#F97316', // orange
    ];

    const CHART_FONT = {
        family: "'Inter', sans-serif",
        size: 12,
        weight: '500',
    };

    const hasChart = typeof Chart !== 'undefined';

    // ============================================
    // BEHAVIORAL RADAR CHART
    // ============================================
    const behavioralCtx = document.getElementById('behavioralChart');
    if (behavioralCtx && hasChart && data.metrics) {
        // Normalize values to 0-100 scale for radar readability
        const maxSession = Math.max(data.metrics.session_length || 1, 1);
        const eyeContact = data.metrics.eye_contact_percentage || 0;
        const lookAways = data.metrics.look_away_count || 0;
        const distractionDur = data.metrics.distraction_duration || 0;
        const sessionLen = data.metrics.session_length || 0;

        const focus = Math.max(0, 100 - (lookAways * 10)); // fewer look-aways = higher focus
        const engagement = Math.max(0, 100 - ((distractionDur / maxSession) * 100));
        const steadiness = Math.min(100, (sessionLen / 30) * 100); // longer session = more steadiness (cap at 30s)

        new Chart(behavioralCtx, {
            type: 'radar',
            data: {
                labels: ['Eye Contact', 'Focus', 'Engagement', 'Steadiness'],
                datasets: [{
                    label: 'Your Performance',
                    data: [eyeContact, focus, engagement, steadiness],
                    backgroundColor: 'rgba(124, 92, 252, 0.15)',
                    borderColor: '#7C5CFC',
                    borderWidth: 2,
                    pointBackgroundColor: '#7C5CFC',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 1,
                    pointRadius: 4,
                    pointHoverRadius: 6,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                },
                scales: {
                    r: {
                        beginAtZero: true,
                        max: 100,
                        ticks: {
                            stepSize: 25,
                            color: '#5A6478',
                            backdropColor: 'transparent',
                            font: { size: 10 },
                        },
                        grid: {
                            color: 'rgba(255, 255, 255, 0.05)',
                        },
                        angleLines: {
                            color: 'rgba(255, 255, 255, 0.08)',
                        },
                        pointLabels: {
                            color: '#8892A5',
                            font: CHART_FONT,
                        },
                    }
                },
                animation: {
                    duration: 1200,
                    easing: 'easeOutQuart',
                },
            }
        });
    }


    // ============================================
    // EMOTION DOUGHNUT CHART
    // ============================================
    const emotionCtx = document.getElementById('emotionChart');
    if (emotionCtx && hasChart && data.emotionPercentages && Object.keys(data.emotionPercentages).length > 0) {
        const emotions = Object.keys(data.emotionPercentages);
        const percentages = Object.values(data.emotionPercentages);

        // Set CSS custom properties for legend dot colors
        const legendItems = document.querySelectorAll('.emotion-legend-item .emotion-dot');
        legendItems.forEach((dot, i) => {
            dot.style.background = CHART_COLORS[i % CHART_COLORS.length];
        });

        new Chart(emotionCtx, {
            type: 'doughnut',
            data: {
                labels: emotions.map(e => e.charAt(0).toUpperCase() + e.slice(1)),
                datasets: [{
                    data: percentages,
                    backgroundColor: CHART_COLORS.slice(0, emotions.length),
                    borderColor: 'rgba(7, 8, 13, 0.8)',
                    borderWidth: 3,
                    hoverBorderColor: 'transparent',
                    hoverOffset: 8,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '65%',
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: 'rgba(18, 22, 36, 0.95)',
                        titleFont: CHART_FONT,
                        bodyFont: CHART_FONT,
                        borderColor: 'rgba(255,255,255,0.1)',
                        borderWidth: 1,
                        padding: 12,
                        cornerRadius: 8,
                        callbacks: {
                            label: function (context) {
                                return ` ${context.label}: ${context.parsed}%`;
                            }
                        }
                    }
                },
                animation: {
                    animateRotate: true,
                    animateScale: true,
                    duration: 1000,
                    easing: 'easeOutQuart',
                },
            }
        });
    }


    // ============================================
    // ANIMATED NUMBER COUNTERS
    // ============================================
    function animateCounter(el, target, duration = 1200) {
        const suffix = el.dataset.suffix || '';
        const isFloat = String(target).includes('.');
        const start = 0;
        const startTime = performance.now();

        function tick(now) {
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / duration, 1);
            // Ease out quart
            const eased = 1 - Math.pow(1 - progress, 4);
            const current = start + (target - start) * eased;

            if (isFloat) {
                el.textContent = current.toFixed(2) + suffix;
            } else {
                el.textContent = Math.round(current) + suffix;
            }

            if (progress < 1) {
                requestAnimationFrame(tick);
            } else {
                // Final exact value
                el.textContent = target + suffix;
            }
        }

        requestAnimationFrame(tick);
    }

    // Use IntersectionObserver to trigger counters when visible
    const counterElements = document.querySelectorAll('.metric-value[data-count]');
    const counterObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const el = entry.target;
                const target = parseFloat(el.dataset.count) || 0;
                animateCounter(el, target);
                counterObserver.unobserve(el);
            }
        });
    }, { threshold: 0.1 });

    counterElements.forEach(el => counterObserver.observe(el));
});

