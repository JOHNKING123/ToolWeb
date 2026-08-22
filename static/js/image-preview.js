(function() {
    const modal = document.getElementById('imagePreviewModal');
    if (!modal) return;

    const stage = document.getElementById('imagePreviewStage');
    const img = document.getElementById('imagePreviewImg');
    let scale = 1;
    let panX = 0;
    let panY = 0;
    let dragging = false;
    let dragStartX = 0;
    let dragStartY = 0;

    function applyTransform() {
        img.style.transform = 'translate(' + panX + 'px, ' + panY + 'px) scale(' + scale + ')';
        document.getElementById('imagePreviewZoomText').textContent = Math.round(scale * 100) + '%';
    }

    function clampPan() {
        const maxX = Math.max(0, (img.offsetWidth * scale - stage.clientWidth) / 2);
        const maxY = Math.max(0, (img.offsetHeight * scale - stage.clientHeight) / 2);
        panX = Math.max(-maxX, Math.min(maxX, panX));
        panY = Math.max(-maxY, Math.min(maxY, panY));
    }

    function zoom(factor) {
        scale = Math.min(8, Math.max(0.25, scale * factor));
        clampPan();
        applyTransform();
    }

    function openImagePreview(thumb) {
        scale = 1;
        panX = 0;
        panY = 0;
        img.src = thumb.currentSrc || thumb.src;
        img.alt = thumb.alt || '';
        document.getElementById('imagePreviewMeta').textContent = img.alt;
        applyTransform();
        modal.classList.add('open');
        modal.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
    }

    function closeImagePreview() {
        modal.classList.remove('open');
        modal.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
        img.removeAttribute('src');
    }

    document.addEventListener('click', function(e) {
        if (!e.target.closest) return;
        const thumb = e.target.closest('.image-preview-open');
        if (thumb) openImagePreview(thumb);
    });

    document.getElementById('imagePreviewZoomIn').addEventListener('click', function() {
        zoom(1.25);
    });
    document.getElementById('imagePreviewZoomOut').addEventListener('click', function() {
        zoom(0.8);
    });
    document.getElementById('imagePreviewReset').addEventListener('click', function() {
        scale = 1;
        panX = 0;
        panY = 0;
        applyTransform();
    });
    document.getElementById('imagePreviewClose').addEventListener('click', closeImagePreview);

    stage.addEventListener('dblclick', function() {
        zoom(2);
    });
    stage.addEventListener('wheel', function(e) {
        e.preventDefault();
        zoom(e.deltaY < 0 ? 1.1 : 0.9);
    }, { passive: false });
    stage.addEventListener('pointerdown', function(e) {
        if (e.button !== 0 && e.pointerType === 'mouse') return;
        dragging = true;
        dragStartX = e.clientX - panX;
        dragStartY = e.clientY - panY;
        stage.classList.add('dragging');
        stage.setPointerCapture(e.pointerId);
    });
    stage.addEventListener('pointermove', function(e) {
        if (!dragging) return;
        panX = e.clientX - dragStartX;
        panY = e.clientY - dragStartY;
        applyTransform();
    });
    stage.addEventListener('pointerup', function() {
        dragging = false;
        stage.classList.remove('dragging');
        clampPan();
        applyTransform();
    });
    stage.addEventListener('pointercancel', function() {
        dragging = false;
        stage.classList.remove('dragging');
    });
    modal.addEventListener('click', function(e) {
        if (e.target === modal || e.target === stage) closeImagePreview();
    });
    window.addEventListener('resize', function() {
        clampPan();
        applyTransform();
    });
    document.addEventListener('keydown', function(e) {
        if (!modal.classList.contains('open')) return;
        if (e.key === 'Escape') {
            closeImagePreview();
        } else if (e.key === '+' || e.key === '=') {
            zoom(1.25);
        } else if (e.key === '-') {
            zoom(0.8);
        } else if (e.key === '0') {
            scale = 1;
            panX = 0;
            panY = 0;
            applyTransform();
        }
    });

    window.clearImageUploadPreview = function(wrapId) {
        const wrap = typeof wrapId === 'string' ? document.getElementById(wrapId) : wrapId;
        if (!wrap) return;
        if (wrap._previewUrl) {
            URL.revokeObjectURL(wrap._previewUrl);
            wrap._previewUrl = '';
        }
        wrap.style.display = 'none';
        const previewImg = document.getElementById(wrap.dataset.previewImage);
        if (previewImg) previewImg.removeAttribute('src');
        const sizeEl = document.getElementById(wrap.dataset.previewSize);
        if (sizeEl) sizeEl.textContent = '';
    };

    window.initImageUploadPreview = function(wrapId) {
        const wrap = typeof wrapId === 'string' ? document.getElementById(wrapId) : wrapId;
        if (!wrap || wrap._init) return;
        const input = document.getElementById(wrap.dataset.uploadPreview);
        const previewImg = document.getElementById(wrap.dataset.previewImage);
        if (!input || !previewImg) return;
        wrap._init = true;
        input.addEventListener('change', function() {
            window.clearImageUploadPreview(wrap);
            const file = input.files && input.files[0];
            if (!file) return;
            const objectUrl = URL.createObjectURL(file);
            const image = new Image();
            image.onload = function() {
                wrap._previewUrl = objectUrl;
                previewImg.src = objectUrl;
                wrap.style.display = '';
                const sizeEl = document.getElementById(wrap.dataset.previewSize);
                if (sizeEl) sizeEl.textContent = image.naturalWidth + ' x ' + image.naturalHeight + ' px';
            };
            image.onerror = function() {
                URL.revokeObjectURL(objectUrl);
                alert('无法读取图片尺寸，请更换图片后重试');
            };
            image.src = objectUrl;
        });
    };

    document.querySelectorAll('[data-upload-preview]').forEach(function(wrap) {
        window.initImageUploadPreview(wrap);
    });
})();
