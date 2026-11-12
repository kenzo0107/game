// iOS Safari は画面の向きを固定できないため、縦持ちのタッチ端末では body ごと 90 度回して横向きで表示する。
// 各ゲームの座標計算をすべて書き換える代わりに、画面サイズ・タッチ座標・要素の位置を回転後の値に読み替えて返す
{
    const portrait = matchMedia('(orientation: portrait) and (pointer: coarse)');
    const rotated = () => portrait.matches;

    const style = document.createElement('style');
    style.textContent = `
@media (orientation: portrait) and (pointer: coarse) {
    :root > body {
        position: fixed;
        top: 0;
        left: 0;
        width: 100dvh;
        height: 100dvw;
        margin: 0;
        overflow: hidden;
        transform-origin: top left;
        transform: rotate(90deg) translateY(-100%);
    }
}`;
    document.head.append(style);

    const getter = (target, name) =>
        (Object.getOwnPropertyDescriptor(target, name) ?? Object.getOwnPropertyDescriptor(Object.getPrototypeOf(target), name)).get;
    const physicalWidth = getter(window, 'innerWidth').bind(window);
    const physicalHeight = getter(window, 'innerHeight').bind(window);

    Object.defineProperty(window, 'innerWidth', { configurable: true, get: () => (rotated() ? physicalHeight() : physicalWidth()) });
    Object.defineProperty(window, 'innerHeight', { configurable: true, get: () => (rotated() ? physicalWidth() : physicalHeight()) });

    for (const proto of [MouseEvent.prototype, window.Touch?.prototype].filter(Boolean)) {
        const clientX = getter(proto, 'clientX');
        const clientY = getter(proto, 'clientY');
        Object.defineProperty(proto, 'clientX', {
            configurable: true,
            get() { return rotated() ? clientY.call(this) : clientX.call(this); },
        });
        Object.defineProperty(proto, 'clientY', {
            configurable: true,
            get() { return rotated() ? physicalWidth() - clientX.call(this) : clientY.call(this); },
        });
    }

    const getBoundingClientRect = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function () {
        const r = getBoundingClientRect.call(this);
        return rotated() ? new DOMRect(r.top, physicalWidth() - r.right, r.height, r.width) : r;
    };
}
