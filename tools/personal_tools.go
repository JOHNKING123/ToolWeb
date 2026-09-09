package tools

// PersonalTool describes a tool displayed in the authenticated personal area.
type PersonalTool struct {
	Name        string
	Description string
	Path        string
	Icon        string
	Available   bool
}

// GetPersonalTools returns tools available from the personal tools hub.
func GetPersonalTools() []PersonalTool {
	return []PersonalTool{
		{
			Name:        "个人文件管理",
			Description: "管理个人文件，支持目录、上传、下载、图片预览和分享链接。",
			Path:        "/tools/personal/files",
			Icon:        "folder_managed",
			Available:   true,
		},
		{Name: "手机电脑互传", Description: "手机扫码免登录，临时授权双向收发文件。", Path: "/tools/personal/transfer", Icon: "devices", Available: true},
		{Name: "个人剪贴板", Description: "跨设备保存文字和链接，搜索、复制与管理历史内容。", Path: "/tools/personal/clipboard", Icon: "content_paste", Available: true},
	}
}
