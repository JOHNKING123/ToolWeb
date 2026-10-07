package tools

import (
	"encoding/json"
	"fmt"
	"io"
	"io/ioutil"
	"net"
	"net/http"
	"strconv"
	"strings"
	"time"

	"crypto/tls"

	"github.com/gin-gonic/gin"
)

// 域名查询API
// 不再依赖外部 whois 可执行文件（部署机上常缺失）：优先 RDAP HTTPS 查询
// （协议标准、带超时），失败时回退到代码内实现的 whois TCP/43 协议直查。
func HandleDomainCheckAPI(c *gin.Context) {
	domain := normalizeDomain(c.Query("domain"))
	if domain == "" || !strings.Contains(domain, ".") {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "msg": "请输入正确的域名，如 example.com"})
		return
	}

	registered, whoisText, err := queryDomainRDAP(domain)
	if err == nil {
		c.JSON(http.StatusOK, gin.H{
			"success":    true,
			"registered": registered,
			"whois":      whoisText,
			"source":     "rdap",
		})
		return
	}

	// RDAP 不可用时回退 whois 协议直查（代码实现，不依赖外部命令）
	raw, werr := queryWhoisTCP(domain, 0)
	if werr == nil && raw != "" {
		lower := strings.ToLower(raw)
		reg := !strings.Contains(lower, "no match") && !strings.Contains(lower, "not found") && !strings.Contains(lower, "no data found")
		c.JSON(http.StatusOK, gin.H{
			"success":    true,
			"registered": reg,
			"whois":      raw,
			"source":     "whois",
		})
		return
	}

	errMsg := err.Error()
	if werr != nil {
		errMsg += "; whois直查: " + werr.Error()
	}
	c.JSON(http.StatusOK, gin.H{"success": false, "msg": "域名查询失败", "error": errMsg})
}

// normalizeDomain 去掉协议/路径/端口，只保留域名本身
func normalizeDomain(raw string) string {
	d := strings.ToLower(strings.TrimSpace(raw))
	d = strings.TrimPrefix(d, "http://")
	d = strings.TrimPrefix(d, "https://")
	if idx := strings.IndexAny(d, "/?#"); idx >= 0 {
		d = d[:idx]
	}
	if idx := strings.LastIndex(d, ":"); idx >= 0 {
		d = d[:idx]
	}
	return strings.TrimSuffix(d, ".")
}

type rdapEvent struct {
	Action string `json:"eventAction"`
	Date   string `json:"eventDate"`
}

type rdapEntity struct {
	Roles      []string        `json:"roles"`
	VcardArray json.RawMessage `json:"vcardArray"`
}

type rdapResponse struct {
	LdhName     string `json:"ldhName"`
	Status      []string
	Events      []rdapEvent
	Entities    []rdapEntity
	Nameservers []struct {
		LdhName string `json:"ldhName"`
	} `json:"nameservers"`
}

// rdapEntityProp 从 vCard 数组里取指定属性（如 fn/email）
func rdapEntityProp(e rdapEntity, prop string) string {
	if len(e.VcardArray) == 0 {
		return ""
	}
	var card []json.RawMessage
	if err := json.Unmarshal(e.VcardArray, &card); err != nil || len(card) < 2 {
		return ""
	}
	var items [][]json.RawMessage
	if err := json.Unmarshal(card[1], &items); err != nil {
		return ""
	}
	for _, item := range items {
		if len(item) < 4 {
			continue
		}
		var name string
		if err := json.Unmarshal(item[0], &name); err != nil || name != prop {
			continue
		}
		var val string
		if err := json.Unmarshal(item[3], &val); err == nil {
			return val
		}
	}
	return ""
}

