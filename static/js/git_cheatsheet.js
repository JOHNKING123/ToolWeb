/* Git 命令速查＋灾难救援卡（git_cheatsheet）纯前端核心逻辑
 * 纯函数经 module.exports 暴露，node tests/git_cheatsheet.test.js 自测；
 * 浏览器端：window.GitCheatsheet 全局 + DOM 装配（本文件末尾）。
 *
 * 数据说明（规格见 BACKLOG 2026-11-05 今日任务条目）：
 * - 静态数组 COMMANDS，共 78 条（配置×7、基础×8、分支×9、暂存×7、撤销×8、
 *   远程×9、日志×8、标签×7、工作区×7、高级×8），十类分类；
 * - 每条六字段：id（唯一）、name（命令名）、syntax（规范语法，含占位符）、
 *   desc（中文说明）、example（可直接运行的使用示例）、category（十类之一）；
 * - 静态数组 RESCUE_SCENARIOS，共 10 张灾难救援卡（误删分支／push 错分支／
 *   撤销已 push commit／误删未 push 分支／误删 stash／rebase 翻车／merge 冲突
 *   救场／丢弃本地修改救回／远程分支被删／detached HEAD）；
 * - 每卡五字段：id、title（灾难名）、symptom（症状）、diagnosis（诊断）、
 *   steps（分步救援命令，每步 {cmd, note, dangerous}，cmd 为空表示纯文字步骤）、
 *   prevention（预防提示）；dangerous 为真的步骤为危险操作（reset --hard／
 *   push --force 系），页面标红警示。
 * - 零 fetch/XHR：纯静态数据，页面不发起任何后端请求。
 * - 失败约定：非法参数抛 Error，err.field 给出字段名，不静默钳制。
 */
