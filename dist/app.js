const { invoke } = window.__TAURI__.tauri;
const { appWindow } = window.__TAURI__.window;

// 应用状态
let appState = {
    tasks: {},
    schedules: {},
    timers: {},
    currentTimer: null,
    currentPomodoro: null
};

// 计时器状态
let timerInterval = null;
let pomodoroInterval = null;
let currentTimerData = { minutes: 0, seconds: 0, running: false };
let currentPomodoroData = { 
    minutes: 25, 
    seconds: 0, 
    running: false, 
    isBreak: false,
    workTime: 25 * 60,
    breakTime: 5 * 60
};

// DOM 元素
const tabBtns = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

// 初始化
document.addEventListener('DOMContentLoaded', async () => {
    initializeTabs();
    initializeWindowControls();
    initializeTaskHandlers();
    initializeScheduleHandlers();
    initializeTimerHandlers();
    
    // 加载应用状态
    try {
        appState = await invoke('get_app_state');
        renderTasks();
        renderSchedules();
        updateCountdowns();
    } catch (error) {
        console.error('Failed to load app state:', error);
    }

    // 定时更新倒计时
    setInterval(updateCountdowns, 1000);
});

// 标签页切换
function initializeTabs() {
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.dataset.tab;
            switchTab(tabId);
        });
    });
}

function switchTab(tabId) {
    tabBtns.forEach(btn => btn.classList.remove('active'));
    tabContents.forEach(content => content.classList.remove('active'));
    
    document.querySelector(`[data-tab="${tabId}"]`).classList.add('active');
    document.getElementById(tabId).classList.add('active');
}

// 窗口控制
function initializeWindowControls() {
    document.getElementById('minimize-btn').addEventListener('click', () => {
        appWindow.minimize();
    });

    document.getElementById('close-btn').addEventListener('click', () => {
        appWindow.hide();
    });
}

// 任务管理
function initializeTaskHandlers() {
    const taskInput = document.getElementById('task-input');
    const addTaskBtn = document.getElementById('add-task-btn');

    addTaskBtn.addEventListener('click', addTask);
    taskInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            addTask();
        }
    });
}

async function addTask() {
    const taskInput = document.getElementById('task-input');
    const title = taskInput.value.trim();
    
    if (!title) return;

    try {
        const task = await invoke('add_task', { title, description: '', dueDate: null });
        appState.tasks[task.id] = task;
        taskInput.value = '';
        renderTasks();
    } catch (error) {
        console.error('Failed to add task:', error);
    }
}

async function toggleTask(taskId) {
    try {
        const completed = await invoke('toggle_task', { taskId });
        appState.tasks[taskId].completed = completed;
        renderTasks();
    } catch (error) {
        console.error('Failed to toggle task:', error);
    }
}

function renderTasks() {
    const taskList = document.getElementById('task-list');
    taskList.innerHTML = '';

    Object.values(appState.tasks).forEach(task => {
        const taskItem = document.createElement('div');
        taskItem.className = 'task-item';
        taskItem.innerHTML = `
            <input type="checkbox" class="task-checkbox" ${task.completed ? 'checked' : ''} 
                   onchange="toggleTask('${task.id}')">
            <span class="task-text ${task.completed ? 'completed' : ''}">${task.title}</span>
            <button class="task-delete" onclick="deleteTask('${task.id}')">×</button>
        `;
        taskList.appendChild(taskItem);
    });
}

async function deleteTask(taskId) {
    try {
        await invoke('delete_task', { taskId });
        delete appState.tasks[taskId];
        renderTasks();
    } catch (error) {
        console.error('Failed to delete task:', error);
    }
}

// 日程管理
function initializeScheduleHandlers() {
    const scheduleInput = document.getElementById('schedule-input');
    const scheduleTime = document.getElementById('schedule-time');
    const addScheduleBtn = document.getElementById('add-schedule-btn');

    addScheduleBtn.addEventListener('click', addSchedule);
    scheduleInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            addSchedule();
        }
    });
}

