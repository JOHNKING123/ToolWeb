package main

import (
	"bytes"
	"net/http"
	"strconv"
	"strings"
)

// /tool-web 挂载支持
//
// 本应用的全部路由与页面链接都以 /tools 为前缀（例如 /tools/index、
// /tools/<tool>、/tools/static/...、/tools/api/...）。为了让同一份程序
// 还能挂在 /tool-web 路径下对外提供服务（例如与另一份部署在同一域名
// 下、靠路径区分），这里在 HTTP 层做双向映射：
//
//   - 入站：/tool-web/<x> 改写为 /tools/<x> 后再交给原路由处理；
//   - 出站：文本类响应（HTML/CSS/JS/JSON/XML）正文里出现的 /tools/
//     前缀改写回 /tool-web/，重定向的 Location 头同理。
//
// 原有 /tools/... 访问完全不受影响，两种路径可以同时使用。

const (
	toolWebMountPrefix    = "/tool-web"
	toolWebInternalPrefix = "/tools"
)

// withToolWebMount 把 /tool-web 挂载映射包在原 handler 外层。
func withToolWebMount(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		p := r.URL.Path
		if p == toolWebMountPrefix || p == toolWebMountPrefix+"/" {
			http.Redirect(w, r, toolWebMountPrefix+"/index", http.StatusFound)
			return
		}
		if !strings.HasPrefix(p, toolWebMountPrefix+"/") {
			next.ServeHTTP(w, r)
			return
		}

		// 入站改写：/tool-web/<x> -> /tools/<x>
		r2 := new(http.Request)
		*r2 = *r
		urlCopy := *r.URL
		urlCopy.Path = toolWebInternalPrefix + strings.TrimPrefix(p, toolWebMountPrefix)
		if urlCopy.RawPath != "" {
			urlCopy.RawPath = toolWebInternalPrefix + strings.TrimPrefix(urlCopy.RawPath, toolWebMountPrefix)
		}
		r2.URL = &urlCopy

		rw := &toolWebRewriteWriter{ResponseWriter: w}
		next.ServeHTTP(rw, r2)
		rw.flush()
	})
}

// toolWebRewriteWriter 缓冲文本类响应，flush 时把正文中的 /tools/
// 前缀改写为 /tool-web/；二进制响应（图片、文件下载等）直接透传。
type toolWebRewriteWriter struct {
	http.ResponseWriter
	status      int
	wroteHeader bool
	buffering   bool
	decided     bool
	buf         bytes.Buffer
}

func isTextualContentType(ct string) bool {
	if ct == "" {
		// Gin 的 HTML 渲染在写正文前会设置 text/html；到 Write 时仍为空
		// 的情况按文本处理，避免漏改页面里的链接。
		return true
	}
	ct = strings.ToLower(ct)
	return strings.Contains(ct, "text/") ||
		strings.Contains(ct, "javascript") ||
		strings.Contains(ct, "json") ||
		strings.Contains(ct, "xml")
}

func rewriteToolWebBody(b []byte) []byte {
	return bytes.ReplaceAll(b, []byte(toolWebInternalPrefix+"/"), []byte(toolWebMountPrefix+"/"))
}

func (w *toolWebRewriteWriter) rewriteLocationHeader() {
	h := w.Header()
	if loc := h.Get("Location"); strings.HasPrefix(loc, toolWebInternalPrefix+"/") {
		h.Set("Location", toolWebMountPrefix+strings.TrimPrefix(loc, toolWebInternalPrefix))
	} else if loc == toolWebInternalPrefix {
		h.Set("Location", toolWebMountPrefix)
	}
}

func (w *toolWebRewriteWriter) WriteHeader(code int) {
	if w.wroteHeader {
		return
	}
	w.wroteHeader = true
	w.status = code
	// 延迟真正写出，等第一次 Write 时按内容类型决定缓冲还是透传；
	// 若整个响应没有正文，flush 时统一补写。
}

func (w *toolWebRewriteWriter) Write(b []byte) (int, error) {
	if !w.wroteHeader {
		w.WriteHeader(http.StatusOK)
	}
	if !w.decided {
		w.decided = true
		w.buffering = isTextualContentType(w.Header().Get("Content-Type"))
		if !w.buffering {
			w.rewriteLocationHeader()
			w.ResponseWriter.WriteHeader(w.status)
		}
	}
	if w.buffering {
		return w.buf.Write(b)
	}
	return w.ResponseWriter.Write(b)
}

func (w *toolWebRewriteWriter) flush() {
	if !w.wroteHeader {
		w.WriteHeader(http.StatusOK)
	}
	if w.decided && !w.buffering {
		return // 已透传
	}
	body := rewriteToolWebBody(w.buf.Bytes())
	h := w.Header()
	w.rewriteLocationHeader()
	h.Del("ETag") // 正文已改写，原 ETag 不再对应
	if h.Get("Content-Length") != "" || w.buf.Len() > 0 {
		h.Set("Content-Length", strconv.Itoa(len(body)))
	}
	w.ResponseWriter.WriteHeader(w.status)
	if len(body) > 0 {
		_, _ = w.ResponseWriter.Write(body)
	}
}
