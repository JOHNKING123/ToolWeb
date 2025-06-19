class Calendar {
    constructor() {
        this.date = new Date();
        this.today = new Date();
        this.holidayCache = {};
        this.init();
    }

    async init() {
        this.bindEvents();
        await this.render();
        this.bindDayClick();
    }

    bindEvents() {
        document.getElementById('prevMonth').addEventListener('click', async () => {
            this.date.setMonth(this.date.getMonth() - 1);
            await this.render();
            this.bindDayClick();
        });
        document.getElementById('nextMonth').addEventListener('click', async () => {
            this.date.setMonth(this.date.getMonth() + 1);
            await this.render();
            this.bindDayClick();
        });
    }

    bindDayClick() {
        document.querySelectorAll('.calendar-day').forEach(day => {
            day.addEventListener('click', async (e) => {
                const dateStr = day.getAttribute('data-date');
                if (!dateStr) return;
                this.showScheduleModal(dateStr);
            });
        });
    }

    getSchedules() {
        try {
            return JSON.parse(localStorage.getItem('calendar_schedules') || '{}');
        } catch (e) { return {}; }
    }
    setSchedules(obj) {
        localStorage.setItem('calendar_schedules', JSON.stringify(obj));
    }
    getDaySchedules(dateStr) {
        const all = this.getSchedules();
        return (all[dateStr] || []).sort((a, b) => (a.start || '').localeCompare(b.start || ''));
    }
    addDaySchedule(dateStr, schedule) {
        const all = this.getSchedules();
        if (!all[dateStr]) all[dateStr] = [];
        all[dateStr].push(schedule);
        this.setSchedules(all);
    }
    removeDaySchedule(dateStr, idx) {
        const all = this.getSchedules();
        if (all[dateStr]) {
            all[dateStr].splice(idx, 1);
            if (all[dateStr].length === 0) delete all[dateStr];
            this.setSchedules(all);
        }
    }
    getDaysWithSchedules() {
        const all = this.getSchedules();
        return new Set(Object.keys(all));
    }

    async render() {
        const year = this.date.getFullYear();
        const month = this.date.getMonth();
        const daysInMonth = this.getDaysInMonth(year, month);
        const firstDay = this.getFirstDayOfMonth(year, month);
        const daysWithSchedules = this.getDaysWithSchedules();

        // 更新月份显示
        const monthNames = ['一月', '二月', '三月', '四月', '五月', '六月', 
                          '七月', '八月', '九月', '十月', '十一月', '十二月'];
        const yearInfo = this.getYearInfo(new Date(year, month, 1));
        const titleElement = document.getElementById('currentMonth');
        titleElement.innerHTML = `
            <div class="calendar-title-main">${year}年 ${monthNames[month]}</div>
            <div class="calendar-title-sub">${yearInfo.gzYear}年 【${yearInfo.animal}年】 ${yearInfo.gzMonth}月</div>
        `;

        // 加载节假日数据
        this.holidays = await this.loadMonthHolidays(year, month);

        // 渲染日历格子
        const calendarDays = document.getElementById('calendarDays');
        calendarDays.innerHTML = '';

        // 上个月的日期
        const prevMonthDays = this.getDaysInMonth(year, month - 1);
        for (let i = firstDay - 1; i >= 0; i--) {
            const day = document.createElement('div');
            const date = new Date(year, month - 1, prevMonthDays - i);
            day.className = 'calendar-day other-month';
            if (this.isWeekend(date)) day.classList.add('weekend');
            const lunarDate = this.getLunarDate(date);
            const dateStr = this.formatDate(date);
            // 日程展示
            const schedules = this.getDaySchedules(dateStr).slice(0, 2);
            const scheduleHtml = schedules.map(s => {
                const timeText = s.start ? `${s.start} ` : '';
                const fullText = timeText + s.text;
                return `<div class="cell-schedule" title="${s.text}">${this.truncateText(fullText, 10)}</div>`;
            }).join('');
            day.innerHTML = `
                <div class="day-number">${prevMonthDays - i}</div>
                <div class="lunar-date">${lunarDate}</div>
                ${scheduleHtml}
                ${daysWithSchedules.has(dateStr) ? '<span class="reminder-dot"></span>' : ''}
            `;
            day.setAttribute('data-date', dateStr);
            calendarDays.appendChild(day);
        }

        // 当前月的日期
        for (let i = 1; i <= daysInMonth; i++) {
            const day = document.createElement('div');
            const currentDate = new Date(year, month, i);
            day.className = 'calendar-day';
            if (this.isToday(currentDate)) day.classList.add('today');
            if (this.isWeekend(currentDate)) day.classList.add('weekend');

            const dateStr = this.formatDate(currentDate);
            const key = dateStr.slice(5); // MM-DD
            let holidayName = '';
            if (this.holidays[key] && this.holidays[key].holiday) {
                day.classList.add('holiday');
                holidayName = this.holidays[key].name;
            }

            const lunarDate = this.getLunarDate(currentDate);
            // 日程展示
            const schedules = this.getDaySchedules(dateStr).slice(0, 2);
            const scheduleHtml = schedules.map(s => {
                const timeText = s.start ? `${s.start} ` : '';
                const fullText = timeText + s.text;
                return `<div class="cell-schedule" title="${s.text}">${this.truncateText(fullText, 10)}</div>`;
            }).join('');
            day.innerHTML = `
                <div class="day-number">${i}</div>
                <div class="lunar-date">${lunarDate}</div>
                ${holidayName ? `<div class="holiday-name">${holidayName}</div>` : ''}
                ${scheduleHtml}
                ${daysWithSchedules.has(dateStr) ? '<span class="reminder-dot"></span>' : ''}
            `;
            day.setAttribute('data-date', dateStr);
            calendarDays.appendChild(day);
        }

        // 下个月的日期
        const remainingDays = 42 - (firstDay + daysInMonth); // 6行7列 = 42
        for (let i = 1; i <= remainingDays; i++) {
            const day = document.createElement('div');
            const date = new Date(year, month + 1, i);
            day.className = 'calendar-day other-month';
            if (this.isWeekend(date)) day.classList.add('weekend');
            const lunarDate = this.getLunarDate(date);
            const dateStr = this.formatDate(date);
            // 日程展示
            const schedules = this.getDaySchedules(dateStr).slice(0, 2);
            const scheduleHtml = schedules.map(s => {
                const timeText = s.start ? `${s.start} ` : '';
                const fullText = timeText + s.text;
                return `<div class="cell-schedule" title="${s.text}">${this.truncateText(fullText, 10)}</div>`;
            }).join('');
            day.innerHTML = `
                <div class="day-number">${i}</div>
                <div class="lunar-date">${lunarDate}</div>
                ${scheduleHtml}
                ${daysWithSchedules.has(dateStr) ? '<span class="reminder-dot"></span>' : ''}
            `;
            day.setAttribute('data-date', dateStr);
            calendarDays.appendChild(day);
        }
        this.bindDayClick();
    }

    truncateText(text, maxLen) {
        if (!text) return '';
        return text.length > maxLen ? text.slice(0, maxLen) + '…' : text;
    }

    showScheduleModal(dateStr) {
        console.log('[scheduleModal] 打开日程弹窗', dateStr);
        let modal = document.getElementById('scheduleModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'scheduleModal';
            modal.className = 'huangli-modal';
            modal.innerHTML = `<div class="huangli-content"><span class="huangli-close">×</span><div class="schedule-body"></div></div>`;
            document.body.appendChild(modal);
        }
        const body = modal.querySelector('.schedule-body');
        const schedules = this.getDaySchedules(dateStr);
        body.innerHTML = `
            <div class="huangli-date">${dateStr}</div>
            <div class="schedule-list">
                ${schedules.length === 0 ? '<div class="reminder-empty">暂无日程</div>' : schedules.map((r,i) => `<div class="schedule-item"><span class="schedule-time">${r.start || ''}${r.end ? ' - ' + r.end : ''}</span><span class="schedule-text">${r.text}</span><span class="schedule-del" data-idx="${i}">🗑️</span></div>`).join('')}
            </div>
            <div class="schedule-add">
                <input type="time" class="schedule-input-start" />
                <span style="margin:0 0.2em;">-</span>
                <input type="time" class="schedule-input-end" />
                <input type="text" class="schedule-input-text" placeholder="日程内容..." maxlength="50" />
                <button class="btn btn-primary schedule-add-btn">添加</button>
            </div>
        `;
        body.querySelector('.schedule-add-btn').onclick = () => {
            const start = body.querySelector('.schedule-input-start').value;
            const end = body.querySelector('.schedule-input-end').value;
            const text = body.querySelector('.schedule-input-text').value.trim();
            console.log('[scheduleModal] 点击添加', {start, end, text});
            if (start && end && text) {
                this.addDaySchedule(dateStr, { start, end, text });
                this.showScheduleModal(dateStr);
                this.render();
            }
        };
        body.querySelectorAll('.schedule-del').forEach(span => {
            span.onclick = () => {
                const idx = +span.getAttribute('data-idx');
                this.removeDaySchedule(dateStr, idx);
                this.showScheduleModal(dateStr);
                this.render();
            };
        });
        const closeBtn = modal.querySelector('.huangli-close');
        if (closeBtn) closeBtn.onclick = (e) => { modal.style.display = 'none'; e.stopPropagation(); };
        modal.onclick = (e) => { if (e.target === modal) modal.style.display = 'none'; };
        const content = modal.querySelector('.huangli-content');
        if (content) content.onclick = (e) => { e.stopPropagation(); };
        modal.style.display = 'flex';
    }

    getDaysInMonth(year, month) {
        return new Date(year, month + 1, 0).getDate();
    }

    getFirstDayOfMonth(year, month) {
        return new Date(year, month, 1).getDay();
    }

    isToday(date) {
        return date.getDate() === this.today.getDate() &&
               date.getMonth() === this.today.getMonth() &&
               date.getFullYear() === this.today.getFullYear();
    }

    isWeekend(date) {
        const day = date.getDay();
        return day === 0 || day === 6;
    }

    formatDate(date) {
        const year = date.getFullYear();
        const month = date.getMonth() + 1;
        const day = date.getDate();
        return `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
    }

    // 农历显示，需引入 solarlunar.min.js
    getLunarDate(date) {
        if (window.solarlunar) {
            const lunar = window.solarlunar.solar2lunar(date.getFullYear(), date.getMonth() + 1, date.getDate());
            return lunar.lunarFestival || lunar.term || lunar.dayCn;
        }
        return '';
    }

    // 获取干支纪年、生肖和干支月
    getYearInfo(date) {
        if (window.solarlunar) {
            const lunar = window.solarlunar.solar2lunar(date.getFullYear(), date.getMonth() + 1, date.getDate());
            return {
                gzYear: lunar.gzYear,   // 干支纪年
                animal: lunar.animal,   // 生肖
                gzMonth: lunar.gzMonth  // 干支月
            };
        }
        return { gzYear: '', animal: '', gzMonth: '' };
    }

    async loadMonthHolidays(year, month) {
        const key = `${year}-${String(month + 1).padStart(2, '0')}`;
        if (this.holidayCache[key]) return this.holidayCache[key];
        try {
            const resp = await fetch(`https://timor.tech/api/holiday/year/${year}-${String(month + 1).padStart(2, '0')}`);
            const data = await resp.json();
            this.holidayCache[key] = data.holiday || {};
            return this.holidayCache[key];
        } catch (e) {
            this.holidayCache[key] = {};
            return {};
        }
    }
}

// 初始化日历
document.addEventListener('DOMContentLoaded', () => {
    new Calendar();
}); 