async function addSchedule() {
    const scheduleInput = document.getElementById('schedule-input');
    const scheduleTime = document.getElementById('schedule-time');
    const title = scheduleInput.value.trim();
    const startTime = scheduleTime.value;

    if (!title || !startTime) return;

    try {
        // 转换时间格式
        const dateTime = new Date(startTime);
        const formattedTime = dateTime.toISOString().slice(0, 19).replace('T', ' ');
        
        const schedule = await invoke('add_schedule', { 
            title, 
            description: '', 
            startTime: formattedTime, 
            endTime: null, 
            isReminder: true 
        });
        
        appState.schedules[schedule.id] = schedule;
        scheduleInput.value = '';
        scheduleTime.value = '';
        renderSchedules();
    } catch (error) {
        console.error('Failed to add schedule:', error);
    }
}

function renderSchedules() {
    const scheduleList = document.getElementById('schedule-list');
    scheduleList.innerHTML = '';

    Object.values(appState.schedules).forEach(schedule => {
        const scheduleItem = document.createElement('div');
        scheduleItem.className = 'schedule-item';
        
        const startTime = new Date(schedule.start_time);
        const timeStr = startTime.toLocaleString('zh-CN');
        
        scheduleItem.innerHTML = `
            <div>
                <div class="task-text">${schedule.title}</div>
                <small style="color: #666;">${timeStr}</small>
            </div>
            <button class="task-delete" onclick="deleteSchedule('${schedule.id}')">×</button>
        `;
        scheduleList.appendChild(scheduleItem);
    });
}

async function deleteSchedule(scheduleId) {
    try {
        await invoke('delete_schedule', { scheduleId });
        delete appState.schedules[scheduleId];
        renderSchedules();
    } catch (error) {
        console.error('Failed to delete schedule:', error);
    }
}