// queryDomainRDAP 通过 RDAP 查询域名注册信息，并整理成与前端
// parseWhois 正则兼容的类 whois 文本。返回 (是否已注册, 文本, 错误)。
func queryDomainRDAP(domain string) (bool, string, error) {
	client := &http.Client{Timeout: 12 * time.Second}
	req, err := http.NewRequest(http.MethodGet, "https://rdap.org/domain/"+domain, nil)
	if err != nil {
		return false, "", err
	}
	req.Header.Set("Accept", "application/rdap+json")
	resp, err := client.Do(req)
	if err != nil {
		return false, "", fmt.Errorf("RDAP请求失败: %w", err)
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return false, "", err
	}
	if resp.StatusCode == http.StatusNotFound {
		return false, "No match for domain \"" + strings.ToUpper(domain) + "\"", nil
	}
	if resp.StatusCode != http.StatusOK {
		return false, "", fmt.Errorf("RDAP返回HTTP %d", resp.StatusCode)
	}
	var rd rdapResponse
	if err := json.Unmarshal(body, &rd); err != nil {
		return false, "", fmt.Errorf("RDAP响应解析失败: %w", err)
	}

	var b strings.Builder
	name := rd.LdhName
	if name == "" {
		name = domain
	}
	b.WriteString("Domain Name: " + strings.ToUpper(name) + "\n")
	for _, st := range rd.Status {
		b.WriteString("Status: " + st + "\n")
	}
	for _, ev := range rd.Events {
		switch strings.ToLower(ev.Action) {
		case "registration":
			b.WriteString("Creation Date: " + ev.Date + "\n")
		case "expiration":
			b.WriteString("Expiry Date: " + ev.Date + "\n")
		case "last changed", "last update of rdap database":
			b.WriteString("Updated Date: " + ev.Date + "\n")
		}
	}
	for _, e := range rd.Entities {
		for _, role := range e.Roles {
			if role == "registrar" {
				if fn := rdapEntityProp(e, "fn"); fn != "" {
					b.WriteString("Registrar: " + fn + "\n")
				}
			}
			if role == "registrant" {
				if em := rdapEntityProp(e, "email"); em != "" {
					b.WriteString("Registrant Email: " + em + "\n")
				}
			}
		}
	}
	for _, ns := range rd.Nameservers {
		if ns.LdhName != "" {
			b.WriteString("Name Server: " + strings.ToUpper(ns.LdhName) + "\n")
		}
	}
	return true, b.String(), nil
}

var whoisServers = map[string]string{
	"com": "whois.verisign-grs.com",
	"net": "whois.verisign-grs.com",
	"org": "whois.pir.org",
	"info": "whois.identity.digital",
	"io":  "whois.nic.io",
	"co":  "whois.nic.co",
	"cn":  "whois.cnnic.cn",
	"jp":  "whois.jprs.jp",
	"uk":  "whois.nic.uk",
	"de":  "whois.denic.de",
	"au":  "whois.auda.org.au",
	"ca":  "whois.cira.ca",
	"xyz": "whois.nic.xyz",
	"top": "whois.nic.top",
}

// queryWhoisTCP 直接用 whois 协议（TCP 43）查询，不依赖外部可执行文件。
// depth 限制跟随 IANA refer 跳转的次数。
func queryWhoisTCP(domain string, depth int) (string, error) {
	tld := domain[strings.LastIndex(domain, ".")+1:]
	server, ok := whoisServers[tld]
	if !ok {
		server = "whois.iana.org"
	}
	d := net.Dialer{Timeout: 6 * time.Second}
	conn, err := d.Dial("tcp", server+":43")
	if err != nil {
		return "", fmt.Errorf("连接 %s 失败: %w", server, err)
	}
	defer conn.Close()
	_ = conn.SetDeadline(time.Now().Add(10 * time.Second))
	query := domain + "\r\n"
	if server == "whois.verisign-grs.com" {
		query = "= " + query // 请求完整记录而非摘要
	}
	if _, err := fmt.Fprintf(conn, "%s", query); err != nil {
		return "", err
	}
	body, err := io.ReadAll(io.LimitReader(conn, 128<<10))
	if err != nil {
		return "", err
	}
	text := string(body)
	// IANA 返回 refer 时跟随到权威 whois 服务器
	if depth < 1 {
		for _, line := range strings.Split(text, "\n") {
			line = strings.TrimSpace(line)
			if strings.HasPrefix(strings.ToLower(line), "refer:") {
				ref := strings.TrimSpace(line[len("refer:"):])
				if ref != "" && !strings.EqualFold(ref, server) {
					if raw, err := queryWhoisRef(domain, ref); err == nil && raw != "" {
						return raw, nil
					}
				}
			}
		}
	}
	return text, nil
}

func queryWhoisRef(domain, server string) (string, error) {
	d := net.Dialer{Timeout: 6 * time.Second}
	conn, err := d.Dial("tcp", server+":43")
	if err != nil {
		return "", err
	}
	defer conn.Close()
	_ = conn.SetDeadline(time.Now().Add(10 * time.Second))
	if _, err := fmt.Fprintf(conn, "%s\r\n", domain); err != nil {
		return "", err
	}
	body, err := io.ReadAll(io.LimitReader(conn, 128<<10))
	if err != nil {
		return "", err
	}
	return string(body), nil
}

