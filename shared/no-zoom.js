// iOS Safari は user-scalable=no も touch-action も無視して、連打をダブルタップ・2本指をピンチとみなして拡大することがあるため、イベント側で拡大を止める
{
    const DOUBLE_TAP_MS = 350;
    const TAP_SLOP_PX = 10;
    let lastTouchEnd = 0;
    let start = null;

    document.addEventListener(
        'touchstart',
        (e) => {
            const t = e.changedTouches[0];
            start = { x: t.screenX, y: t.screenY };
        },
        { passive: true },
    );

    document.addEventListener(
        'touchend',
        (e) => {
            const now = e.timeStamp;
            if (now - lastTouchEnd < DOUBLE_TAP_MS) {
                e.preventDefault();
                // preventDefault だけで済ませないのは、消えた click を補わないと、まるばつのマス目など click で動くボタンが連打の2回目に反応しなくなるため
                const t = e.changedTouches[0];
                const tapped = start && Math.hypot(t.screenX - start.x, t.screenY - start.y) < TAP_SLOP_PX;
                const button = e.target instanceof Element ? e.target.closest('button') : null;
                if (tapped && button) button.click();
            }
            lastTouchEnd = now;
        },
        { passive: false },
    );

    document.addEventListener(
        'touchmove',
        (e) => {
            if (e.touches.length > 1) e.preventDefault();
        },
        { passive: false },
    );

    for (const type of ['gesturestart', 'gesturechange', 'dblclick']) {
        document.addEventListener(type, (e) => e.preventDefault(), { passive: false });
    }

    document.addEventListener(
        'wheel',
        (e) => {
            if (e.ctrlKey) e.preventDefault();
        },
        { passive: false },
    );
}