// 倒计时更新
function updateCountdowns() {
    const countdownList = document.getElementById('countdown-list');
    countdownList.innerHTML = '';

    // 添加一些示例倒计时
    const importantDates = [
        { title: '🎂 生日', date: new Date('2024-12-25') },
        { title: '🎄 圣诞节', date: new Date('2024-12-25') },
        { title: '🎊 新年', date: new Date('2025-01-01') }
    ];

    importantDates.forEach(item => {
        const now = new Date();
        const timeDiff = item.date.getTime() - now.getTime();
        
        if (timeDiff > 0) {
            const days = Math.floor(timeDiff / (1000 * 60 * 60 * 24));
            const hours = Math.floor((timeDiff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            
            const countdownItem = document.createElement('div');
            countdownItem.className = 'countdown-item';
            countdownItem.innerHTML = `
                <div class="countdown-title">${item.title}</div>
                <div class="countdown-time">${days}天 ${hours}小时</div>
            `;
            countdownList.appendChild(countdownItem);
        }
    });
}

// 计时器功能
function initializeTimerHandlers() {
    // 普通计时器
    document.getElementById('start-timer').addEventListener('click', startTimer);
    document.getElementById('pause-timer').addEventListener('click', pauseTimer);
    document.getElementById('reset-timer').addEventListener('click', resetTimer);

    // 番茄钟
    document.getElementById('start-pomodoro').addEventListener('click', startPomodoro);
    document.getElementById('pause-pomodoro').addEventListener('click', pausePomodoro);
    document.getElementById('reset-pomodoro').addEventListener('click', resetPomodoro);
}

function startTimer() {
    const minutesInput = document.getElementById('timer-minutes');
    const minutes = parseInt(minutesInput.value) || 10;
    
    if (!currentTimerData.running) {
        if (currentTimerData.minutes === 0 && currentTimerData.seconds === 0) {
            currentTimerData.minutes = minutes;
            currentTimerData.seconds = 0;
        }
        
        currentTimerData.running = true;
        timerInterval = setInterval(updateTimer, 1000);
        
        document.getElementById('start-timer').textContent = '运行中...';
        document.getElementById('start-timer').disabled = true;
    }
}

function pauseTimer() {
    currentTimerData.running = false;
    clearInterval(timerInterval);
    
    document.getElementById('start-timer').textContent = '继续';
    document.getElementById('start-timer').disabled = false;
}

function resetTimer() {
    currentTimerData.running = false;
    currentTimerData.minutes = 0;
    currentTimerData.seconds = 0;
    clearInterval(timerInterval);
    
    document.getElementById('timer-display').textContent = '00:00';
    document.getElementById('start-timer').textContent = '开始';
    document.getElementById('start-timer').disabled = false;
}

function updateTimer() {
    if (currentTimerData.minutes === 0 && currentTimerData.seconds === 0) {
        // 时间到了
        resetTimer();
        alert('⏰ 计时结束！');
        return;
    }
    
    if (currentTimerData.seconds === 0) {
        currentTimerData.minutes--;
        currentTimerData.seconds = 59;
    } else {
        currentTimerData.seconds--;
    }
    
    const display = `${currentTimerData.minutes.toString().padStart(2, '0')}:${currentTimerData.seconds.toString().padStart(2, '0')}`;
    document.getElementById('timer-display').textContent = display;
}

// 番茄钟功能
function startPomodoro() {
    if (!currentPomodoroData.running) {
        currentPomodoroData.running = true;
        pomodoroInterval = setInterval(updatePomodoro, 1000);
        
        document.getElementById('start-pomodoro').textContent = currentPomodoroData.isBreak ? '休息中...' : '专注中...';
        document.getElementById('start-pomodoro').disabled = true;
    }
}

function pausePomodoro() {
    currentPomodoroData.running = false;
    clearInterval(pomodoroInterval);
    
    document.getElementById('start-pomodoro').textContent = '继续';
    document.getElementById('start-pomodoro').disabled = false;
}

function resetPomodoro() {
    currentPomodoroData.running = false;
    currentPomodoroData.isBreak = false;
    currentPomodoroData.minutes = 25;
    currentPomodoroData.seconds = 0;
    clearInterval(pomodoroInterval);
    
    document.getElementById('pomodoro-display').textContent = '25:00';
    document.getElementById('start-pomodoro').textContent = '开始专注';
    document.getElementById('start-pomodoro').disabled = false;
}

function updatePomodoro() {
    if (currentPomodoroData.minutes === 0 && currentPomodoroData.seconds === 0) {
        // 当前阶段结束
        if (currentPomodoroData.isBreak) {
            // 休息结束，开始工作
            currentPomodoroData.isBreak = false;
            currentPomodoroData.minutes = 25;
            currentPomodoroData.seconds = 0;
            alert('🍅 休息结束！开始新的专注时间。');
            document.getElementById('start-pomodoro').textContent = '开始专注';
        } else {
            // 工作结束，开始休息
            currentPomodoroData.isBreak = true;
            currentPomodoroData.minutes = 5;
            currentPomodoroData.seconds = 0;
            alert('🎉 专注时间结束！开始休息。');
            document.getElementById('start-pomodoro').textContent = '开始休息';
        }
        
        currentPomodoroData.running = false;
        clearInterval(pomodoroInterval);
        document.getElementById('start-pomodoro').disabled = false;
        return;
    }
    
    if (currentPomodoroData.seconds === 0) {
        currentPomodoroData.minutes--;
        currentPomodoroData.seconds = 59;
    } else {
        currentPomodoroData.seconds--;
    }
    
    const display = `${currentPomodoroData.minutes.toString().padStart(2, '0')}:${currentPomodoroData.seconds.toString().padStart(2, '0')}`;
    document.getElementById('pomodoro-display').textContent = display;
}

// 全局函数声明（用于 HTML onclick 事件）
window.toggleTask = toggleTask;
window.deleteTask = deleteTask;
window.deleteSchedule = deleteSchedule;