// IP查询API
func HandleIPLookupAPI(c *gin.Context) {
	ip := c.Query("ip")
	if ip == "" {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "msg": "请输入IP地址"})
		return
	}
	// 使用ip-api.com免费接口
	resp, err := http.Get("http://ip-api.com/json/" + ip + "?lang=zh-CN")
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "msg": "查询失败", "error": err.Error()})
		return
	}
	defer resp.Body.Close()
	body, _ := ioutil.ReadAll(resp.Body)
	var data map[string]interface{}
	json.Unmarshal(body, &data)
	c.JSON(http.StatusOK, gin.H{"success": true, "data": data})
}

// 我的IP API
func HandleMyIPAPI(c *gin.Context) {
	ip := c.ClientIP()
	resp, err := http.Get("http://ip-api.com/json/" + ip + "?lang=zh-CN")
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "msg": "查询失败", "error": err.Error()})
		return
	}
	defer resp.Body.Close()
	body, _ := ioutil.ReadAll(resp.Body)
	var data map[string]interface{}
	json.Unmarshal(body, &data)
	c.JSON(http.StatusOK, gin.H{"success": true, "ip": ip, "data": data})
}

func parsePorts(ports string) []string {
	var result []string
	for _, part := range strings.Split(ports, ",") {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		if strings.Contains(part, "-") {
			segs := strings.SplitN(part, "-", 2)
			if len(segs) == 2 {
				start, err1 := strconv.Atoi(strings.TrimSpace(segs[0]))
				end, err2 := strconv.Atoi(strings.TrimSpace(segs[1]))
				if err1 == nil && err2 == nil && start <= end && start > 0 && end <= 65535 {
					for p := start; p <= end; p++ {
						result = append(result, strconv.Itoa(p))
					}
				}
			}
		} else {
			if _, err := strconv.Atoi(part); err == nil {
				result = append(result, part)
			}
		}
	}
	return result
}

// 端口扫描API
func HandlePortScanAPI(c *gin.Context) {
	host := c.Query("host")
	ports := c.Query("ports") // 逗号分隔，支持范围
	if host == "" || ports == "" {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "msg": "请输入主机和端口"})
		return
	}
	portList := parsePorts(ports)
	if len(portList) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "msg": "端口格式错误"})
		return
	}
	results := make([]map[string]interface{}, 0)
	for _, p := range portList {
		addr := net.JoinHostPort(host, p)
		conn, err := net.DialTimeout("tcp", addr, 1200*time.Millisecond)
		open := err == nil
		if conn != nil {
			conn.Close()
		}
		results = append(results, map[string]interface{}{"port": p, "open": open, "error": errStr(err)})
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "results": results})
}

func errStr(err error) string {
	if err == nil {
		return ""
	}
	return err.Error()
}

