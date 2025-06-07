// Utility functions
function showSpinner() {
    document.querySelector('.spinner').style.display = 'block';
}

function hideSpinner() {
    document.querySelector('.spinner').style.display = 'none';
}

function showError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'alert alert-error';
    errorDiv.textContent = message;
    document.querySelector('.results').prepend(errorDiv);
    setTimeout(() => errorDiv.remove(), 5000);
}

// JSON Parser
if (document.getElementById('jsonForm')) {
    document.getElementById('jsonForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const input = document.getElementById('jsonInput').value;
        showSpinner();

        try {
            const response = await fetch('/tools/api/json-parser', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ input }),
            });

            const data = await response.json();
            if (!response.ok) throw new Error(data.message || 'Failed to parse JSON');

            document.getElementById('jsonResult').textContent = data.formatted;
            hideSpinner();
        } catch (error) {
            hideSpinner();
            showError(error.message);
        }
    });
}

// Base64 Tool
if (document.getElementById('base64Form')) {
    document.getElementById('base64Form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const input = document.getElementById('base64Input').value;
        const action = document.querySelector('input[name="action"]:checked').value;
        showSpinner();

        try {
            const response = await fetch(`/tools/api/base64/${action}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ input }),
            });

            const data = await response.json();
            if (!response.ok) throw new Error(data.message || 'Base64 operation failed');

            document.getElementById('base64Result').textContent = data.output;
            hideSpinner();
        } catch (error) {
            hideSpinner();
            showError(error.message);
        }
    });
}

// Regex Tester
if (document.getElementById('regexForm')) {
    const updateRegexResults = async () => {
        const pattern = document.getElementById('regexPattern').value;
        const text = document.getElementById('regexText').value;
        
        if (!pattern || !text) return;
        showSpinner();

        try {
            const response = await fetch('/tools/api/regex-tester', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ pattern, text }),
            });

            const data = await response.json();
            if (!response.ok) throw new Error(data.message || 'Regex test failed');

            const resultDiv = document.getElementById('regexResult');
            resultDiv.innerHTML = '';

            if (data.matches.length === 0) {
                resultDiv.textContent = 'No matches found';
            } else {
                data.matches.forEach((match, index) => {
                    const matchDiv = document.createElement('div');
                    matchDiv.className = 'match';
                    matchDiv.innerHTML = `
                        <h4>Match ${index + 1}</h4>
                        <p>Full match: <code>${match.fullMatch}</code></p>
                        ${match.groups.length ? `
                            <p>Groups:</p>
                            <ul>
                                ${match.groups.map(group => `<li><code>${group}</code></li>`).join('')}
                            </ul>
                        ` : ''}
                    `;
                    resultDiv.appendChild(matchDiv);
                });
            }
            hideSpinner();
        } catch (error) {
            hideSpinner();
            showError(error.message);
        }
    };

    let debounceTimeout;
    const debouncedUpdate = () => {
        clearTimeout(debounceTimeout);
        debounceTimeout = setTimeout(updateRegexResults, 500);
    };

    document.getElementById('regexPattern').addEventListener('input', debouncedUpdate);
    document.getElementById('regexText').addEventListener('input', debouncedUpdate);
}

// Cron Parser
if (document.getElementById('cronForm')) {
    document.getElementById('cronForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const expression = document.getElementById('cronExpression').value;
        showSpinner();

        try {
            const response = await fetch('/tools/api/cron-parser', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ expression }),
            });

            const data = await response.json();
            
            // 隐藏所有结果容器
            document.getElementById('cronError').style.display = 'none';
            document.getElementById('cronDescription').style.display = 'none';
            document.getElementById('nextRunsContainer').style.display = 'none';

            if (!data.isValid) {
                const errorDiv = document.getElementById('cronError');
                errorDiv.textContent = data.error;
                errorDiv.style.display = 'block';
            } else {
                // 显示表达式描述
                const descDiv = document.getElementById('cronDescription');
                descDiv.textContent = data.description;
                descDiv.style.display = 'block';

                // 显示未来执行时间
                const nextRunsContainer = document.getElementById('nextRunsContainer');
                const nextRunsList = document.getElementById('nextRuns');
                nextRunsList.innerHTML = '';
                
                data.nextRuns.forEach(run => {
                    const li = document.createElement('li');
                    li.textContent = run.readable;
                    nextRunsList.appendChild(li);
                });

                nextRunsContainer.style.display = 'block';
            }

            hideSpinner();
        } catch (error) {
            hideSpinner();
            showError('解析 Cron 表达式时发生错误');
        }
    });
}

document.addEventListener('DOMContentLoaded', function() {
    // 工具下拉菜单
    const toolsDropdown = document.querySelector('.tools-dropdown');
    const toolsDropdownBtn = document.querySelector('.tools-dropdown-btn');
    const toolsDropdownContent = document.querySelector('.tools-dropdown-content');

    // 点击按钮显示/隐藏下拉菜单
    toolsDropdownBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        toolsDropdown.classList.toggle('active');
    });

    // 点击下拉菜单内容时不关闭
    toolsDropdownContent.addEventListener('click', function(e) {
        e.stopPropagation();
    });

    // 点击页面其他地方关闭下拉菜单
    document.addEventListener('click', function() {
        toolsDropdown.classList.remove('active');
    });

    // 按 ESC 键关闭下拉菜单
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            toolsDropdown.classList.remove('active');
        }
    });

    // 搜索功能
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
    });
}); 