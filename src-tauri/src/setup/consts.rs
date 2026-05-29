pub struct MenuLabels {
    pub about_label: String,
    pub settings_label: String,
    pub edit_label: String,
    pub undo_label: String,
    pub redo_label: String,
    pub cut_label: String,
    pub copy_label: String,
    pub paste_label: String,
    pub select_all_label: String,
    pub close_label: String,
    pub minimize_label: String,
    pub hide_label: String,
    pub hide_others_label: String,
    pub show_all_label: String,
    pub quit_label: String,
}

pub fn menu_labels(use_zh: bool, app_name: &str) -> MenuLabels {
    if use_zh {
        MenuLabels {
            about_label: format!("关于 {app_name}"),
            settings_label: "设置".into(),
            edit_label: "编辑".into(),
            undo_label: "撤销".into(),
            redo_label: "重做".into(),
            cut_label: "剪切".into(),
            copy_label: "复制".into(),
            paste_label: "粘贴".into(),
            select_all_label: "全选".into(),
            close_label: "关闭窗口".into(),
            minimize_label: "最小化窗口".into(),
            hide_label: format!("隐藏 {app_name}"),
            hide_others_label: "隐藏 其他窗口".into(),
            show_all_label: "显示所有窗口".into(),
            quit_label: "退出".into(),
        }
    } else {
        MenuLabels {
            about_label: format!("About {app_name}"),
            settings_label: "Settings".into(),
            edit_label: "Edit".into(),
            undo_label: "Undo".into(),
            redo_label: "Redo".into(),
            cut_label: "Cut".into(),
            copy_label: "Copy".into(),
            paste_label: "Paste".into(),
            select_all_label: "Select All".into(),
            close_label: "Close Window".into(),
            minimize_label: "Minimize Window".into(),
            hide_label: format!("Hide {app_name}"),
            hide_others_label: "Hide Others".into(),
            show_all_label: "Show All".into(),
            quit_label: "Quit".into(),
        }
    }
}
