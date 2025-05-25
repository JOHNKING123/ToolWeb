document.addEventListener('DOMContentLoaded', function() {
    const toolSearch = document.getElementById('toolSearch');
    const toolSearchLarge = document.getElementById('toolSearchLarge');
    const toolCards = document.querySelectorAll('.tool-card');
    const categories = document.querySelectorAll('.category');

    // 同步两个搜索框
    toolSearch.addEventListener('input', function(e) {
        toolSearchLarge.value = e.target.value;
        filterTools(e.target.value);
    });

    toolSearchLarge.addEventListener('input', function(e) {
        toolSearch.value = e.target.value;
        filterTools(e.target.value);
    });

    function filterTools(searchTerm) {
        const term = searchTerm.toLowerCase();

        toolCards.forEach(card => {
            const name = card.querySelector('h3').textContent.toLowerCase();
            const description = card.querySelector('p').textContent.toLowerCase();
            const isMatch = name.includes(term) || description.includes(term);
            card.style.display = isMatch ? '' : 'none';
        });

        // 隐藏空分类
        categories.forEach(category => {
            const visibleTools = category.querySelectorAll('.tool-card[style=""]').length;
            category.style.display = visibleTools > 0 ? '' : 'none';
        });

        // 处理搜索结果为空的情况
        const hasResults = Array.from(toolCards).some(card => card.style.display !== 'none');
        const noResultsMsg = document.getElementById('noResults');
        
        if (!hasResults && searchTerm) {
            if (!noResultsMsg) {
                const msg = document.createElement('div');
                msg.id = 'noResults';
                msg.className = 'no-results';
                msg.innerHTML = `
                    <i class="material-icons">search_off</i>
                    <p>未找到匹配的工具</p>
                    <p class="sub">请尝试使用其他关键词搜索</p>
                `;
                document.querySelector('#all').appendChild(msg);
            }
        } else if (noResultsMsg) {
            noResultsMsg.remove();
        }
    }

    // 添加快捷键支持
    document.addEventListener('keydown', function(e) {
        // 按下 '/' 键时聚焦搜索框
        if (e.key === '/' && !['input', 'textarea'].includes(document.activeElement.tagName.toLowerCase())) {
            e.preventDefault();
            toolSearchLarge.focus();
        }
        // ESC 键清空搜索
        if (e.key === 'Escape') {
            toolSearch.value = '';
            toolSearchLarge.value = '';
            filterTools('');
        }
    });
}); 