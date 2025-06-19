document.addEventListener('DOMContentLoaded', function() {
    console.log('[tools-dropdown] DOMContentLoaded');
    const toolsDropdownBtn = document.querySelector('.tools-dropdown-btn');
    const toolsDropdown = document.querySelector('.tools-dropdown');
    
    if (toolsDropdownBtn && toolsDropdown) {
        console.log('[tools-dropdown] 找到下拉按钮和容器');
        toolsDropdownBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            toolsDropdown.classList.toggle('active');
            console.log('[tools-dropdown] 点击按钮，active:', toolsDropdown.classList.contains('active'));
        });
        
        // 点击其他地方关闭下拉菜单
        document.addEventListener('click', function(e) {
            if (!toolsDropdown.contains(e.target)) {
                toolsDropdown.classList.remove('active');
                console.log('[tools-dropdown] 点击页面其他地方，关闭下拉');
            }
        });
    } else {
        console.warn('[tools-dropdown] 没有找到下拉按钮或容器');
    }
}); 