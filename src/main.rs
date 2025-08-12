// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{CustomMenuItem, SystemTray, SystemTrayMenu, SystemTrayEvent};
use tauri::{Manager, Window};
use serde::{Deserialize, Serialize};
use chrono::{DateTime, Local, NaiveDateTime};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize, Clone)]
struct Task {
    id: String,
    title: String,
    description: String,
    completed: bool,
    created_at: DateTime<Local>,
    due_date: Option<NaiveDateTime>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct Schedule {
    id: String,
    title: String,
    description: String,
    start_time: NaiveDateTime,
    end_time: Option<NaiveDateTime>,
    is_reminder: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct Timer {
    id: String,
    name: String,
    duration: u32, // in seconds
    elapsed: u32,
    is_running: bool,
    is_pomodoro: bool,
}

#[derive(Debug, Serialize, Deserialize, Default)]
struct AppState {
    tasks: HashMap<String, Task>,
    schedules: HashMap<String, Schedule>,
    timers: HashMap<String, Timer>,
}

impl AppState {
    fn get_data_dir() -> PathBuf {
        let mut dir = dirs::config_dir().unwrap_or_else(|| PathBuf::from("."));
        dir.push("log-manager");
        if !dir.exists() {
            fs::create_dir_all(&dir).ok();
        }
        dir
    }

    fn get_data_file() -> PathBuf {
        let mut file = Self::get_data_dir();
        file.push("app_data.json");
        file
    }

    fn load() -> Self {
        let data_file = Self::get_data_file();
        if data_file.exists() {
            match fs::read_to_string(&data_file) {
                Ok(content) => {
                    match serde_json::from_str(&content) {
                        Ok(state) => return state,
                        Err(e) => eprintln!("Failed to parse data file: {}", e),
                    }
                }
                Err(e) => eprintln!("Failed to read data file: {}", e),
            }
        }
        AppState::default()
    }

    fn save(&self) {
        let data_file = Self::get_data_file();
        match serde_json::to_string_pretty(self) {
            Ok(content) => {
                if let Err(e) = fs::write(&data_file, content) {
                    eprintln!("Failed to save data file: {}", e);
                }
            }
            Err(e) => eprintln!("Failed to serialize app state: {}", e),
        }
    }
}

// Tauri commands
#[tauri::command]
fn get_app_state(state: tauri::State<std::sync::Mutex<AppState>>) -> AppState {
    state.lock().unwrap().clone()
}

#[tauri::command]
fn add_task(state: tauri::State<std::sync::Mutex<AppState>>, title: String, description: String, due_date: Option<String>) -> Result<Task, String> {
    let mut app_state = state.lock().unwrap();
    let task = Task {
        id: Uuid::new_v4().to_string(),
        title,
        description,
        completed: false,
        created_at: Local::now(),
        due_date: due_date.and_then(|d| NaiveDateTime::parse_from_str(&d, "%Y-%m-%d %H:%M:%S").ok()),
    };
    app_state.tasks.insert(task.id.clone(), task.clone());
    app_state.save();
    Ok(task)
}

#[tauri::command]
fn toggle_task(state: tauri::State<std::sync::Mutex<AppState>>, task_id: String) -> Result<bool, String> {
    let mut app_state = state.lock().unwrap();
    if let Some(task) = app_state.tasks.get_mut(&task_id) {
        task.completed = !task.completed;
        app_state.save();
        Ok(task.completed)
    } else {
        Err("Task not found".to_string())
    }
}

#[tauri::command]
fn add_schedule(state: tauri::State<std::sync::Mutex<AppState>>, title: String, description: String, start_time: String, end_time: Option<String>, is_reminder: bool) -> Result<Schedule, String> {
    let mut app_state = state.lock().unwrap();
    let schedule = Schedule {
        id: Uuid::new_v4().to_string(),
        title,
        description,
        start_time: NaiveDateTime::parse_from_str(&start_time, "%Y-%m-%d %H:%M:%S").map_err(|e| e.to_string())?,
        end_time: end_time.and_then(|t| NaiveDateTime::parse_from_str(&t, "%Y-%m-%d %H:%M:%S").ok()),
        is_reminder,
    };
    app_state.schedules.insert(schedule.id.clone(), schedule.clone());
    app_state.save();
    Ok(schedule)
}

#[tauri::command]
fn start_timer(state: tauri::State<std::sync::Mutex<AppState>>, timer_id: String) -> Result<(), String> {
    let mut app_state = state.lock().unwrap();
    if let Some(timer) = app_state.timers.get_mut(&timer_id) {
        timer.is_running = true;
        app_state.save();
        Ok(())
    } else {
        Err("Timer not found".to_string())
    }
}

#[tauri::command]
fn stop_timer(state: tauri::State<std::sync::Mutex<AppState>>, timer_id: String) -> Result<(), String> {
    let mut app_state = state.lock().unwrap();
    if let Some(timer) = app_state.timers.get_mut(&timer_id) {
        timer.is_running = false;
        app_state.save();
        Ok(())
    } else {
        Err("Timer not found".to_string())
    }
}

#[tauri::command]
fn create_timer(state: tauri::State<std::sync::Mutex<AppState>>, name: String, duration: u32, is_pomodoro: bool) -> Result<Timer, String> {
    let mut app_state = state.lock().unwrap();
    let timer = Timer {
        id: Uuid::new_v4().to_string(),
        name,
        duration,
        elapsed: 0,
        is_running: false,
        is_pomodoro,
    };
    app_state.timers.insert(timer.id.clone(), timer.clone());
    app_state.save();
    Ok(timer)
}

#[tauri::command]
fn delete_task(state: tauri::State<std::sync::Mutex<AppState>>, task_id: String) -> Result<(), String> {
    let mut app_state = state.lock().unwrap();
    if app_state.tasks.remove(&task_id).is_some() {
        app_state.save();
        Ok(())
    } else {
        Err("Task not found".to_string())
    }
}

#[tauri::command]
fn delete_schedule(state: tauri::State<std::sync::Mutex<AppState>>, schedule_id: String) -> Result<(), String> {
    let mut app_state = state.lock().unwrap();
    if app_state.schedules.remove(&schedule_id).is_some() {
        app_state.save();
        Ok(())
    } else {
        Err("Schedule not found".to_string())
    }
}

fn main() {
    let quit = CustomMenuItem::new("quit".to_string(), "退出");
    let hide = CustomMenuItem::new("hide".to_string(), "隐藏");
    let show = CustomMenuItem::new("show".to_string(), "显示");
    let tray_menu = SystemTrayMenu::new()
        .add_item(show)
        .add_item(hide)
        .add_native_item(tauri::SystemTrayMenuItem::Separator)
        .add_item(quit);
    
    let system_tray = SystemTray::new().with_menu(tray_menu);

    tauri::Builder::default()
        .manage(std::sync::Mutex::new(AppState::load()))
        .system_tray(system_tray)
        .on_system_tray_event(|app, event| match event {
            SystemTrayEvent::LeftClick {
                position: _,
                size: _,
                ..
            } => {
                println!("system tray received a left click");
            }
            SystemTrayEvent::RightClick {
                position: _,
                size: _,
                ..
            } => {
                println!("system tray received a right click");
            }
            SystemTrayEvent::DoubleClick {
                position: _,
                size: _,
                ..
            } => {
                println!("system tray received a double click");
            }
            SystemTrayEvent::MenuItemClick { id, .. } => {
                match id.as_str() {
                    "quit" => {
                        std::process::exit(0);
                    }
                    "hide" => {
                        let window = app.get_window("main").unwrap();
                        window.hide().unwrap();
                    }
                    "show" => {
                        let window = app.get_window("main").unwrap();
                        window.show().unwrap();
                    }
                    _ => {}
                }
            }
            _ => {}
        })
        .invoke_handler(tauri::generate_handler![
            get_app_state,
            add_task,
            toggle_task,
            delete_task,
            add_schedule,
            delete_schedule,
            start_timer,
            stop_timer,
            create_timer
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}