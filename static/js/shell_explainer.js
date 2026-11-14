/* Shell 命令解释器（explainshell 模式）- 纯前端（零后端、零上传）
 *
 * 纯逻辑层（SE-CORE）：自研 shell 词法切分、25 个常用命令旗标词典、
 * 逐段中文释义、危险旗标检测 —— 无 DOM，可在 Node 下单测。
 * DOM 层：粘贴即解释、分段高亮、结构分解表、一键复制释义、预设示例。
 * 只解释、不执行、不转换；全部计算都在浏览器本地完成，命令不上传服务器。
 */
(function () {
'use strict';

var MAX_INPUT = 4000;

/* ================= 旗标词典（25 个常用命令） ================= */
/* flags: 旗标 → 中文释义；values: 需要吞掉下一个 token 当作值的旗标 */

var DICT = {
    ls: { desc: '列出目录内容',
        flags: { '-l': '以长格式列出详细信息', '-a': '显示所有文件，包括隐藏文件', '-h': '以人类可读格式显示文件大小（常与 -l 联用）', '-r': '反向排序', '-t': '按修改时间排序（最新在前）', '-S': '按文件大小排序', '-R': '递归列出子目录内容', '-d': '只显示目录本身，不展开其内容', '-i': '显示文件的 inode 号', '-s': '显示每个文件占用的块数', '-1': '每行只显示一个文件', '-F': '在条目后附加类型标识（目录 /、可执行文件 *、符号链接 @）', '-n': '以数字形式显示 UID/GID（不解析用户名）', '--color': '是否用颜色区分文件类型', '--time-style': '指定长格式中时间戳的显示样式（如 full-iso、long-iso，或 +FORMAT 自定义）' },
        values: ['--color', '--time-style'] },
    cd: { desc: '切换当前工作目录',
        flags: { '-L': '使用逻辑路径（默认，符号链接按字面路径处理）', '-P': '使用物理路径（解析符号链接后的真实路径）', '-e': '目录切换失败时退出（用于脚本）', '-@': '切换目录时解析扩展属性（macOS）', '--': '结束选项，后续内容按目录名处理', '-': '回到上一次所在的目录' },
        values: [] },
    cp: { desc: '复制文件或目录',
        flags: { '-r': '递归复制目录及其内容', '-R': '与 -r 相同，递归复制', '-i': '覆盖文件前先询问', '-f': '覆盖目标文件时不询问', '-v': '显示正在复制的文件', '-p': '保留原文件的权限、属主与时间戳', '-a': '归档模式（相当于 -dR --preserve=all）', '-u': '仅当源文件更新或目标不存在时才复制', '-n': '不覆盖已存在的文件', '-l': '创建硬链接而非复制', '-s': '创建符号链接而非复制', '-b': '覆盖前先备份目标文件', '-t': '把后续所有参数当作源文件，指定目标目录' },
        values: ['-t', '-S', '--backup'] },
    mv: { desc: '移动或重命名文件/目录',
        flags: { '-i': '覆盖目标文件前先询问', '-f': '覆盖目标文件时不询问', '-n': '不覆盖已存在的文件', '-v': '显示移动过程', '-u': '仅当源文件更新或目标不存在时才移动', '-b': '覆盖前先备份目标文件', '--backup': '覆盖前备份（与 -b 相同）', '-S': '指定备份文件的后缀', '-t': '把后续所有参数当作源文件，指定目标目录' },
        values: ['-t', '-S', '--backup'] },
    rm: { desc: '删除文件或目录',
        flags: { '-r': '递归删除目录及其内容', '-R': '与 -r 相同，递归删除', '-f': '强制删除，不询问且忽略不存在的文件', '-i': '删除每个文件前先询问', '-I': '删除超过 3 个文件或递归删除时询问一次', '-v': '显示正在删除的文件', '-d': '只删除空目录', '--preserve-root': '拒绝删除根目录 /（默认保护）', '--no-preserve-root': '取消对根目录 / 的保护（极度危险）' },
        values: [] },
    mkdir: { desc: '创建目录',
        flags: { '-p': '需要时递归创建父目录，已存在不报错', '-m': '创建目录时指定权限模式（如 755）', '-v': '显示创建的每个目录', '--parents': '与 -p 相同，递归创建父目录', '--mode': '与 -m 相同，指定权限模式', '--verbose': '与 -v 相同，显示创建过程', '-Z': '为新目录设置 SELinux 安全上下文', '--context': '为新目录指定 SELinux 上下文' },
        values: ['-m', '--mode', '--context', '-Z'] },
    cat: { desc: '连接文件并打印到标准输出',
        flags: { '-n': '给所有行编号（含空行）', '-b': '只给非空行编号', '-s': '把连续多个空行压缩成一个', '-E': '在每行末尾显示 $ 符号', '-T': '把 Tab 显示为 ^I', '-v': '显示不可见字符（控制字符）', '-A': '相当于 -vET（显示所有不可见字符）', '-e': '相当于 -vE（显示行尾 $ 与不可见字符）', '-t': '相当于 -vT（显示 Tab 与不可见字符）', '--number': '与 -n 相同，给所有行编号', '--squeeze-blank': '与 -s 相同，压缩连续空行' },
        values: [] },
    grep: { desc: '搜索文本内容',
        flags: { '-r': '递归搜索子目录', '-R': '与 -r 相同，递归搜索（跟随符号链接）', '-i': '忽略大小写', '-n': '显示匹配行的行号', '-v': '反选：显示不匹配的行', '-w': '只匹配整个单词', '-E': '使用扩展正则表达式', '-F': '把模式当作固定字符串（不解析正则）', '-l': '只列出包含匹配的文件名', '-c': '只输出每个文件的匹配行数', '-o': '只输出匹配到的部分，不输出整行', '-A': '显示匹配行之后的若干行', '-B': '显示匹配行之前的若干行', '-C': '显示匹配行前后各若干行', '-q': '静默模式：找到匹配即退出，不输出内容', '-e': '指定搜索模式（可多次使用）', '-m': '每个文件最多输出若干个匹配行', '--color': '是否用颜色高亮匹配结果', '--include': '只搜索与指定模式匹配的文件', '--exclude': '排除与指定模式匹配的文件' },
        values: ['-e', '-A', '-B', '-C', '-m', '--color', '--exclude', '--include'] },
    find: { desc: '在目录树中查找文件',
        flags: { '-name': '按文件名匹配（支持通配符）', '-iname': '按文件名匹配（忽略大小写）', '-type': '按文件类型匹配（f 文件、d 目录、l 链接）', '-size': '按文件大小匹配（如 +1M、-100k）', '-mtime': '按修改时间匹配（单位：天，如 -7 表示 7 天内）', '-exec': '对每个匹配结果执行指定命令', '-delete': '删除匹配到的文件', '-maxdepth': '限制向下搜索的最大目录深度', '-mindepth': '限制向下搜索的最小目录深度', '-perm': '按权限匹配（如 644）', '-user': '按属主用户名匹配', '-group': '按属组名匹配', '-print': '打印匹配结果（默认行为）', '-print0': '以 NUL 分隔输出（配合 xargs -0 安全处理含空格的文件名）', '-empty': '只匹配空文件或空目录' },
        values: ['-name', '-iname', '-type', '-size', '-mtime', '-exec', '-maxdepth', '-mindepth', '-perm', '-user', '-group', '-path', '-newer'] },
    sed: { desc: '流编辑器：按脚本对文本做替换/删除/打印',
        flags: { '-n': '静默模式：只输出显式打印（p 命令）的行', '-e': '指定要执行的编辑脚本（可多次使用）', '-f': '从文件读取编辑脚本', '-i': '直接修改原文件（原地编辑）', '-r': '使用扩展正则表达式（GNU）', '-E': '使用扩展正则表达式（与 -r 相同）', '-s': '把多个文件当作独立流处理', '-u': '不缓冲输出（实时输出）', '-z': '以 NUL 而非换行分隔记录', '--follow-symlinks': '原地编辑时跟随符号链接' },
        values: ['-e', '-f', '-l'] },
    awk: { desc: '文本处理语言：按字段切分并处理每一行',
        flags: { '-F': '指定字段分隔符（如 -F: 按冒号切分）', '-v': '定义变量（在程序开始前赋值）', '-f': '从文件读取 awk 程序', '--field-separator': '与 -F 相同，指定字段分隔符', '-W': '指定实现相关的选项', '-b': '以字节模式处理多字节字符', '-d': '把程序的字节码写入文件（调试用）', '-D': '生成程序的反汇编调试描述' },
        values: ['-F', '-v', '-f', '--field-separator'] },
    tar: { desc: '打包/解包归档文件',
        flags: { '-c': '创建新的归档文件', '-x': '从归档中解出文件', '-t': '列出归档中的文件（不解出）', '-v': '显示处理过程中的文件名', '-f': '指定归档文件名（其后紧跟文件名）', '-z': '用 gzip 压缩/解压（.tar.gz）', '-j': '用 bzip2 压缩/解压（.tar.bz2）', '-J': '用 xz 压缩/解压（.tar.xz）', '-C': '解压或打包时先切换到指定目录', '-p': '解压时保留原文件的权限', '--exclude': '排除匹配的文件或目录', '-k': '解压时不覆盖已存在的文件', '--strip-components': '解压时去掉开头的若干层目录', '--wildcards': '在模式中使用通配符匹配', '--totals': '完成后显示总字节数' },
        values: ['-f', '-C', '--exclude', '--strip-components'] },
    curl: { desc: '发起 HTTP(S) 请求、下载或上传数据',
        flags: { '-X': '指定 HTTP 请求方法（如 GET、POST、PUT、DELETE）', '-H': '添加自定义请求头', '-d': '发送请求体数据（默认 POST）', '-o': '把响应保存到指定文件', '-O': '按远程文件名保存响应', '-L': '跟随服务器重定向', '-k': '忽略证书校验错误（自签证书时用，不安全）', '-u': '指定用户名和密码做认证（user:pass）', '-A': '自定义 User-Agent', '-b': '发送 Cookie（文件或字符串）', '-c': '把响应中的 Cookie 保存到文件', '-s': '静默模式：不输出进度与错误', '-v': '显示请求与响应的详细过程', '-S': '有错误时也显示错误信息（常与 -s 联用）', '-F': '以 multipart 表单上传字段或文件', '--max-time': '整个传输的最长耗时（秒），超时则中断请求' },
        values: ['-X', '-H', '-d', '-o', '-A', '-b', '-c', '-F', '--max-time', '-w', '--data-raw', '--data-urlencode', '-e', '--connect-timeout', '-u'] },
    wget: { desc: '从网络下载文件',
        flags: { '-O': '把下载内容保存到指定文件', '-q': '安静模式：不输出下载信息', '-c': '断点续传未完成的文件', '-r': '递归下载链接指向的资源', '-np': '递归时不向上回溯到父目录', '-P': '把下载的文件保存到指定目录', '--no-check-certificate': '下载时不校验服务器证书（不安全）', '-U': '自定义 User-Agent', '--limit-rate': '限制下载速度（如 200k）', '-b': '转入后台下载，日志写入 wget-log', '-i': '从文件读取 URL 列表批量下载', '-N': '只下载比本地文件更新的版本', '--spider': '只检查链接是否有效，不下载内容', '-A': '只下载指定后缀的文件', '-R': '不下载指定后缀的文件' },
        values: ['-O', '-P', '-U', '--limit-rate', '-i', '-A', '-R'] },
    ssh: { desc: '登录远程主机或建立隧道',
        flags: { '-p': '指定远程主机的 SSH 端口', '-i': '指定身份认证用的私钥文件', '-l': '指定登录远程主机的用户名', '-v': '显示连接过程的调试信息（越多越详细）', '-N': '连接成功后不执行远程命令（配合转发使用）', '-f': '连接成功后转入后台运行', '-L': '建立本地端口转发（本地端口→远程主机）', '-R': '建立远程端口转发（远程端口→本地主机）', '-D': '建立动态端口转发（SOCKS 代理）', '-o': '指定配置项（如 StrictHostKeyChecking=no）', '-X': '开启 X11 图形转发', '-C': '压缩传输数据', '-T': '不分配伪终端（执行单条命令时）', '-q': '安静模式：不输出警告与提示信息', '-Y': '开启可信的 X11 转发' },
        values: ['-p', '-i', '-l', '-L', '-R', '-D', '-o'] },
    scp: { desc: '通过 SSH 在主机之间复制文件',
        flags: { '-P': '指定远程主机的 SSH 端口（大写 P）', '-r': '递归复制整个目录', '-i': '指定身份认证用的私钥文件', '-v': '显示传输过程的调试信息', '-C': '传输时压缩数据', '-p': '保留原文件的修改时间与权限', '-q': '安静模式：不显示进度', '-o': '指定 SSH 配置项', '-l': '限制传输带宽（单位 Kbit/s）', '-B': '以批处理模式运行（不询问密码）', '-3': '通过本地主机中转两台远程主机之间的复制' },
        values: ['-P', '-i', '-l', '-o'] },
    rsync: { desc: '高效同步文件与目录（增量传输）',
        flags: { '-a': '归档模式（递归＋保留权限/时间/链接，等同于 -rlptgoD）', '-v': '显示传输过程', '-z': '传输时压缩数据', '-r': '递归同步目录', '-u': '只传输比目标更新的文件', '-n': '试运行：只列出将要做的操作，不实际传输', '--delete': '删除目标端多余的文件（与源保持一致）', '--exclude': '排除匹配的文件或目录', '-P': '显示进度并支持断点续传（等同于 --partial --progress）', '-e': '指定远程 shell 命令（如 ssh -p 2222）', '--progress': '显示每个文件的传输进度', '-h': '以人类可读格式显示数字', '-c': '按内容校验和决定是否传输（而非时间与大小）', '--dry-run': '与 -n 相同，试运行', '-l': '同步时保留符号链接' },
        values: ['-e', '--exclude'] },
    chmod: { desc: '修改文件或目录的权限',
        flags: { '-R': '递归修改目录下所有文件与子目录的权限', '-v': '显示每个被修改的文件', '-c': '只显示被实际修改的文件', '-f': '抑制错误提示', '--reference': '以另一个文件的权限作为模板', '--preserve-root': '拒绝递归修改根目录 /（默认保护）', '--no-preserve-root': '取消对根目录 / 的保护（极度危险）', '--changes': '与 -c 相同，只报告被修改的文件' },
        values: ['--reference'] },
    chown: { desc: '修改文件或目录的属主/属组',
        flags: { '-R': '递归修改目录下所有文件与子目录的属主', '-v': '显示每个被修改的文件', '-c': '只显示被实际修改的文件', '-f': '抑制错误提示', '--reference': '以另一个文件的属主作为模板', '--from': '只修改当前属主符合指定条件的文件', '-h': '修改符号链接本身而非它指向的文件', '--dereference': '修改符号链接指向的文件（默认）', '--no-dereference': '修改符号链接本身', '-L': '遍历时跟随符号链接', '-P': '遍历时不跟随符号链接（默认）' },
        values: ['--reference', '--from'] },
    ps: { desc: '查看当前运行的进程',
        flags: { '-e': '显示所有进程', '-A': '与 -e 相同，显示所有进程', '-f': '显示完整格式（UID/PID/PPID/启动时间/命令）', '-u': '只显示指定用户的进程', '-p': '只显示指定 PID 的进程', '-o': '自定义输出列（如 -o pid,ppid,cmd）', '--sort': '按指定列排序（前加 - 表示倒序）', '--forest': '以树形显示进程父子关系', '-l': '显示长格式（含优先级与内存信息）', '-j': '显示作业格式（会话/进程组信息）', '-H': '显示进程层级关系（不合并线程）', '-w': '宽格式输出，不截断命令行', '--no-headers': '输出时不显示列标题', '-T': '只显示当前终端下的进程' },
        values: ['-u', '-p', '-o', '--sort'] },
    kill: { desc: '向进程发送信号',
        flags: { '-l': '列出所有可用信号名', '-s': '指定要发送的信号（如 -s TERM）', '-9': '发送 SIGKILL，强制立即终止进程', '-15': '发送 SIGTERM，请求进程自行退出（默认）', '-1': '发送 SIGHUP，通知进程重新加载配置', '-2': '发送 SIGINT，相当于按 Ctrl+C 中断', '-3': '发送 SIGQUIT，请求进程退出并生成 core', '-6': '发送 SIGABRT，请求进程异常终止', '--': '结束选项，后续内容按 PID 处理' },
        values: ['-s'] },
    systemctl: { desc: '管理系统服务（systemd）',
        flags: { '--now': '立即执行（与 enable/disable 联用时同时启停）', '--user': '操作当前用户的服务（而非系统服务）', '--no-pager': '输出不分页（直接全部打印）', '--failed': '只列出启动失败的单元', '--all': '列出所有单元（含未激活）', '-l': '显示完整内容（不截断）', '--full': '与 -l 相同，显示完整内容', '--type': '按单元类型筛选（如 service、timer）' },
        values: ['--type'],
        sub: { start: '启动指定服务', stop: '停止指定服务', restart: '重启指定服务', status: '查看服务状态与最近日志', enable: '设置服务开机自启', disable: '取消服务开机自启', reload: '重新加载服务配置（不重启进程）', 'daemon-reload': '重新加载 systemd 单元文件', 'is-active': '查询服务是否正在运行', 'is-enabled': '查询服务是否开机自启', 'list-units': '列出所有单元', 'list-unit-files': '列出单元文件与启用状态' } },
    journalctl: { desc: '查看 systemd 日志',
        flags: { '-f': '持续跟踪新写入的日志（类似 tail -f）', '-n': '只显示最近若干行日志', '-u': '只显示指定 systemd 单元的日志', '-p': '只显示指定优先级及以上的日志', '--since': '只显示指定时间之后的日志', '--until': '只显示指定时间之前的日志', '-x': '在日志条目后附加解释说明', '-b': '只显示本次启动后的日志', '-k': '只显示内核日志', '-o': '指定日志输出格式（如 short、json）', '--no-pager': '输出不分页（直接全部打印）', '-r': '按时间倒序显示日志', '-e': '显示到日志末尾并分页查看', '--disk-usage': '显示日志占用的磁盘空间' },
        values: ['-n', '-u', '-p', '--since', '--until', '-o', '-g'] },
    git: { desc: '分布式版本控制',
        flags: { '-m': '提交时附带说明文字（commit 用）', '-a': '提交前自动暂存已跟踪文件的改动（commit 用）', '--amend': '修改最近一次提交，不产生新提交（commit 用）', '--oneline': '每条提交只显示一行摘要（log 用）', '--graph': '以 ASCII 图形显示分支走向（log 用）', '--all': '显示所有分支的提交（log 用）', '-u': '推送时建立上游跟踪关系（push 用）', '--force': '强制推送，覆盖远程历史（危险，push 用）', '--depth': '只克隆指定深度的历史（clone 用）', '--branch': '只克隆指定分支（clone 用）', '--stat': '显示每次提交改动的文件统计（log 用）', '--since': '只显示指定时间之后的提交（log 用）', '--author': '只显示指定作者的提交（log 用）', '--hard': '重置时同时丢弃工作区改动（reset 用，危险）', '--tags': '推送时同时推送标签（push 用）' },
        values: ['-m', '--depth', '--branch', '--since', '--author'],
        sub: { clone: '克隆远程仓库到本地', add: '把文件改动加入暂存区', commit: '把暂存区改动提交为新版本', push: '把本地提交推送到远程仓库', pull: '拉取远程更新并合并到当前分支', status: '查看工作区与暂存区的状态', log: '查看提交历史', checkout: '切换分支或恢复文件', branch: '管理分支（创建/查看/删除）', merge: '把指定分支合并到当前分支', rebase: '把当前分支变基到指定分支上', stash: '临时保存未提交的改动', reset: '重置 HEAD 与暂存区/工作区', diff: '查看未暂存的改动', fetch: '拉取远程更新但不合并', tag: '管理版本标签', remote: '管理远程仓库地址', show: '查看某次提交或对象的详情', restore: '恢复文件（checkout 的现代替代）', switch: '切换分支（checkout 的现代替代）' } },
    docker: { desc: '容器管理',
        flags: { '-d': '以后台守护进程方式运行容器（run 用）', '-i': '保持标准输入打开（常与 -t 联用）', '-t': '分配伪终端（交互式容器）', '--rm': '容器退出后自动删除', '-p': '把容器端口映射到主机端口', '-v': '把主机目录或卷挂载到容器内', '-e': '设置容器内的环境变量', '--name': '给容器指定名称', '--network': '指定容器连接的网络', '-w': '设置容器内的工作目录', '-u': '指定容器内运行的用户', '--entrypoint': '覆盖镜像默认的入口命令', '-a': '显示所有容器（含已停止，ps 用）', '-q': '只输出容器或镜像 ID', '-f': '按条件过滤列表' },
        values: ['-p', '-v', '-e', '--name', '--network', '-w', '-u', '--entrypoint', '--tail', '-f'],
        sub: { run: '创建并启动容器', ps: '列出容器', images: '列出本地镜像', exec: '在运行中的容器内执行命令', stop: '停止容器', start: '启动已停止的容器', rm: '删除已停止的容器', rmi: '删除镜像', pull: '拉取镜像', push: '推送镜像', logs: '查看容器日志', build: '构建镜像', cp: '在主机与容器之间复制文件' } }
};

var COMMAND_NAMES = Object.keys(DICT);

var REDIRECT_OPS = { '>': '将输出重定向到文件（覆盖原内容）', '>>': '将输出追加到文件末尾', '<': '从文件读取输入', '2>': '将标准错误重定向到文件', '2>>': '将标准错误追加到文件末尾', '&>': '将标准输出与标准错误都重定向到文件', '&>>': '将标准输出与标准错误都追加到文件末尾', '>&': '重定向输出（合并标准输出与标准错误）', '<<': 'here-doc：从后续行读取输入，直到定界符' };

var OPERATOR_DESC = {
    '|': '管道：将上一命令的标准输出作为下一命令的标准输入',
    '||': '或：仅当上一命令执行失败（退出码非 0）时执行下一命令',
    '&&': '与：仅当上一命令执行成功（退出码为 0）时执行下一命令',
    ';': '顺序执行：无论上一命令成功与否都执行下一命令',
    '&': '后台执行：该命令在后台运行，shell 立即继续'
};

/* ================= 错误辅助 ================= */

function badArg(field, message) {
    var e = new Error(message);
    e.field = field;
    return e;
}

function needString(v, field) {
    if (typeof v !== 'string') throw badArg(field, '参数必须是字符串');
}

/* ================= 词法切分 ================= */

function isSpace(ch) { return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r'; }

/* 识别多字符操作符：按长度优先匹配 */
var MULTI_OPS = ['||', '&&', '2>>', '2>', '&>>', '&>', '>>', '<<', '>&', '<&', '>|'];
var SINGLE_OPS = ['|', ';', '&', '>', '<'];

/* tokenizeShell(input) → { tokens: [{text, kind, quoted, quoteStart}], errors: [{message, pos}] }
 * kind: 'word' | 'op'；quoted: null | 'single' | 'double'（整 token 只要有一段被引号包裹即记）；
 * quoteStart: token 首字符是否为引号（--include="*.log" 为 false，"--include" 为 true），
 * 供 parseCommand 判定带引号的旗标是否仍认作旗标。
 * 处理：单引号（字面）、双引号（反斜杠转义 $ ` " \ 与换行）、反斜杠转义、
 * 反斜杠换行（续行）、操作符 | || && ; & > >> < << 2> 2>> &> >& 等。
 * 引号未闭合记入 errors（不抛错）；非法参数抛 Error，err.field='input'。 */
function tokenizeShell(input) {
    needString(input, 'input');
    var tokens = [];
    var errors = [];
    var i = 0, n = input.length;
    var cur = '', curQuoted = null, hasCur = false, curQuoteStart = false;
    function flush() {
        if (hasCur) {
            tokens.push({ text: cur, kind: 'word', quoted: curQuoted, quoteStart: curQuoteStart });
            cur = ''; curQuoted = null; hasCur = false; curQuoteStart = false;
        }
    }
    function pushOp(op) {
        flush();
        tokens.push({ text: op, kind: 'op', quoted: null, quoteStart: false });
    }
    while (i < n) {
        var ch = input[i];
        if (isSpace(ch)) { flush(); i++; continue; }
        /* 续行：反斜杠 + 换行 */
        if (ch === '\\' && i + 1 < n && (input[i + 1] === '\n' || input[i + 1] === '\r')) {
            i += 2;
            if (input[i] === '\n') i++;
            continue;
        }
        if (ch === '\\' && i + 1 < n) { cur += input[i + 1]; hasCur = true; i += 2; continue; }
        if (ch === "'") {
            if (!hasCur) curQuoteStart = true;
            var end = input.indexOf("'", i + 1);
            if (end === -1) {
                errors.push({ message: '单引号未闭合', pos: i });
                cur += input.slice(i + 1); hasCur = true; curQuoted = curQuoted || 'single';
                i = n;
            } else {
                cur += input.slice(i + 1, end); hasCur = true; curQuoted = curQuoted || 'single';
                i = end + 1;
            }
            continue;
        }
        if (ch === '"') {
            if (!hasCur) curQuoteStart = true;
            var j = i + 1, buf = '', closed = false;
            while (j < n) {
                var c = input[j];
                if (c === '\\' && j + 1 < n && (input[j + 1] === '"' || input[j + 1] === '\\' || input[j + 1] === '$' || input[j + 1] === '`')) { buf += input[j + 1]; j += 2; continue; }
                if (c === '\\' && j + 1 < n && input[j + 1] === '\n') { j += 2; continue; }
                if (c === '"') { closed = true; break; }
                buf += c; j++;
            }
            if (!closed) errors.push({ message: '双引号未闭合', pos: i });
            cur += buf; hasCur = true; curQuoted = curQuoted || 'double';
            i = closed ? j + 1 : n;
            continue;
        }
        /* 操作符（多字符优先） */
        var matched = null;
        for (var k = 0; k < MULTI_OPS.length; k++) {
            var op = MULTI_OPS[k];
            if (input.slice(i, i + op.length) === op) { matched = op; break; }
        }
        if (matched) { pushOp(matched); i += matched.length; continue; }
        if (SINGLE_OPS.indexOf(ch) !== -1) { pushOp(ch); i++; continue; }
        cur += ch; hasCur = true; i++;
    }
    flush();
    return { tokens: tokens, errors: errors };
}

/* 展示用：按原引号还原 token 文本（引号在切分时已去掉） */
function quoteToken(tok) {
if (tok.kind === 'op') return tok.text;
if (tok.quoted === 'single') return "'" + tok.text + "'";
if (tok.quoted === 'double') return '"' + tok.text + '"';
if (/[\s|&;<>$`"'\\]/.test(tok.text)) return "'" + tok.text.replace(/'/g, "'\\''") + "'";
return tok.text;
}

/* ================= 组合短旗标拆分 ================= */

/* splitFlags('-rf') → ['-r','-f']；长旗标/单旗标原样返回；'--' → []。
 * 含 '=' 的长旗标（如 --color=always）返回 ['--color']；非旗标原样返回。 */
function splitFlags(token) {
    needString(token, 'flag');
    if (token === '--') return [];
    if (token.slice(0, 2) === '--') {
        var eq = token.indexOf('=');
        return [eq === -1 ? token : token.slice(0, eq)];
    }
    if (token[0] === '-' && token.length > 1 && token[1] !== '-') {
        /* 数字信号（如 kill -9）与带值短旗标（如 -p8080）不拆分 */
        if (/^-[0-9]+$/.test(token)) return [token];
        var body = token.slice(1);
        if (/^[A-Za-z]+$/.test(body)) {
            return body.split('').map(function (c) { return '-' + c; });
        }
        return [token];
    }
    return [token];
}

/* ================= 旗标释义 ================= */

function lookupFlag(cmd, flag) {
    var entry = DICT[cmd];
    if (!entry) return null;
    if (entry.flags && entry.flags[flag]) return entry.flags[flag];
    return null;
}

/* explainFlag('ls','-l') → '以长格式列出详细信息…'；explainFlag('grep','-r') → '递归搜索子目录'。
 * 组合短旗标（如 '-rf'）逐个释义后以 '；' 连接；未知命令/旗标返回 null（不编造）。
 * 非法参数抛 Error，err.field 为 'command' 或 'flag'。 */
function explainFlag(cmd, flag) {
    needString(cmd, 'command');
    needString(flag, 'flag');
    if (!DICT[cmd]) return null;
    var base = flag;
    var eq = flag.indexOf('=');
    if (eq !== -1 && flag.slice(0, 2) === '--') base = flag.slice(0, eq);
    var direct = lookupFlag(cmd, base);
    if (!direct && DICT[cmd].sub && DICT[cmd].sub[base]) direct = DICT[cmd].sub[base];

    if (direct) return direct;
    /* 附着值短旗标：如 -p8080 → -p 的释义（值附在后面） */
    if (/^-[A-Za-z]/.test(base) && base.length > 2) {
        var first = '-' + base[1];
        var fd = lookupFlag(cmd, first);
        if (fd && isValueFlag(cmd, first)) return fd + '（值：' + base.slice(2) + '）';
    }
    /* 组合短旗标：逐个释义 */
    if (base[0] === '-' && base[1] !== '-' && base.length > 2) {
        var parts = splitFlags(base);
        var descs = [];
        for (var i = 0; i < parts.length; i++) {
            var d = lookupFlag(cmd, parts[i]);
            if (!d) return null;
            descs.push(parts[i] + '：' + d);
        }
        return descs.join('；');
    }
    return null;
}

function commandDesc(cmd) {
    return DICT[cmd] ? DICT[cmd].desc : null;
}

function isValueFlag(cmd, flag) {
    var entry = DICT[cmd];
    if (!entry || !entry.values) return false;
    return entry.values.indexOf(flag) !== -1;
}

function listCommands() {
    return COMMAND_NAMES.map(function (name) {
        return { name: name, desc: DICT[name].desc, flagCount: Object.keys(DICT[name].flags).length };
    });
}

/* ================= 命令结构解析 ================= */

/* parseCommand(input) → { segments, errors, unknown, dangers}
* segment: { index, raw, command, commandDesc, knownCommand, sudo, subcommand,
* subcommandDesc, flags: [{flag, value, desc, known}], positionals: [{text, desc}],
* redirects: [{op, target, desc}], operatorBefore: {op, desc} | null}
* unknown: [{type:'command'|'flag', command, flag?}]；非法参数抛 Error，err.field='input'。 */
function parseCommand(input) {
needString(input, 'input');
var tk = tokenizeShell(input);
var segments = [];
var unknown = [];
var cur = null;
function newSegment(opBefore) {
cur = { index: segments.length, raw: '', command: null, commandDesc: null,
knownCommand: false, sudo: false, subcommand: null, subcommandDesc: null,
flags: [], positionals: [], redirects: [], operatorBefore: opBefore || null,
_words: []};
segments.push(cur);
return cur;
}
newSegment(null);
var pendingRedirect = null;
var afterDashDash = false;
var expectExecEnd = false; /* find -exec …; 期间把内容当作 -exec 的值 */
var i, tok;
for (i = 0; i < tk.tokens.length; i++) {
tok = tk.tokens[i];
if (tok.kind === 'op') {
if (expectExecEnd && tok.text === ';') {
cur._words.push(tok);
expectExecEnd = false;
if (cur.flags.length) cur.flags[cur.flags.length - 1].value += ' ;';
continue;
}
if (REDIRECT_OPS[tok.text]) { pendingRedirect = tok.text; continue;}
if (tok.text === ';' || tok.text === '|' || tok.text === '||' || tok.text === '&&' || tok.text === '&') {
newSegment({ op: tok.text, desc: OPERATOR_DESC[tok.text] || tok.text});
pendingRedirect = null; afterDashDash = false; expectExecEnd = false;
continue;
}
continue;
}
var word = tok.text;
if (expectExecEnd) {
cur._words.push(tok);
if (cur.flags.length) cur.flags[cur.flags.length - 1].value += ' ' + word;
continue;
}
if (pendingRedirect) {
cur._words.push({ text: pendingRedirect, kind: 'op', quoted: null });
cur._words.push(tok);
cur.redirects.push({ op: pendingRedirect, target: word, desc: REDIRECT_OPS[pendingRedirect] || pendingRedirect});
pendingRedirect = null;
continue;
}
cur._words.push(tok);
if (cur.command === null) {
if (word === 'sudo' &&!cur.sudo) { cur.sudo = true; continue;}
cur.command = word;
cur.knownCommand =!!DICT[word];
cur.commandDesc = DICT[word]? DICT[word].desc: null;
if (!cur.knownCommand && word!== '') {
unknown.push({ type: 'command', command: word});
}
continue;
}
/* 子命令（git/docker 第一位置参数） */
var entry = DICT[cur.command];
if (entry && entry.sub &&!cur.subcommand && cur.positionals.length === 0 && cur.flags.length === 0 && entry.sub[word]) {
cur.subcommand = word;
cur.subcommandDesc = entry.sub[word];
continue;
}
/* 选项结束符 */
if (word === '--' &&!afterDashDash) { afterDashDash = true; continue;}
/* 旗标：全程被引号包裹的 token（引号在首字符，如 "--include"）不是旗标；
 * 旗标中段才出现引号（如 --include="*.log"）仍按旗标解析 */
if (!afterDashDash && word[0] === '-' && word.length > 1 && !tok.quoteStart) {
var flagParts, attachedVal = null;
/* --flag=value：splitFlags 会丢弃 =value（其契约注释行称含 '=' 的长旗标只返回旗标名），
 * 故先在此取出内联值；带值长旗标有了内联值就不再吞下一个 token */
var wordInlineVal = null;
if (word.slice(0, 2) === '--') {
var wEq = word.indexOf('=');
if (wEq !== -1) wordInlineVal = word.slice(wEq + 1);
}
if (DICT[cur.command] && DICT[cur.command].flags[word]) { flagParts = [word]; }
else if (word.length > 2 && word[0] === '-' && word[1] !== '-' && isValueFlag(cur.command, '-' + word[1])) { flagParts = ['-' + word[1]]; attachedVal = word.slice(2); }
else { flagParts = splitFlags(word); }
for (var f = 0; f < flagParts.length; f++) {
var fl = flagParts[f];
var base = fl, inlineVal = (attachedVal !== null && f === 0) ? attachedVal : null;
if (wordInlineVal !== null && f === 0) inlineVal = wordInlineVal;
var eqIdx = fl.indexOf('=');
if (eqIdx!== -1) { base = fl.slice(0, eqIdx); inlineVal = fl.slice(eqIdx + 1);}
var desc = explainFlag(cur.command, base);
var val = inlineVal;
if (val === null && isValueFlag(cur.command, base) && f === flagParts.length - 1) {
if (i + 1 < tk.tokens.length && tk.tokens[i + 1].kind === 'word') {
/* find -exec：吞到分号为止 */
if (cur.command === 'find' && base === '-exec') {
val = tk.tokens[i + 1].text; i++; cur._words.push(tk.tokens[i]);
while (i + 1 < tk.tokens.length && tk.tokens[i + 1].text!== ';') { i++; val += ' ' + tk.tokens[i].text; cur._words.push(tk.tokens[i]);}
expectExecEnd = true;
} else {
val = tk.tokens[i + 1].text; i++; cur._words.push(tk.tokens[i]);
}
}
}
cur.flags.push({ flag: base, value: val, desc: desc, known:!!desc});
if (!desc) unknown.push({ type: 'flag', command: cur.command, flag: base});
}
continue;
}
/* 位置参数 */
var posDesc = positionalDesc(cur, word);
cur.positionals.push({ text: word, desc: posDesc});
}
/* raw 文本与收尾 */
segments.forEach(function (seg) {
seg.raw = seg._words.map(quoteToken).join(' ');
delete seg._words;
});
/* 去掉尾部空段（以操作符结尾时） */
while (segments.length > 1 &&!segments[segments.length - 1].command) segments.pop();
var dangers = detectDanger(input);
return { segments: segments, errors: tk.errors, unknown: unknown, dangers: dangers};
}

function positionalDesc(seg, word) {
if (seg.command === 'cd') {
if (word === '-') return '回到上一次所在的目录';
if (word === '~') return '当前用户的家目录';
if (word === '..') return '上一级目录';
if (word === '.') return '当前目录';
return '要切换到的目标目录';
}
if (seg.command === 'rm' || seg.command === 'cp' || seg.command === 'mv') return '操作的目标路径';
if (seg.command === 'chmod' || seg.command === 'chown') {
if (/^[0-7]{3,4}$/.test(word) || /^[ugoa]*[+-=][rwxXst]*$/.test(word)) return '权限模式';
return '操作的目标路径';
}
if (seg.command === 'grep' || seg.command === 'sed' || seg.command === 'awk') {
if (seg.positionals.length === 0) return '搜索/处理的模式或程序';
return '要搜索的文件或目录';
}
if (seg.command === 'find') return '开始搜索的目录';
if (seg.command === 'tar') {
/* 归档名已被 -f 吞作旗标值时，首个位置参数即为打包/解出目标，不再是归档名 */
var hasArchive = seg.flags.some(function (f) { return f.flag === '-f' && f.value !== null && f.value !== undefined; });
if (!hasArchive && seg.positionals.length === 0) return '归档文件名';
return '要打包/解出的文件或目录';
}
if (seg.command === 'curl' || seg.command === 'wget') {
if (/^https?:\/\//.test(word) || /^[a-z0-9.-]+\.[a-z]{2,}/i.test(word)) return '请求的网址';
return '请求参数或网址';
}
if (seg.command === 'ssh' || seg.command === 'scp' || seg.command === 'rsync') {
if (word.indexOf('@')!== -1 || word.indexOf(':')!== -1) return '远程主机地址（[用户@]主机[:路径]）';
return '本地路径或远程路径';
}
if (seg.command === 'kill') return '目标进程的 PID';
if (seg.command === 'ps') return '筛选条件';
if (seg.command === 'systemctl' || seg.command === 'journalctl') return '服务单元名或筛选条件';
if (seg.command === 'docker') return (word.indexOf(':') !== -1 || word.indexOf('/') !== -1) ? '容器镜像' : '子命令参数或目标';
if (seg.command === 'git') return '子命令参数或目标';
if (/^\//.test(word) || word === '~' || word.indexOf('/')!== -1) return '文件或目录路径';
return '参数';
}

/* ================= 危险检测 ================= */

/* detectDanger(input) → [{level:'critical'|'warning', rule, message, segment}]
* 命中规则：rm -rf /、--no-preserve-root、chmod 777、curl|sh、dd of=/dev/、
* mkfs、重定向到设备、fork 炸弹。安全命令返回 []。非法参数抛 Error，err.field='input'。 */
function detectDanger(input) {
needString(input, 'input');
var out = [];
var parsed;
try { parsed = parseCommandShallow(input);} catch (e) { parsed = null;}
var segs = parsed? parsed.segments: [];
function add(level, rule, message, segIdx) {
out.push({ level: level, rule: rule, message: message, segment: segIdx});
}
segs.forEach(function (seg, idx) {
var flags = seg.flags.map(function (f) { return f.flag;});
var hasR = flags.indexOf('-r')!== -1 || flags.indexOf('-R')!== -1;
var hasF = flags.indexOf('-f')!== -1;
var targets = seg.positionals.map(function (p) { return p.text;});
var rootTarget = targets.some(function (t) {
return t === '/' || t === '/*' || t === '/ *' || t === '~' || t === '$HOME' || t === '${HOME}' || t === '/.' || t === '/*.*';
});
if (seg.command === 'rm') {
if (flags.indexOf('--no-preserve-root')!== -1) {
add('critical', 'no-preserve-root', 'rm 使用了 --no-preserve-root：取消了对根目录的保护，配合 -r 可删除整个系统', idx);
}
if ((hasR || hasF) && rootTarget) {
add('critical', 'rm-rf-root', 'rm -rf 的目标是 ' + (targets[0] || '/') + '：这会删除整个系统或家目录，数据无法恢复', idx);
} else if (hasR && hasF) {
add('warning', 'rm-rf', 'rm -rf 会递归强制删除且不询问：请先确认目标路径无误，误删无法恢复', idx);
}
}
if (seg.command === 'chmod' && flags.indexOf('--no-preserve-root')!== -1) {
add('critical', 'no-preserve-root', 'chmod 使用了 --no-preserve-root：取消了对根目录的保护', idx);
}
if (seg.command === 'chmod') {
var mode = targets.filter(function (t) { return /^0?[47]?777$/.test(t);})[0];
if (mode) add('warning', 'chmod-777', 'chmod ' + mode + ' 会让所有用户可读可写可执行：通常只需 755（目录）或 644（文件）', idx);
}
if (seg.command === 'dd') {
var ofArg = seg.positionals.concat(seg.flags.map(function (f) { return { text: (f.flag || '') + (f.value ? '=' + f.value : '') }; })).map(function (p) { return p.text; }).filter(function (t) { return t.indexOf('of=') === 0; })[0];
if (ofArg && /^of=\/dev\/(sd|nvme|vd|hd|mmcblk)/.test(ofArg)) {
add('critical', 'dd-of-device', 'dd 的输出目标是块设备 ' + ofArg.slice(3) + '：会直接覆盖磁盘数据，目标盘分区表与数据都会丢失', idx);
}
}
if (seg.command === 'mkfs' || seg.command === 'mkfs.ext4' || seg.command === 'mkfs.xfs') {
if (targets.some(function (t) { return t.indexOf('/dev/') === 0;})) {
add('critical', 'mkfs-device', 'mkfs 会格式化设备 ' + targets[0] + '：该设备上的全部数据将被清空', idx);
}
}
seg.redirects.forEach(function (r) {
if ((r.op === '>' || r.op === '>>') && /^\/dev\/(sd|nvme|vd|hd|mmcblk)/.test(r.target)) {
add('critical', 'redirect-to-device', '重定向输出到块设备 ' + r.target + '：会直接覆盖磁盘数据', idx);
}
});
/* 管道执行远程脚本：curl|sh / wget|bash */
if ((seg.command === 'curl' || seg.command === 'wget') && seg.operatorBefore === null && segs[idx + 1]) {
var next = segs[idx + 1];
if (next.operatorBefore && next.operatorBefore.op === '|' &&
(next.command === 'sh' || next.command === 'bash' || next.command === 'zsh')) {
add('critical', 'pipe-to-shell', seg.command + ' 下载的内容被直接管道给 ' + next.command + ' 执行：远程脚本未经检查就以当前用户权限运行，极度危险', idx);
}
}
});
if (/:?\(?\)?\{/.test(input)) {
add('critical', 'fork-bomb', '检测到 fork 炸弹模式（:(){:|:&};:）：会无限创建进程耗尽系统资源', -1);
}
return out;
}

/* 供 detectDanger 内部使用的浅解析：避免 detectDanger ↔ parseCommand 互相递归 */
function parseCommandShallow(input) {
var tk = tokenizeShell(input);
var segments = [];
var cur = null;
function newSeg(opBefore) {
cur = { index: segments.length, command: null, flags: [], positionals: [], redirects: [], operatorBefore: opBefore || null, _words: []};
segments.push(cur);
return cur;
}
newSeg(null);
var pendingRedirect = null;
var afterDashDash = false;
for (var i = 0; i < tk.tokens.length; i++) {
var tok = tk.tokens[i];
if (tok.kind === 'op') {
if (REDIRECT_OPS[tok.text]) { pendingRedirect = tok.text; continue;}
if (tok.text === ';' || tok.text === '|' || tok.text === '||' || tok.text === '&&' || tok.text === '&') {
newSeg({ op: tok.text, desc: OPERATOR_DESC[tok.text] || tok.text});
pendingRedirect = null; afterDashDash = false;
continue;
}
continue;
}
var word = tok.text;
if (pendingRedirect) {
cur.redirects.push({ op: pendingRedirect, target: word, desc: REDIRECT_OPS[pendingRedirect] || pendingRedirect});
pendingRedirect = null;
continue;
}
cur._words.push(word);
if (cur.command === null) {
if (word === 'sudo' &&!cur._sudo) { cur._sudo = true; continue;}
cur.command = word;
continue;
}
if (word === '--' &&!afterDashDash) { afterDashDash = true; continue;}
if (!afterDashDash && word[0] === '-' && word.length > 1 && !tok.quoteStart) {
/* --flag=value：与 parseCommand 同款，先取出内联值再拆旗标 */
var wordInlineVal = null;
if (word.slice(0, 2) === '--') {
var wEq = word.indexOf('=');
if (wEq !== -1) wordInlineVal = word.slice(wEq + 1);
}
var parts = splitFlags(word);
for (var f = 0; f < parts.length; f++) {
var fl = parts[f];
var eqIdx = fl.indexOf('=');
var base = eqIdx!== -1? fl.slice(0, eqIdx): fl;
var inlineVal = eqIdx!== -1? fl.slice(eqIdx + 1): null;
if (wordInlineVal !== null && f === 0) inlineVal = wordInlineVal;
var val = inlineVal;
if (val === null && isValueFlag(cur.command, base) && f === parts.length - 1) {
if (i + 1 < tk.tokens.length && tk.tokens[i + 1].kind === 'word') { val = tk.tokens[i + 1].text; i++;}
}
cur.flags.push({ flag: base, value: val});
}
continue;
}
cur.positionals.push({ text: word});
}
while (segments.length > 1 &&!segments[segments.length - 1].command) segments.pop();
return { segments: segments, errors: tk.errors};
}

/* ================= 完整解释 ================= */

/* explainCommand(input) → { input, segments, unknown, dangers, errors, plainText}
* plainText 为可一键复制的多行中文释义。非法参数抛 Error，err.field='input'。 */
function explainCommand(input) {
needString(input, 'input');
var parsed = parseCommand(input);
var lines = [];
lines.push('命令：' + input);
parsed.segments.forEach(function (seg, idx) {
lines.push('');
lines.push('命令 ' + (idx + 1) + '：' + (seg.raw || ''));
if (seg.sudo) lines.push(' sudo：以管理员权限执行后续命令');
if (seg.operatorBefore) lines.push(' 连接符 ' + seg.operatorBefore.op + '：' + seg.operatorBefore.desc);
if (seg.command) {
if (seg.knownCommand) {
lines.push(' ' + seg.command + '：' + seg.commandDesc);
if (seg.subcommand) lines.push(' 子命令 ' + seg.subcommand + '：' + seg.subcommandDesc);
} else {
lines.push(' ' + seg.command + '：未收录的命令（本工具词典暂未收录，含义未核实）');
}
}
seg.flags.forEach(function (f) {
if (f.known) lines.push(' ' + f.flag + (f.value!== null && f.value!== undefined? ' ' + f.value: '') + '：' + f.desc);
else lines.push(' ' + f.flag + '：未收录的旗标（本工具词典暂未收录，含义未核实）');
});
seg.positionals.forEach(function (p) {
lines.push(' 位置参数 ' + p.text + '：' + p.desc);
});
seg.redirects.forEach(function (r) {
lines.push(' 重定向 ' + r.op + ' ' + r.target + '：' + r.desc);
});
});
if (parsed.dangers.length) {
lines.push('');
lines.push('危险警示：');
parsed.dangers.forEach(function (d) {
lines.push(' [' + (d.level === 'critical'? '严重': '注意') + '] ' + d.message);
});
}
if (parsed.unknown.length) {
lines.push('');
lines.push('未收录：');
parsed.unknown.forEach(function (u) {
if (u.type === 'command') lines.push(' 未收录的命令：' + u.command);
else lines.push(' 未收录的旗标：' + u.command + ' ' + u.flag);
});
}
return {
input: input,
segments: parsed.segments,
unknown: parsed.unknown,
dangers: parsed.dangers,
errors: parsed.errors,
plainText: lines.join('\n')
};
}

/* ================= 输入校验 ================= */

/* validateShellInput(input)：非字符串抛 Error（err.field='input'）；
* 空内容或超过 4000 字符返回 {valid:false, field:'input', message}；否则 {valid:true}。 */
function validateShellInput(input) {
needString(input, 'input');
if (input.trim().length === 0) {
return { valid: false, field: 'input', message: '请先粘贴一条 shell 命令'};
}
if (input.length > MAX_INPUT) {
return { valid: false, field: 'input', message: '命令过长：最多 ' + MAX_INPUT + ' 字符，当前 ' + input.length + ' 字符'};
}
return { valid: true, field: 'input', message: ''};
}

var SE_CORE = {
MAX_INPUT: MAX_INPUT,
tokenizeShell: tokenizeShell,
splitFlags: splitFlags,
parseCommand: parseCommand,
explainFlag: explainFlag,
explainCommand: explainCommand,
detectDanger: detectDanger,
validateShellInput: validateShellInput,
listCommands: listCommands,
commandDesc: commandDesc
};

if (typeof module!== 'undefined' && module.exports) {
module.exports = SE_CORE;
}

/* 浏览器端挂 window.ShellExplainer；node 下导出纯函数以便单元测试 */
if (typeof window !== 'undefined') window.ShellExplainer = SE_CORE;

/* ================= DOM 层（仅浏览器） ================= */

if (typeof document !== 'undefined' && !(typeof module !== 'undefined' && module.exports)) {

function $(id) { return document.getElementById(id); }

function escHtml(s) {
    return String(s).replace(/[&<>\"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
}

var SAMPLES = [
    { name: '日志查错＋取前 50 行', cmd: 'grep -rn --include="*.log" "ERROR" /var/log | head -n 50' },
    { name: '清理 30 天前的临时文件', cmd: 'find /home -type f -name "*.tmp" -mtime +30 -delete' },
    { name: '打包网站目录（排除日志）', cmd: 'tar -czvf backup.tar.gz --exclude="*.log" /var/www/html' },
    { name: '同步发布目录到服务器', cmd: 'rsync -avz --delete -e "ssh -p 2222" ./dist/ user@server:/var/www/' },
    { name: '查看最耗内存的进程', cmd: 'ps aux --sort=-%mem | head -n 10' },
    { name: '改权限并重启服务', cmd: 'chmod -R 755 /var/www && systemctl restart nginx' },
    { name: '启动一个 Web 容器', cmd: 'docker run -d --name web -p 8080:80 -v /data:/app -e NODE_ENV=production nginx:latest' },
    { name: '批量替换后验证', cmd: "sed -i 's/foo/bar/g' config.txt && grep -n \"bar\" config.txt" },
    { name: 'SSH 端口转发', cmd: 'ssh -i ~/.ssh/id_rsa -p 2222 -L 8080:localhost:80 user@example.com' },
    { name: '下载并查看远程脚本（危险示例）', cmd: 'curl -sSL https://example.com/install.sh | sh' }
];

var lastPlainText = '';

function chipHtml(text, cls, title) {
    return '<span class="se-chip ' + cls + '"' + (title ? ' title="' + escHtml(title) + '"' : '') + '>' + escHtml(text) + '</span>';
}

function renderAll() {
    var input = $('se-input').value;
    var countEl = $('se-count');
    countEl.textContent = input.length + ' / ' + MAX_INPUT + ' 字符';
    countEl.style.color = input.length > MAX_INPUT ? '#dc2626' : '#6b7280';
    var v = validateShellInput(input);
    var errEl = $('se-error');
    if (!v.valid) {
        errEl.style.display = 'block';
        errEl.textContent = v.message;
        $('se-danger').style.display = 'none';
        $('se-strip').innerHTML = '';
        $('se-explain').innerHTML = '<div class="se-empty">粘贴一条 shell 命令后，这里会逐段讲解它的含义。</div>';
        $('se-table-wrap').innerHTML = '';
        $('se-unknown').innerHTML = '';
        lastPlainText = '';
        return;
    }
    errEl.style.display = 'none';
    var res;
    try { res = explainCommand(input); } catch (e) { errEl.style.display = 'block'; errEl.textContent = String((e && e.message) || e); return; }
    lastPlainText = res.plainText;
    /* 危险警示 */
    var dg = $('se-danger');
    if (res.dangers.length) {
        dg.style.display = 'block';
        dg.innerHTML = res.dangers.map(function (d) {
            return '<div class="se-danger-item se-' + d.level + '"><span aria-hidden="true">' + (d.level === 'critical' ? '⛔' : '⚠️') + '</span><div><b>' + (d.level === 'critical' ? '严重危险' : '注意') + '：</b>' + escHtml(d.message) + '</div></div>';
        }).join('');
    } else { dg.style.display = 'none'; }
    /* 分段高亮条带 */
    var strip = [];
    res.segments.forEach(function (seg) {
        if (seg.operatorBefore) strip.push(chipHtml(seg.operatorBefore.op, 'se-op', seg.operatorBefore.desc));
        if (seg.sudo) strip.push(chipHtml('sudo', 'se-cmd', '以管理员权限执行后续命令'));
        if (seg.command) strip.push(chipHtml(seg.command, seg.knownCommand ? 'se-cmd' : 'se-unknown-chip', seg.knownCommand ? seg.commandDesc : '未收录的命令'));
        if (seg.subcommand) strip.push(chipHtml(seg.subcommand, 'se-sub', seg.subcommandDesc));
        seg.flags.forEach(function (f) {
            strip.push(chipHtml(f.flag + (f.value !== null && f.value !== undefined ? ' ' + f.value : ''), f.known ? 'se-flag' : 'se-unknown-chip', f.known ? f.desc : '未收录的旗标'));
        });
        seg.positionals.forEach(function (p) { strip.push(chipHtml(p.text, 'se-arg', p.desc)); });
        seg.redirects.forEach(function (r) { strip.push(chipHtml(r.op + ' ' + r.target, 'se-redir', r.desc)); });
    });
    $('se-strip').innerHTML = strip.join(' ');
    /* 逐段释义 */
    var html = '';
    res.segments.forEach(function (seg, idx) {
        html += '<div class="se-seg"><div class="se-seg-head"><span class="se-seg-no">' + (idx + 1) + '</span><code>' + escHtml(seg.raw || '') + '</code></div>';
        if (seg.operatorBefore) html += '<div class="se-line"><span class="se-tag">连接符</span><span><b>' + escHtml(seg.operatorBefore.op) + '</b>：' + escHtml(seg.operatorBefore.desc) + '</span></div>';
        if (seg.sudo) html += '<div class="se-line"><span class="se-tag">提权</span><span><b>sudo</b>：以管理员权限执行后续命令</span></div>';
        if (seg.command) {
            if (seg.knownCommand) {
                html += '<div class="se-line"><span class="se-tag">命令</span><span><b>' + escHtml(seg.command) + '</b>：' + escHtml(seg.commandDesc) + '</span></div>';
                if (seg.subcommand) html += '<div class="se-line"><span class="se-tag">子命令</span><span><b>' + escHtml(seg.subcommand) + '</b>：' + escHtml(seg.subcommandDesc) + '</span></div>';
            } else {
                html += '<div class="se-line se-unknown-line"><span class="se-tag">命令</span><span><b>' + escHtml(seg.command) + '</b>：未收录的命令，本工具词典暂未收录，含义未核实</span></div>';
            }
        }
        seg.flags.forEach(function (f) {
            if (f.known) html += '<div class="se-line"><span class="se-tag">旗标</span><span><b>' + escHtml(f.flag) + (f.value !== null && f.value !== undefined ? ' ' + escHtml(f.value) : '') + '</b>：' + escHtml(f.desc) + '</span></div>';
            else html += '<div class="se-line se-unknown-line"><span class="se-tag">旗标</span><span><b>' + escHtml(f.flag) + '</b>：未收录的旗标，本工具词典暂未收录，含义未核实</span></div>';
        });
        seg.positionals.forEach(function (p) {
            html += '<div class="se-line"><span class="se-tag">参数</span><span><b>' + escHtml(p.text) + '</b>：' + escHtml(p.desc) + '</span></div>';
        });
        seg.redirects.forEach(function (r) {
            html += '<div class="se-line"><span class="se-tag">重定向</span><span><b>' + escHtml(r.op + ' ' + r.target) + '</b>：' + escHtml(r.desc) + '</span></div>';
        });
        html += '</div>';
    });
    if (res.errors.length) {
        html += '<div class="se-warn">解析提示：' + res.errors.map(function (e) { return escHtml(e.message); }).join('；') + '</div>';
    }
    $('se-explain').innerHTML = html;
    /* 结构分解表 */
    var rows = '';
    res.segments.forEach(function (seg, idx) {
        rows += '<tr><td>' + (idx + 1) + '</td><td><code>' + escHtml(seg.command || '') + '</code></td><td>' + escHtml(seg.subcommand || '—') + '</td><td>' + escHtml(seg.flags.map(function (f) { return f.flag + (f.value !== null && f.value !== undefined ? ' ' + f.value : ''); }).join(' ') || '—') + '</td><td>' + escHtml(seg.positionals.map(function (p) { return p.text; }).join(' ') || '—') + '</td><td>' + escHtml(seg.redirects.map(function (r) { return r.op + ' ' + r.target; }).join(' ') || '—') + '</td><td>' + (seg.operatorBefore ? escHtml(seg.operatorBefore.op) : '—') + '</td></tr>';
    });
    $('se-table-wrap').innerHTML = '<table class="se-table"><thead><tr><th>#</th><th>命令</th><th>子命令</th><th>旗标</th><th>位置参数</th><th>重定向</th><th>连接符</th></tr></thead><tbody>' + rows + '</tbody></table>';
    /* 未收录 */
    if (res.unknown.length) {
        $('se-unknown').innerHTML = '<div class="se-unknown-box"><b>未收录（不编造）：</b><ul>' + res.unknown.map(function (u) {
            return '<li>' + (u.type === 'command' ? '未收录的命令：<code>' + escHtml(u.command) + '</code>' : '未收录的旗标：<code>' + escHtml(u.command + ' ' + u.flag) + '</code>') + ' —— 请自行查阅 man 页核实</li>';
        }).join('') + '</ul></div>';
    } else {
        $('se-unknown').innerHTML = '<div class="se-ok">本命令涉及的命令与旗标均已收录。</div>';
    }
}

function copyText() {
    var done = function () {
        var btn = $('se-copy');
        var old = btn.textContent;
        btn.textContent = '已复制 ✓';
        setTimeout(function () { btn.textContent = old; }, 1500);
    };
    if (!lastPlainText) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(lastPlainText).then(done, function () { fallbackCopy(); done(); });
    } else { fallbackCopy(); done(); }
}

function fallbackCopy() {
    var ta = document.createElement('textarea');
    ta.value = lastPlainText;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) { /* 忽略 */ }
    document.body.removeChild(ta);
}

function renderPresets() {
    $('se-presets').innerHTML = SAMPLES.map(function (s, i) {
        return '<button type="button" class="se-preset" data-sample="' + i + '">' + escHtml(s.name) + '<code>' + escHtml(s.cmd) + '</code></button>';
    }).join('');
    document.querySelectorAll('[data-sample]').forEach(function (btn) {
        btn.addEventListener('click', function () {
            $('se-input').value = SAMPLES[parseInt(btn.getAttribute('data-sample'), 10)].cmd;
            renderAll();
            $('se-input').focus();
        });
    });
}

function init() {
    renderPresets();
    var timer = null;
    $('se-input').addEventListener('input', function () {
        clearTimeout(timer);
        timer = setTimeout(renderAll, 200);
    });
    $('se-explain-btn').addEventListener('click', renderAll);
    $('se-clear').addEventListener('click', function () {
        $('se-input').value = '';
        renderAll();
        $('se-input').focus();
    });
    $('se-copy').addEventListener('click', copyText);
    $('se-input').value = SAMPLES[2].cmd;
    renderAll();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

}

})();