(function () {
"use strict";

/* 抛错：err.field 给出字段名。 */
function fail(field, msg) {
    var e = new Error(msg);
    e.field = field;
    throw e;
}

/* ================= 0. 十类分类 ================= */

var CATEGORY_LABELS = {
    "config": "配置",
    "basic": "基础",
    "branch": "分支",
    "stash": "暂存",
    "undo": "撤销",
    "remote": "远程",
    "log": "日志",
    "tag": "标签",
    "workspace": "工作区",
    "advanced": "高级"
};
var CATEGORY_KEYS = ["config", "basic", "branch", "stash", "undo",
    "remote", "log", "tag", "workspace", "advanced"];

/* ================= 1. 命令数据（78 条，按十类顺序） ================= */

var COMMANDS = [
/* ---- 配置 ---- */
{id:"config-user-name", name:"git config user.name", category:"config",
 syntax:"git config --global user.name \"<你的名字>\"",
 desc:"首次使用 Git 前必做：提交记录里显示的作者名；--global 对当前用户所有仓库生效。",
 example:"git config --global user.name \"张三\""},
{id:"config-user-email", name:"git config user.email", category:"config",
 syntax:"git config --global user.email \"<你的邮箱>\"",
 desc:"提交记录里显示的作者邮箱；建议与代码托管账号邮箱一致，否则提交头像与账号对不上。",
 example:"git config --global user.email \"zhangsan@example.com\""},
{id:"config-default-branch", name:"git config init.defaultBranch", category:"config",
 syntax:"git config --global init.defaultBranch <分支名>",
 desc:"新仓库默认分支名；设为 main 可避免旧版 Git 默认 master 带来的不一致。",
 example:"git config --global init.defaultBranch main"},
{id:"config-editor", name:"git config core.editor", category:"config",
 syntax:"git config --global core.editor \"<编辑器>\"",
 desc:"提交信息、变基等需要编辑文本时打开的编辑器；带 --wait 的编辑器会等你写完再继续。",
 example:"git config --global core.editor \"code --wait\""},
{id:"config-alias", name:"git config alias", category:"config",
 syntax:"git config --global alias.<简写> <原命令>",
 desc:"给常用命令起别名，之后 git st 就等于 git status；别名里可以拼多个命令。",
 example:"git config --global alias.st status"},
{id:"config-list", name:"git config --list", category:"config",
 syntax:"git config --list",
 desc:"列出当前生效的全部配置（系统级＋全局＋仓库级，后者覆盖前者）；定位配置冲突时先看它。",
 example:"git config --list"},
{id:"config-unset", name:"git config --unset", category:"config",
 syntax:"git config --global --unset <配置项>",
 desc:"删除一项全局配置；只删仓库级配置时去掉 --global；配置项不存在时会报错。",
 example:"git config --global --unset user.name"},

/* ---- 基础 ---- */
{id:"basic-init", name:"git init", category:"basic",
 syntax:"git init [<目录名>]",
 desc:"在当前目录（或指定目录）创建新仓库，生成 .git 目录；已有项目接入 Git 的第一步。",
 example:"git init my-project"},
{id:"basic-clone", name:"git clone", category:"basic",
 syntax:"git clone <仓库地址> [<目录名>]",
 desc:"完整克隆远程仓库到本地，含全部历史；默认远程名叫 origin，目录名不写则用仓库名。",
 example:"git clone https://github.com/example/demo.git"},
{id:"basic-status", name:"git status", category:"basic",
 syntax:"git status",
 desc:"查看工作区与暂存区状态：哪些改了、哪些已暂存、哪些未追踪；出问题先看它。",
 example:"git status"},
{id:"basic-add-file", name:"git add", category:"basic",
 syntax:"git add <文件>",
 desc:"把指定文件的修改加入暂存区，准备提交；可多次 add 叠加，提交时一并带走。",
 example:"git add src/index.js"},
{id:"basic-add-all", name:"git add .", category:"basic",
 syntax:"git add .",
 desc:"把当前目录下所有改动（含新建、修改、删除）一次性加入暂存区；提交前先 git status 确认没有误加文件。",
 example:"git add ."},
{id:"basic-commit", name:"git commit -m", category:"basic",
 syntax:"git commit -m \"<提交信息>\"",
 desc:"把暂存区内容存为一次提交；提交信息写清楚做了什么、为什么，别只写「修改」。",
 example:"git commit -m \"修复登录页在弱网下重复提交\""},
{id:"basic-commit-am", name:"git commit -am", category:"basic",
 syntax:"git commit -am \"<提交信息>\"",
 desc:"已追踪文件的修改一步到位：跳过 add 直接提交；新建文件仍需先 git add 才能被它带上。",
 example:"git commit -am \"更新 README 安装说明\""},
{id:"basic-diff", name:"git diff", category:"basic",
 syntax:"git diff [<文件>]",
 desc:"对比工作区与暂存区的差异；已暂存的改动用 git diff --staged 看，提交前复核就靠它。",
 example:"git diff"},

/* ---- 分支 ---- */
{id:"branch-list", name:"git branch", category:"branch",
 syntax:"git branch",
 desc:"列出本地全部分支，当前分支前标 *；加 -a 连远程分支一起看，加 -vv 看上游关联。",
 example:"git branch"},
{id:"branch-create", name:"git branch", category:"branch",
 syntax:"git branch <分支名>",
 desc:"在当前提交上新建分支，但不切换过去；建完切过去用 git switch，建完即切用 switch -c。",
 example:"git branch feature/login"},
{id:"branch-checkout", name:"git checkout", category:"branch",
 syntax:"git checkout <分支名>",
 desc:"切换到指定分支；老牌切换命令，新项目推荐语义更清晰的 git switch。",
 example:"git checkout feature/login"},
{id:"branch-switch", name:"git switch", category:"branch",
 syntax:"git switch <分支名>",
 desc:"切换分支的专用命令，语义比 checkout 更清晰；分支不存在会报错，不会误建。",
 example:"git switch main"},
{id:"branch-switch-create", name:"git switch -c", category:"branch",
 syntax:"git switch -c <分支名>",
 desc:"新建分支并立即切换过去；从当前提交分叉，是日常开新功能分支的标准起手。",
 example:"git switch -c feature/login"},
{id:"branch-checkout-b", name:"git checkout -b", category:"branch",
 syntax:"git checkout -b <分支名>",
 desc:"新建分支并立即切换过去；与 git switch -c 等价，老项目与旧教程里常见写法。",
 example:"git checkout -b hotfix/crash"},
{id:"branch-delete", name:"git branch -d", category:"branch",
 syntax:"git branch -d <分支名>",
 desc:"删除已合并的分支；未合并的分支会被拒绝，防止误删，误删见下方救援卡。",
 example:"git branch -d feature/login"},
{id:"branch-force-delete", name:"git branch -D", category:"branch",
 syntax:"git branch -D <分支名>",
 desc:"强制删除分支，不管是否已合并；删错了还能用 reflog 找回，见下方救援卡。",
 example:"git branch -D feature/login"},
{id:"branch-merge", name:"git merge", category:"branch",
 syntax:"git merge <分支名>",
 desc:"把指定分支合并到当前分支；有冲突时按提示解决冲突再提交，冲突救场见下方救援卡。",
 example:"git merge feature/login"},

/* ---- 暂存 ---- */
{id:"stash-push", name:"git stash", category:"stash",
 syntax:"git stash",
 desc:"把未提交的修改临时存起来，工作区恢复干净；适合中途切分支修紧急 bug。",
 example:"git stash"},
{id:"stash-push-msg", name:"git stash push -m", category:"stash",
 syntax:"git stash push -m \"<说明>\"",
 desc:"带说明暂存，stash list 里一眼认出是哪一摊改动；多条暂存并存时必写说明。",
 example:"git stash push -m \"进行中的登录页改动\""},
{id:"stash-list", name:"git stash list", category:"stash",
 syntax:"git stash list",
 desc:"列出全部暂存记录，stash@{0} 是最近的一条；恢复前先看清要恢复哪一条。",
 example:"git stash list"},
{id:"stash-apply", name:"git stash apply", category:"stash",
 syntax:"git stash apply [stash@{n}]",
 desc:"把指定暂存恢复到工作区，但暂存记录保留；不写编号默认恢复最新一条。",
 example:"git stash apply stash@{0}"},
{id:"stash-pop", name:"git stash pop", category:"stash",
 syntax:"git stash pop [stash@{n}]",
 desc:"恢复最新暂存并删除该记录；恢复时起冲突要先解决，记录会保留到成功为止。",
 example:"git stash pop"},
{id:"stash-drop", name:"git stash drop", category:"stash",
 syntax:"git stash drop [stash@{n}]",
 desc:"删除指定暂存记录；删错了见下方救援卡（fsck 找回）。",
 example:"git stash drop stash@{0}"},
{id:"stash-clear", name:"git stash clear", category:"stash",
 syntax:"git stash clear",
 desc:"清空全部暂存记录；不可逆，执行前确认 list 里没有要留的。",
 example:"git stash clear"},

/* ---- 撤销 ---- */
{id:"undo-restore", name:"git restore", category:"undo",
 syntax:"git restore <文件>",
 desc:"丢弃工作区对指定文件的修改，回到最近一次提交的状态；未提交的改动就此消失，救回见下方救援卡。",
 example:"git restore src/index.js"},
{id:"undo-restore-staged", name:"git restore --staged", category:"undo",
 syntax:"git restore --staged <文件>",
 desc:"把文件从暂存区撤回工作区，文件内容不动，只是取消暂存；反悔 add 时用。",
 example:"git restore --staged src/index.js"},
{id:"undo-reset-file", name:"git reset HEAD", category:"undo",
 syntax:"git reset HEAD <文件>",
 desc:"同上：取消指定文件的暂存，改动保留在工作区；老写法，新项目用 restore --staged。",
 example:"git reset HEAD src/index.js"},
{id:"undo-reset-soft", name:"git reset --soft", category:"undo",
 syntax:"git reset --soft HEAD~1",
 desc:"撤销最近一次提交，但改动保留在暂存区，可重新组织后再次提交；只改提交拆分时用。",
 example:"git reset --soft HEAD~1"},
{id:"undo-reset-mixed", name:"git reset --mixed", category:"undo",
 syntax:"git reset --mixed HEAD~1",
 desc:"撤销最近一次提交，改动退回工作区（默认模式）；适合拆分一次提交成多次。",
 example:"git reset --mixed HEAD~1"},
{id:"undo-reset-hard", name:"git reset --hard", category:"undo",
 syntax:"git reset --hard HEAD~1",
 desc:"撤销最近一次提交并丢弃工作区与暂存区全部改动；危险操作，执行前确认备份。",
 example:"git reset --hard HEAD~1"},
{id:"undo-revert", name:"git revert", category:"undo",
 syntax:"git revert <提交哈希>",
 desc:"用一次新提交反向撤销指定提交的改动，不改写历史；已推送的提交只能用它撤销。",
 example:"git revert a1b2c3d"},
{id:"undo-amend", name:"git commit --amend", category:"undo",
 syntax:"git commit --amend [-m \"<新信息>\"]",
 desc:"修改最近一次提交：补漏文件或改提交信息；已推送的提交不要 amend 后强推。",
 example:"git commit --amend -m \"修正提交信息\""},

/* ---- 远程 ---- */
{id:"remote-list", name:"git remote -v", category:"remote",
 syntax:"git remote -v",
 desc:"列出全部远程仓库名与地址；clone 来的默认叫 origin，fetch 与 push 地址分开显示。",
 example:"git remote -v"},
{id:"remote-add", name:"git remote add", category:"remote",
 syntax:"git remote add <名字> <地址>",
 desc:"给本地仓库绑定一个远程地址；已有仓库手动关联远程时用，名字习惯叫 origin。",
 example:"git remote add origin https://github.com/example/demo.git"},
{id:"remote-push", name:"git push", category:"remote",
 syntax:"git push <远程名> <分支名>",
 desc:"把本地分支的提交推送到远程；远程已有更新时先 pull，推不上去不要直接 -f。",
 example:"git push origin main"},
{id:"remote-push-upstream", name:"git push -u", category:"remote",
 syntax:"git push -u <远程名> <分支名>",
 desc:"首次推送并建立上游关联，之后该分支直接 git push / git pull 即可，不用每次写远程与分支。",
 example:"git push -u origin feature/login"},
{id:"remote-pull", name:"git pull", category:"remote",
 syntax:"git pull [<远程名> <分支名>]",
 desc:"拉取远程更新并合并到当前分支；等价于 fetch + merge，有冲突按提示解决。",
 example:"git pull"},
{id:"remote-pull-rebase", name:"git pull --rebase", category:"remote",
 syntax:"git pull --rebase",
 desc:"拉取后用变基代替合并，历史保持直线；团队协作常用，减少无意义合并提交。",
 example:"git pull --rebase"},
{id:"remote-fetch", name:"git fetch", category:"remote",
 syntax:"git fetch [<远程名>]",
 desc:"只下载远程更新到本地远程分支，不动工作区；先看再合是好习惯，适合合并前复核。",
 example:"git fetch origin"},
{id:"remote-fetch-prune", name:"git fetch --prune", category:"remote",
 syntax:"git fetch --prune",
 desc:"拉取时顺手清理本地已不存在的远程分支引用；远程删了的分支本地不再显示。",
 example:"git fetch --prune"},
{id:"remote-push-delete", name:"git push --delete", category:"remote",
 syntax:"git push <远程名> --delete <分支名>",
 desc:"删除远程分支；本地分支不会自动删，再用 git branch -d 清理本地同名分支。",
 example:"git push origin --delete feature/login"},

/* ---- 日志 ---- */
{id:"log-log", name:"git log", category:"log",
 syntax:"git log",
 desc:"按时间倒序查看提交历史：哈希、作者、日期、提交信息；按 q 退出，空格翻页。",
 example:"git log"},
{id:"log-oneline", name:"git log --oneline", category:"log",
 syntax:"git log --oneline",
 desc:"一行一条的简洁历史，哈希缩写＋标题；快速浏览首选，也常用来找要 revert 的提交。",
 example:"git log --oneline"},
{id:"log-graph", name:"git log --graph", category:"log",
 syntax:"git log --graph --oneline --all",
 desc:"用 ASCII 图画出分支分叉与合并关系，全部分支一起看；理清分支结构时用。",
 example:"git log --graph --oneline --all"},
{id:"log-since", name:"git log --since", category:"log",
 syntax:"git log --since=\"<时间>\"",
 desc:"只看指定时间之后的提交；支持 \"yesterday\"、\"2 weeks ago\"、\"2026-01-01\" 等写法。",
 example:"git log --since=\"2 weeks ago\""},
{id:"log-patch", name:"git log -p", category:"log",
 syntax:"git log -p [-n]",
 desc:"连同每次提交的具体代码改动一起看；定位「哪次提交改坏了」时用，-n 限制条数。",
 example:"git log -p -2"},
{id:"log-show", name:"git show", category:"log",
 syntax:"git show <提交哈希>",
 desc:"查看某次提交的完整信息与代码改动；不加哈希默认看最近一次提交。",
 example:"git show a1b2c3d"},
{id:"log-blame", name:"git blame", category:"log",
 syntax:"git blame <文件>",
 desc:"逐行标注每一行最后是谁、在哪次提交里改的；溯源与定位责任人时用。",
 example:"git blame src/index.js"},
{id:"log-reflog", name:"git reflog", category:"log",
 syntax:"git reflog",
 desc:"记录 HEAD 每一次移动：切换、提交、变基、误删分支都有迹可循；灾难救援的起点。",
 example:"git reflog"},

/* ---- 标签 ---- */
{id:"tag-list", name:"git tag", category:"tag",
 syntax:"git tag",
 desc:"列出全部标签；加 -l \"v1.*\" 可按模式过滤，只看某一大版本的标签。",
 example:"git tag"},
{id:"tag-create", name:"git tag", category:"tag",
 syntax:"git tag <标签名>",
 desc:"给当前提交打轻量标签；发布版本时标记里程碑，轻量标签只有名字没有额外信息。",
 example:"git tag v1.0.0"},
{id:"tag-annotated", name:"git tag -a", category:"tag",
 syntax:"git tag -a <标签名> -m \"<说明>\"",
 desc:"打带说明、作者与日期的附注标签；正式发布推荐用它，信息完整可追溯。",
 example:"git tag -a v1.0.0 -m \"首个正式版\""},
{id:"tag-push", name:"git push tag", category:"tag",
 syntax:"git push <远程名> <标签名>",
 desc:"把单个标签推送到远程；默认 push 不带标签，需显式推，否则远程看不到。",
 example:"git push origin v1.0.0"},
{id:"tag-push-all", name:"git push --tags", category:"tag",
 syntax:"git push <远程名> --tags",
 desc:"一次推送全部本地标签到远程；批量发布标签时用。",
 example:"git push origin --tags"},
{id:"tag-delete", name:"git tag -d", category:"tag",
 syntax:"git tag -d <标签名>",
 desc:"删除本地标签；远程标签另用 git push origin :refs/tags/<标签名> 删。",
 example:"git tag -d v1.0.0"},
{id:"tag-checkout", name:"git checkout tag", category:"tag",
 syntax:"git checkout <标签名>",
 desc:"切换到标签指向的提交查看旧版本；会进入 detached HEAD，改代码前先建分支。",
 example:"git checkout v1.0.0"},

/* ---- 工作区 ---- */
{id:"workspace-clean-dry", name:"git clean -n", category:"workspace",
 syntax:"git clean -n",
 desc:"预演：列出会被删除的未追踪文件，但不真删；先看再动手，误删救回见下方救援卡。",
 example:"git clean -n"},
{id:"workspace-clean-force", name:"git clean -fd", category:"workspace",
 syntax:"git clean -fd",
 desc:"删除未追踪文件与目录（-f 强制，-d 含目录）；被忽略文件不受影响，删前先用 -n 预演。",
 example:"git clean -fd"},
{id:"workspace-rm", name:"git rm", category:"workspace",
 syntax:"git rm <文件>",
 desc:"从工作区与暂存区同时删除文件并记录删除；只删暂存保留文件用 --cached。",
 example:"git rm old-file.js"},
{id:"workspace-mv", name:"git mv", category:"workspace",
 syntax:"git mv <旧名> <新名>",
 desc:"重命名文件并暂存这次改名；Git 能识别为重命名而非删＋增，历史更干净。",
 example:"git mv old.js new.js"},
{id:"workspace-grep", name:"git grep", category:"workspace",
 syntax:"git grep \"<关键词>\" [提交]",
 desc:"在已追踪文件里全文搜索；比系统 grep 快，且默认忽略未追踪文件，可指定提交版本。",
 example:"git grep \"TODO\" $(git rev-list --all)"},
{id:"workspace-cherry-pick", name:"git cherry-pick", category:"workspace",
 syntax:"git cherry-pick <提交哈希>",
 desc:"把指定提交原样搬到当前分支；跨分支只取个别提交时用，冲突按提示解决。",
 example:"git cherry-pick a1b2c3d"},
{id:"workspace-archive", name:"git archive", category:"workspace",
 syntax:"git archive -o <输出文件> <提交>",
 desc:"把指定提交导出为压缩包，不含 .git；发版打包、给测试同事发快照时用。",
 example:"git archive -o release.zip HEAD"},

/* ---- 高级 ---- */
{id:"advanced-rebase-i", name:"git rebase -i", category:"advanced",
 syntax:"git rebase -i HEAD~<n>",
 desc:"交互式变基：合并、拆分、改写最近 n 次提交；中途反悔用 git rebase --abort，翻车见下方救援卡。",
 example:"git rebase -i HEAD~3"},
{id:"advanced-rebase-abort", name:"git rebase --abort", category:"advanced",
 syntax:"git rebase --abort",
 desc:"变基进行中放弃，回到变基前的状态；冲突解到一半想重来时用。",
 example:"git rebase --abort"},
{id:"advanced-bisect", name:"git bisect", category:"advanced",
 syntax:"git bisect start <坏的提交> <好的提交>",
 desc:"二分查找引入 bug 的提交：每轮标记 good/bad，Git 自动折半；结束用 git bisect reset。",
 example:"git bisect start HEAD v1.0.0"},
{id:"advanced-worktree", name:"git worktree add", category:"advanced",
 syntax:"git worktree add <目录> <分支>",
 desc:"同一仓库多目录并行工作：主目录改功能、副目录修紧急 bug，互不干扰。",
 example:"git worktree add ../hotfix hotfix/crash"},
{id:"advanced-submodule-add", name:"git submodule add", category:"advanced",
 syntax:"git submodule add <地址> <路径>",
 desc:"把另一个仓库作为子模块嵌进来；克隆主仓库后需 update --init 才能拿到子模块内容。",
 example:"git submodule add https://github.com/example/lib.git vendor/lib"},
{id:"advanced-submodule-update", name:"git submodule update", category:"advanced",
 syntax:"git submodule update --init --recursive",
 desc:"初始化并更新全部子模块到记录的提交；刚 clone 含子模块的仓库时必跑。",
 example:"git submodule update --init --recursive"},
{id:"advanced-force-with-lease", name:"git push --force-with-lease", category:"advanced",
 syntax:"git push --force-with-lease <远程名> <分支名>",
 desc:"有条件强推：仅当远程没人新推过时才覆盖，比 -f 安全；改写已推送历史前先确认备份。",
 example:"git push --force-with-lease origin main"},
{id:"advanced-shortlog", name:"git shortlog", category:"advanced",
 syntax:"git shortlog -sn",
 desc:"按作者统计提交数并排序；看谁贡献最多、快速盘点项目参与情况。",
 example:"git shortlog -sn"}
];

/* ================= 2. 灾难救援卡（10 张） ================= */

var RESCUE_SCENARIOS = [
{id:"deleted-branch", title:"误删分支",
 symptom:"git branch -D 删错了分支，分支上的提交还没合并到主分支，代码好像丢了。",
 diagnosis:"删分支只删指针，不删提交对象；只要提交还没被 gc 回收，reflog 里能找到删除前的 HEAD 位置。",
 steps:[
  {cmd:"git reflog", note:"找到被删分支最后一次提交的哈希（形如 a1b2c3d），以及删除前的 HEAD 位置", dangerous:false},
  {cmd:"git branch feature/login a1b2c3d", note:"用找回的哈希重建分支，名字用原来的分支名", dangerous:false},
  {cmd:"git log --oneline feature/login -3", note:"确认重建的分支内容无误", dangerous:false}],
 prevention:"删分支优先用 -d（未合并会拒绝）；删前先 git branch --merged 确认已合并；重要分支推一份到远程当备份。"},
{id:"pushed-wrong-branch", title:"push 错分支",
 symptom:"本想推 feature/login，结果把实验分支推到了远程 main，或者把分支推到了错误的远程仓库。",
 diagnosis:"远程分支也只是指针：推错了可以删掉远程错误分支再推正确的；但如果别人已经基于错误内容拉取并开发，要先通知对方再动手。",
 steps:[
  {cmd:"git push origin --delete feature/wrong-name", note:"删掉远程上推错的分支（把 feature/wrong-name 换成实际推错的分支名）", dangerous:false},
  {cmd:"git push -u origin feature/login", note:"把正确的分支推上去", dangerous:false},
  {cmd:"", note:"如果推错的是 main 且已被同事拉取：不要强推，先在群里同步，改用 git revert 撤销错误提交", dangerous:false}],
 prevention:"首次推送用 git push -u 显式写清远程与分支名；给实验分支起不会撞生产分支的名字。"},
{id:"undo-pushed-commit", title:"撤销已 push 的 commit",
 symptom:"已经 push 到远程的提交有问题（错代码、敏感信息、错误信息），想把它撤下来。",
 diagnosis:"历史已公开，改写历史会影响所有已拉取的同事；安全做法是新提交反向撤销，历史保持完整。",
 steps:[
  {cmd:"git revert a1b2c3d", note:"生成一次反向提交撤销指定提交，历史不改写，可正常 push", dangerous:false},
  {cmd:"git push origin main", note:"把撤销提交推送到远程", dangerous:false},
  {cmd:"git reset --hard HEAD~1", note:"只有分支尚未被他人拉取时才可改写：先本地回退", dangerous:true},
  {cmd:"git push --force-with-lease origin main", note:"配合改写历史的强推；已有人拉取时禁止使用", dangerous:true}],
 prevention:"push 前用 git log --oneline 与 git diff --staged 复核；敏感信息泄露用 git filter-repo 而非简单删除。"},
{id:"deleted-unpushed-branch", title:"误删未 push 分支",
 symptom:"从没 push 过的本地分支被 -D 删了，且 reflog 里也翻不到（或 reflog 已过期），本地唯一副本好像没了。",
 diagnosis:"提交对象在 gc 回收前仍在对象库里，fsck 能找到悬空（dangling）提交；按内容逐个辨认就能找回。",
 steps:[
  {cmd:"git fsck --lost-found", note:"扫描悬空提交，输出 dangling commit 的哈希", dangerous:false},
  {cmd:"git show a1b2c3d --stat", note:"逐个查看悬空提交的内容，找到属于被删分支的那次提交", dangerous:false},
  {cmd:"git branch feature/login a1b2c3d", note:"确认后用该哈希重建分支", dangerous:false}],
 prevention:"未 push 的分支是本地唯一副本，删前先 push 到远程或打标签备份；养成定期 push 的习惯。"},
{id:"deleted-stash", title:"误删 stash",
 symptom:"git stash drop / clear 删错了暂存，里面的改动还没提交，工作区也找不回来了。",
 diagnosis:"stash 本质也是一次提交（两个父提交的 merge 结构），删记录不立即删除提交对象，fsck 可找回。",
 steps:[
  {cmd:"git fsck --lost-found", note:"找到 dangling commit，stash 提交通常带两个父提交", dangerous:false},
  {cmd:"git show a1b2c3d --stat", note:"确认内容是被删的那份暂存", dangerous:false},
  {cmd:"git stash apply a1b2c3d", note:"把找回的提交作为 stash 恢复到工作区", dangerous:false}],
 prevention:"重要暂存用 push -m 写清说明；暂存只是临时手段，尽快提交成正式 commit。"},
{id:"rebase-failed", title:"rebase 翻车",
 symptom:"rebase -i 改到一半冲突满天飞，或者变基后发现历史改乱了、提交丢了。",
 diagnosis:"变基进行中可用 --abort 全身而退；变基已完成但结果不对，用 reflog 回到变基前的 HEAD（ORIG_HEAD 也指向变基前位置）。",
 steps:[
  {cmd:"git rebase --abort", note:"变基还没结束时放弃，回到变基前状态", dangerous:false},
  {cmd:"git reflog", note:"变基已完成时，在 reflog 里找到变基前 HEAD 的位置", dangerous:false},
  {cmd:"git reset --hard ORIG_HEAD", note:"回到变基前的提交；会丢弃工作区改动，执行前确认", dangerous:true}],
 prevention:"变基前先提交或 stash 干净工作区；公开分支（已 push 且他人在用）不要 rebase。"},
{id:"merge-conflict", title:"merge 冲突救场",
 symptom:"git merge / git pull 后提示 CONFLICT，卡在合并中途，不知道该继续还是放弃。",
 diagnosis:"冲突只是 Git 把两边改动都标出来等你裁决；文件里的 <<<<<<<、=======、>>>>>>> 标记就是战场，先分清「要哪边」再动手。",
 steps:[
  {cmd:"git status", note:"列出所有冲突文件（both modified）", dangerous:false},
  {cmd:"", note:"打开冲突文件，删掉标记行，拼出最终想要的内容", dangerous:false},
  {cmd:"git add <冲突文件>", note:"逐个把解决好的文件加入暂存", dangerous:false},
  {cmd:"git commit", note:"提交完成合并（默认信息即可）", dangerous:false},
  {cmd:"git merge --abort", note:"不想合了：放弃本次合并，回到合并前状态", dangerous:false}],
 prevention:"合并前先提交干净工作区；频繁 pull --rebase 保持历史直线，减少大合并。"},
{id:"discarded-changes", title:"丢弃本地修改救回",
 symptom:"git restore / git checkout -- / git clean -fd 手滑，把还没提交的改动删了。",
 diagnosis:"未追踪、从未 add 过的改动无法找回；曾经 add 进暂存区的文件内容以 blob 形式留在对象库，fsck 能翻出来；已提交过的更不用担心。",
 steps:[
  {cmd:"git fsck --lost-found", note:"扫描悬空对象，找回曾暂存过的文件内容（dangling blob）", dangerous:false},
  {cmd:"git show a1b2c3d", note:"查看悬空对象内容，确认是要救回的文件", dangerous:false},
  {cmd:"", note:"确认后把内容写回文件：git show <哈希> > <文件名>", dangerous:false}],
 prevention:"改动随手 add 或 commit，别让重要改动长期只活在工作区；清目录前先 git clean -n 预演。"},
{id:"remote-branch-deleted", title:"远程分支被删",
 symptom:"git fetch 后发现远程分支不见了，或者 git branch -r 里某个分支消失了，本地还留着旧的远程跟踪引用。",
 diagnosis:"先分清是「远程分支真被删了」还是「本地引用过期」：fetch --prune 会同步清理本地过期引用；若远程分支被误删，用本地副本或 reflog 重建推回。",
 steps:[
  {cmd:"git fetch --prune", note:"同步远程状态，清理本地已失效的远程跟踪分支", dangerous:false},
  {cmd:"git branch -r", note:"确认远程分支现状", dangerous:false},
  {cmd:"git push -u origin feature/login", note:"远程分支被误删且本地还有该分支时，直接推回重建", dangerous:false},
  {cmd:"", note:"本地也没有时：用 git reflog 找回哈希重建，或向同事要一份该分支再推回", dangerous:false}],
 prevention:"删远程分支前团队内先同步；重要分支在本地保留副本或打标签。"},
{id:"detached-head", title:"detached HEAD",
 symptom:"checkout 了某个提交哈希或标签后，Git 提示 You are in 'detached HEAD' state，此时提交的东西不属于任何分支。",
 diagnosis:"HEAD 悬空在某个提交上而非分支指针：在此状态下的新提交一旦切走分支就找不到，必须先给它一个分支名。",
 steps:[
  {cmd:"git status", note:"确认当前 HEAD 位置与工作区状态", dangerous:false},
  {cmd:"git branch rescue-temp", note:"立刻给当前提交建个分支，把悬空的提交拴住", dangerous:false},
  {cmd:"git switch main", note:"切回主分支", dangerous:false},
  {cmd:"git merge rescue-temp", note:"把悬空期间的提交合并回主分支；确认无用则 git branch -D rescue-temp 删掉", dangerous:false}],
 prevention:"只想看旧版本时不提交；要改代码先 git switch -c 新分支再动手。"}
];

/* ================= 3. 纯函数 ================= */

/* 关键词归一化：去首尾空白、转小写；非字符串返回空串（供内部复用）。 */
function normalizeKeyword(keyword) {
    if (typeof keyword !== "string") return "";
    return keyword.replace(/^\s+|\s+$/g, "").toLowerCase();
}

/* 关键词实时搜索：命令名／中文说明／使用示例三字段，大小写不敏感；
 * commands 非数组 err.field='commands'；keyword 非字符串 err.field='keyword'；
 * 空关键词返回全量（返回新数组，不动原数组）。 */
function searchCommands(commands, keyword) {
    if (!Array.isArray(commands)) fail("commands", "commands 须为数组");
    if (typeof keyword !== "string") fail("keyword", "keyword 须为字符串");
    var q = normalizeKeyword(keyword);
    if (q === "") return commands.slice();
    return commands.filter(function (c) {
        return (c.name && c.name.toLowerCase().indexOf(q) !== -1) ||
            (c.desc && c.desc.toLowerCase().indexOf(q) !== -1) ||
            (c.example && c.example.toLowerCase().indexOf(q) !== -1);
    });
}

/* 按 id 取命令：commands 非数组 err.field='commands'；找不到 err.field='id'。 */
function getCommand(commands, id) {
    if (!Array.isArray(commands)) fail("commands", "commands 须为数组");
    for (var i = 0; i < commands.length; i++) {
        if (commands[i].id === id) return commands[i];
    }
    fail("id", "找不到命令 id：" + id);
}

/* 按 id 取救援卡：scenarios 非数组 err.field='scenarios'；找不到 err.field='id'。 */
function getRescue(scenarios, id) {
    if (!Array.isArray(scenarios)) fail("scenarios", "scenarios 须为数组");
    for (var i = 0; i < scenarios.length; i++) {
        if (scenarios[i].id === id) return scenarios[i];
    }
    fail("id", "找不到救援卡 id：" + id);
}

/* 保序分组：按命令首次出现顺序建分类键，只含实际出现的分类；
 * commands 非数组 err.field='commands'。 */
function groupByCategory(commands) {
    if (!Array.isArray(commands)) fail("commands", "commands 须为数组");
    var groups = {};
    for (var i = 0; i < commands.length; i++) {
        var cat = commands[i].category;
        if (!groups[cat]) groups[cat] = [];
        groups[cat].push(commands[i]);
    }
    return groups;
}

/* 一键复制文本：命令名注释行＋可直接运行的使用示例（无示例时回退规范语法）；
 * cmd 非对象或 name/syntax 非空字符串缺失时 err.field='cmd'。 */
function buildCopyText(cmd) {
    if (!cmd || typeof cmd !== "object" ||
        typeof cmd.name !== "string" || cmd.name.replace(/^\s+|\s+$/g, "") === "" ||
        typeof cmd.syntax !== "string" || cmd.syntax.replace(/^\s+|\s+$/g, "") === "") {
        fail("cmd", "cmd 须含非空 name 与 syntax");
    }
    var body = (typeof cmd.example === "string" &&
        cmd.example.replace(/^\s+|\s+$/g, "") !== "") ? cmd.example : cmd.syntax;
    return "# " + cmd.name + "\n" + body;
}

/* 救援步骤复制文本：标题行＋分步命令编号拼接（无命令的纯文字步骤不计入）；
 * scenario 非对象或 title 非空字符串缺失、steps 非数组时 err.field='scenario'。 */
function buildRescueCopy(scenario) {
    if (!scenario || typeof scenario !== "object" ||
        typeof scenario.title !== "string" || scenario.title.replace(/^\s+|\s+$/g, "") === "" ||
        !Array.isArray(scenario.steps)) {
        fail("scenario", "scenario 须含非空 title 与 steps 数组");
    }
    var lines = [scenario.title];
    var n = 0;
    for (var i = 0; i < scenario.steps.length; i++) {
        var s = scenario.steps[i];
        if (s && typeof s.cmd === "string" && s.cmd.replace(/^\s+|\s+$/g, "") !== "") {
            n++;
            lines.push(n + ". " + s.cmd);
        }
    }
    return lines.join("\n");
}

/* 校验命令条目：缺 id/name/syntax/category 时 err.field 给出缺失字段名；
 * 通过返回 {ok:true}。 */
function validateCommand(cmd) {
    if (!cmd || typeof cmd !== "object") fail("cmd", "cmd 须为对象");
    var fields = ["id", "name", "syntax", "category"];
    for (var i = 0; i < fields.length; i++) {
        var f = fields[i];
        if (typeof cmd[f] !== "string" || cmd[f].replace(/^\s+|\s+$/g, "") === "") {
            fail(f, "命令缺失字段：" + f);
        }
    }
    return {ok: true};
}

/* 文件名清理：去非法字符，空白转连字符，最长 60；空回退 'git-cheatsheet'。 */
function sanitizeFileName(text) {
    var s = (text == null) ? "" : String(text);
    s = s.replace(/[\\/:*?"<>\u0000-\u001f]/g, "");
    s = s.replace(/^[\s.]+|[\s.]+$/g, "").replace(/\s+/g, "-");
    if (s.length > 60) s = s.slice(0, 60).replace(/-+$/, "");
    if (s.length === 0) return "git-cheatsheet";
    return s;
}

/* HTML 转义（渲染用，防数据里的 <>& 被解析）。 */
function escHtml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
        .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

var api = {
    COMMANDS: COMMANDS,
    RESCUE_SCENARIOS: RESCUE_SCENARIOS,
    CATEGORY_LABELS: CATEGORY_LABELS,
    CATEGORY_KEYS: CATEGORY_KEYS,
    normalizeKeyword: normalizeKeyword,
    searchCommands: searchCommands,
    getCommand: getCommand,
    getRescue: getRescue,
    groupByCategory: groupByCategory,
    buildCopyText: buildCopyText,
    buildRescueCopy: buildRescueCopy,
    validateCommand: validateCommand,
    sanitizeFileName: sanitizeFileName,
    escHtml: escHtml
};

if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
} else if (typeof window !== "undefined") {
    window.GitCheatsheet = api;
}

/* ================= 4. 浏览器 DOM 装配 ================= */

if (typeof document !== "undefined" && typeof window !== "undefined") {
(function () {
var G = (typeof window.GitCheatsheet !== "undefined") ? window.GitCheatsheet : api;

function $(id) { return document.getElementById(id); }

function copyText(text, btn) {
    function done() {
        if (!btn) return;
        var old = btn.textContent;
        btn.textContent = "已复制";
        setTimeout(function () { btn.textContent = old; }, 1500);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text, done); });
    } else {
        fallbackCopy(text, done);
    }
}

function fallbackCopy(text, done) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); } catch (e) { /* 忽略 */ }
    document.body.removeChild(ta);
    done();
}

