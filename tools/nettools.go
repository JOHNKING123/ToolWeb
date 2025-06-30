package tools

import (
	"encoding/json"
	"io/ioutil"
	"net"
	"net/http"
	"os/exec"
	"strconv"
	"strings"
	"time"

	"crypto/tls"

	"github.com/gin-gonic/gin"
)

// 域名查询API
func HandleDomainCheckAPI(c *gin.Context) {
	domain := c.Query("domain")
	if domain == "" {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "msg": "请输入域名"})
		return
	}
	// whois命令查询
	out, err := exec.Command("whois", domain).CombinedOutput()
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "msg": "whois查询失败", "error": err.Error()})
		return
	}
	result := string(out)
	registered := !strings.Contains(strings.ToLower(result), "no match") && !strings.Contains(strings.ToLower(result), "not found")
	c.JSON(http.StatusOK, gin.H{
		"success":    true,
		"registered": registered,
		"whois":      result,
	})
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

// Ping API（简单shell调用）
func HandlePingAPI(c *gin.Context) {
	host := c.Query("host")
	if host == "" {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "msg": "请输入主机"})
		return
	}
	out, err := exec.Command("ping", "-c", "4", host).CombinedOutput()
	if err != nil && len(out) == 0 {
		c.JSON(http.StatusOK, gin.H{"success": false, "msg": "Ping失败", "error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "output": string(out)})
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
