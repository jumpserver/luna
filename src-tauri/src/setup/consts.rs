pub struct MenuLabels<'a> {
    pub about_label: &'a str,
    pub settings_label: &'a str,
    pub edit_label: &'a str,
    pub undo_label: &'a str,
    pub redo_label: &'a str,
    pub cut_label: &'a str,
    pub copy_label: &'a str,
    pub paste_label: &'a str,
    pub select_all_label: &'a str,
    pub close_label: &'a str,
    pub minimize_label: &'a str,
    pub hide_label: &'a str,
    pub hide_others_label: &'a str,
    pub show_all_label: &'a str,
    pub quit_label: &'a str,
}

pub fn menu_labels(use_zh: bool) -> MenuLabels<'static> {
    if use_zh {
        MenuLabels {
            about_label: "关于 JumpServerClient",
            settings_label: "设置",
            edit_label: "编辑",
            undo_label: "撤销",
            redo_label: "重做",
            cut_label: "剪切",
            copy_label: "复制",
            paste_label: "粘贴",
            select_all_label: "全选",
            close_label: "关闭窗口",
            minimize_label: "最小化窗口",
            hide_label: "隐藏 JumpServerClient",
            hide_others_label: "隐藏 其他窗口",
            show_all_label: "显示所有窗口",
            quit_label: "退出",
        }
    } else {
        MenuLabels {
            about_label: "About JumpServerClient",
            settings_label: "Settings",
            edit_label: "Edit",
            undo_label: "Undo",
            redo_label: "Redo",
            cut_label: "Cut",
            copy_label: "Copy",
            paste_label: "Paste",
            select_all_label: "Select All",
            close_label: "Close Window",
            minimize_label: "Minimize Window",
            hide_label: "Hide JumpServerClient",
            hide_others_label: "Hide Others",
            show_all_label: "Show All",
            quit_label: "Quit",
        }
    }
}