function currentState() {
    var searchEl = $("gc-search");
    var tabEl = document.querySelector(".gc-tab.active");
    return {
        query: searchEl ? searchEl.value : "",
        cat: tabEl ? tabEl.getAttribute("data-cat") : "all"
    };
}

function renderCommands() {
    var grid = $("gc-grid");
    var count = $("gc-count");
    if (!grid) return;
    var st = currentState();
    var list = G.searchCommands(G.COMMANDS, st.query);
    if (st.cat !== "all") {
        list = list.filter(function (c) { return c.category === st.cat; });
    }
    var html = "";
    var groups = G.groupByCategory(list);
    var cats = G.CATEGORY_KEYS.filter(function (k) { return groups[k]; });
    for (var gi = 0; gi < cats.length; gi++) {
        var cat = cats[gi];
        html += '<h4 class="gc-group-title">' + escHtml(G.CATEGORY_LABELS[cat] || cat) +
            "（" + groups[cat].length + " 条）</h4>";
        for (var i = 0; i < groups[cat].length; i++) {
            var c = groups[cat][i];
            html += '<article class="gc-card" tabindex="0" data-cmd="' + escHtml(c.id) + '">' +
                '<div class="gc-card-head"><code class="gc-syntax">' + escHtml(c.syntax) + "</code>" +
                '<button type="button" class="gc-copy" data-copy-cmd="' + escHtml(c.id) +
                '">复制</button></div>' +
                '<div class="gc-name">' + escHtml(c.name) + "</div>" +
                '<div class="gc-desc">' + escHtml(c.desc) + "</div>" +
                '<div class="gc-example"><span>示例：</span><code>' + escHtml(c.example) + "</code></div>" +
                "</article>";
        }
    }
    if (list.length === 0) {
        html = '<div class="gc-empty">没有找到与「' + escHtml(G.normalizeKeyword(st.query) || "当前筛选") +
            "」相关的命令，换个关键词试试（支持命令名／中文说明／示例）。</div>";
    }
    grid.innerHTML = html;
    if (count) {
        count.textContent = "共 " + list.length + " 条命令" +
            (st.cat !== "all" ? "（" + (G.CATEGORY_LABELS[st.cat] || st.cat) + "）" : "") +
            "，全部 " + G.COMMANDS.length + " 条";
    }
    var copyBtns = grid.querySelectorAll("[data-copy-cmd]");
    for (var b = 0; b < copyBtns.length; b++) {
        (function (btn) {
            btn.addEventListener("click", function (ev) {
                ev.stopPropagation();
                copyText(G.buildCopyText(G.getCommand(G.COMMANDS, btn.getAttribute("data-copy-cmd"))), btn);
            });
        })(copyBtns[b]);
    }
}

