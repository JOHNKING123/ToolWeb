document.addEventListener('DOMContentLoaded', function() {
    const toolsDropdownBtn = document.querySelector('.tools-dropdown-btn');
    const toolsDropdown = document.querySelector('.tools-dropdown');
    
    if (toolsDropdownBtn && toolsDropdown) {
        toolsDropdownBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            toolsDropdown.classList.toggle('active');
        });
        
        // 点击其他地方关闭下拉菜单
        document.addEventListener('click', function(e) {
            if (!toolsDropdown.contains(e.target)) {
                toolsDropdown.classList.remove('active');
            }
        });
    }
}); 