// Ping API（TCP 连通性/延迟探测）
// 部署环境通常没有 ICMP raw socket 权限（ping 命令会报 Operation not permitted），
// 因此改为对目标 443（失败再试 80）做 4 次 TCP 拨号计时，如实标注为 TCP 延迟，
// 不冒充 ICMP ping 的往返结果。
func HandlePingAPI(c *gin.Context) {
	host := strings.TrimSpace(c.Query("host"))
	host = strings.TrimPrefix(host, "http://")
	host = strings.TrimPrefix(host, "https://")
	if idx := strings.IndexAny(host, "/?#"); idx >= 0 {
		host = host[:idx]
	}
	if host == "" {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "msg": "请输入主机"})
		return
	}
	// 若用户带了端口（如 example.com:8443），按其端口探测
	probeHost, probePort := host, ""
	if h, p, err := net.SplitHostPort(host); err == nil {
		probeHost, probePort = h, p
	}

	ips, err := net.DefaultResolver.LookupIPAddr(c.Request.Context(), probeHost)
	if err != nil || len(ips) == 0 {
		c.JSON(http.StatusOK, gin.H{"success": false, "msg": "域名解析失败", "error": errStr(err)})
		return
	}
	ip := ips[0].IP.String()

	ports := []string{probePort}
	if probePort == "" {
		ports = []string{"443", "80"}
	}

	const attempts = 4
	var results []float64
	var usedPort string
	var lastErr error
	for _, port := range ports {
		results = nil
		for i := 0; i < attempts; i++ {
			start := time.Now()
			conn, err := net.DialTimeout("tcp", net.JoinHostPort(ip, port), 3*time.Second)
			if err != nil {
				lastErr = err
				continue
			}
			results = append(results, float64(time.Since(start).Microseconds())/1000.0)
			conn.Close()
		}
		if len(results) > 0 {
			usedPort = port
			break
		}
	}

	var b strings.Builder
	b.WriteString(fmt.Sprintf("TCP 延迟探测（非 ICMP ping）：目标 %s (%s) 端口 %s\n", probeHost, ip, firstNonEmpty(usedPort, ports[0])))
	if len(results) == 0 {
		b.WriteString(fmt.Sprintf("sent = %d, received = 0, lost = %d (100%% 丢失)\n", attempts, attempts))
		b.WriteString("目标端口不可达或连接超时")
		c.JSON(http.StatusOK, gin.H{
			"success":   false,
			"reachable": false,
			"method":    "tcp",
			"output":    b.String(),
			"msg":       "目标不可达（TCP 探测）",
			"error":     errStr(lastErr),
		})
		return
	}

	min, max, sum := results[0], results[0], 0.0
	for i, r := range results {
		b.WriteString(fmt.Sprintf("reply from %s port %s: time=%.1f ms\n", ip, usedPort, r))
		if r < min {
			min = r
		}
		if r > max {
			max = r
		}
		sum += r
		_ = i
	}
	avg := sum / float64(len(results))
	b.WriteString(fmt.Sprintf("statistics: sent = %d, received = %d, lost = %d (%.0f%% 丢失)\n", attempts, len(results), attempts-len(results), float64(attempts-len(results))/float64(attempts)*100))
	b.WriteString(fmt.Sprintf("round-trip min/avg/max = %.1f/%.1f/%.1f ms", min, avg, max))
	c.JSON(http.StatusOK, gin.H{
		"success":   true,
		"reachable": true,
		"method":    "tcp",
		"port":      usedPort,
		"avg_ms":    avg,
		"output":    b.String(),
	})
}

func firstNonEmpty(a, b string) string {
	if a != "" {
		return a
	}
	return b
}

// DNS查询API
func HandleDNSLookupAPI(c *gin.Context) {
	domain := c.Query("domain")
	if domain == "" {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "msg": "请输入域名"})
		return
	}
	result := map[string]interface{}{}
	// A记录
	ips, _ := net.LookupHost(domain)
	result["A"] = ips
	// AAAA记录
	ips6, _ := net.LookupIP(domain)
	var v6s []string
	for _, ip := range ips6 {
		if ip.To4() == nil {
			v6s = append(v6s, ip.String())
		}
	}
	result["AAAA"] = v6s
	// CNAME
	cname, _ := net.LookupCNAME(domain)
	result["CNAME"] = cname
	// MX
	mxs, _ := net.LookupMX(domain)
	var mxList []string
	for _, mx := range mxs {
		mxList = append(mxList, mx.Host)
	}
	result["MX"] = mxList
	// NS
	nss, _ := net.LookupNS(domain)
	var nsList []string
	for _, ns := range nss {
		nsList = append(nsList, ns.Host)
	}
	result["NS"] = nsList
	c.JSON(http.StatusOK, gin.H{"success": true, "result": result})
}

// SSL证书检测API
func HandleSSLCheckAPI(c *gin.Context) {
	domain := c.Query("domain")
	if domain == "" {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "msg": "请输入域名"})
		return
	}
	addr := domain + ":443"
	conn, err := tls.Dial("tcp", addr, &tls.Config{InsecureSkipVerify: true})
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "msg": "无法连接SSL", "error": err.Error()})
		return
	}
	defer conn.Close()
	cert := conn.ConnectionState().PeerCertificates[0]
	c.JSON(http.StatusOK, gin.H{"success": true, "cert": map[string]interface{}{
		"subject":         cert.Subject.String(),
		"issuer":          cert.Issuer.String(),
		"not_before":      cert.NotBefore.Format("2006-01-02 15:04:05"),
		"not_after":       cert.NotAfter.Format("2006-01-02 15:04:05"),
		"dns_names":       cert.DNSNames,
		"serial_number":   cert.SerialNumber.String(),
		"sig_algo":        cert.SignatureAlgorithm.String(),
		"public_key_algo": cert.PublicKeyAlgorithm.String(),
	}})
}