function renderRescue() {
    var wrap = $("gc-rescue");
    if (!wrap) return;
    var html = "";
    for (var i = 0; i < G.RESCUE_SCENARIOS.length; i++) {
        var s = G.RESCUE_SCENARIOS[i];
        var stepsHtml = "";
        for (var j = 0; j < s.steps.length; j++) {
            var st = s.steps[j];
            stepsHtml += '<li class="' + (st.dangerous ? "gc-step-danger" : "") + '">' +
                (st.dangerous ? '<span class="gc-danger-badge">危险操作</span>' : "") +
                (st.cmd ? "<code>" + escHtml(st.cmd) + "</code>" : "") +
                '<span class="gc-step-note">' + escHtml(st.note) + "</span></li>";
        }
        html += '<article class="gc-rescue-card" tabindex="0" data-rescue="' + escHtml(s.id) + '">' +
            '<div class="gc-rescue-head"><span class="gc-rescue-title">' +
            '<i class="material-icons">sos</i>' + escHtml(s.title) + "</span>" +
            '<span class="gc-rescue-actions">' +
            '<button type="button" class="gc-copy" data-copy-rescue="' + escHtml(s.id) + '">复制步骤</button>' +
            '<span class="gc-toggle">展开</span></span></div>' +
            '<div class="gc-rescue-body">' +
            '<dl><dt>症状</dt><dd>' + escHtml(s.symptom) + "</dd>" +
            "<dt>诊断</dt><dd>" + escHtml(s.diagnosis) + "</dd>" +
            "<dt>分步救援</dt><dd><ol class=\"gc-steps\">" + stepsHtml + "</ol></dd>" +
            "<dt>预防</dt><dd>" + escHtml(s.prevention) + "</dd></dl>" +
            "</div></article>";
    }
    wrap.innerHTML = html;
    var cards = wrap.querySelectorAll(".gc-rescue-card");
    for (var c = 0; c < cards.length; c++) {
        (function (card) {
            function toggle(ev) {
                if (ev.target && ev.target.closest && ev.target.closest("[data-copy-rescue]")) return;
                card.classList.toggle("gc-open");
                var t = card.querySelector(".gc-toggle");
                if (t) t.textContent = card.classList.contains("gc-open") ? "收起" : "展开";
            }
            card.addEventListener("click", toggle);
            card.addEventListener("keydown", function (ev) {
                if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); toggle(ev); }
            });
        })(cards[c]);
    }
    var copyBtns = wrap.querySelectorAll("[data-copy-rescue]");
    for (var b = 0; b < copyBtns.length; b++) {
        (function (btn) {
            btn.addEventListener("click", function (ev) {
                ev.stopPropagation();
                copyText(G.buildRescueCopy(G.getRescue(G.RESCUE_SCENARIOS, btn.getAttribute("data-copy-rescue"))), btn);
            });
        })(copyBtns[b]);
    }
}

function init() {
    var searchEl = $("gc-search");
    if (searchEl) searchEl.addEventListener("input", renderCommands);
    var tabs = document.querySelectorAll(".gc-tab");
    for (var i = 0; i < tabs.length; i++) {
        (function (tab) {
            tab.addEventListener("click", function () {
                for (var j = 0; j < tabs.length; j++) tabs[j].classList.remove("active");
                tab.classList.add("active");
                renderCommands();
            });
        })(tabs[i]);
    }
    var clearBtn = $("gc-clear");
    if (clearBtn) {
        clearBtn.addEventListener("click", function () {
            if (searchEl) searchEl.value = "";
            var allTab = document.querySelector('.gc-tab[data-cat="all"]');
            if (allTab) allTab.click(); else renderCommands();
            if (searchEl) searchEl.focus();
        });
    }
    renderCommands();
    renderRescue();
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
} else {
    init();
}

})();
}

})();
